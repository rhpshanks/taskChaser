import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDb } from './db/index.js';
import { buildEmail } from './email.js';
import { renderChooser, renderConfirmation, renderError } from './pages.js';
import { ALL_STATUSES, PRIORITIES, RESPONSE_ACTIONS, STATUS, deriveStatus } from './domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Pick up a local .env before anything reads configuration from the environment.
// A real host supplies these itself, so a missing file is the normal case.
// Skipped under test so a developer's real credentials can never be picked up
// by the suite and pointed at live data.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(path.resolve(here, '../../.env'));
  } catch {
    /* no .env, carry on */
  }
}

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_DIST = path.resolve(here, '../../client/dist');

/**
 * On Vercel (and any Lambda-style host) the deployment is read-only apart from
 * `/tmp`, and that `/tmp` belongs to one instance and is wiped when it recycles.
 * Falling back to it keeps the app booting instead of crashing on first write,
 * but the data is NOT durable, so the client is told to warn about it.
 */
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : SERVERLESS
    ? '/tmp/taskchaser'
    : path.resolve(here, '../data');

const db = createDb({
  dataDir: DATA_DIR,
  durable: !SERVERLESS || Boolean(process.env.DATA_DIR),
});

const STORAGE = { durable: db.durable, backend: db.kind, dir: db.location };

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.disable('x-powered-by');

// Behind a proxy (Vercel, any reverse proxy) req.protocol reads as plain http
// unless X-Forwarded-Proto is trusted, which would put http:// links into the
// email for an https-only deployment.
if (SERVERLESS || process.env.TRUST_PROXY === '1') app.set('trust proxy', true);

// The Vite dev server runs on another origin; in production the client is
// served from here and this is a no-op.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TC-User');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ------------------------------------------------------------------ utils */

const uid = () => crypto.randomUUID();
const token = () => crypto.randomBytes(12).toString('base64url');
const now = () => new Date().toISOString();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Express 4 does not forward a rejected promise to the error handler, so every
 * async route goes through this. Without it a failed database call would hang
 * the request instead of returning a readable error.
 */
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const bad = (msg) => {
  throw new HttpError(400, msg);
};

function str(value, field, { required = true, max = 500 } = {}) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (!out && required) bad(`${field} is required.`);
  if (out.length > max) bad(`${field} must be under ${max} characters.`);
  return out;
}

function email(value, field = 'Email') {
  const out = str(value, field).toLowerCase();
  // Deliberately permissive: enough to catch typos, not a spec implementation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out)) bad(`${field} does not look like a valid address.`);
  return out;
}

function isoDate(value, field = 'Due date') {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) bad(`${field} is not a valid date.`);
  return date.toISOString();
}

/**
 * The address the three email links point at. People click these hours or days
 * later, so it has to be stable: Vercel's per-deployment URL changes on every
 * push, which would quietly break every link already sitting in an inbox.
 * Hence the production domain is preferred over whatever host served this call.
 */
function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${req.protocol}://${host}`;
}

/* ------------------------------------------------- live dashboard updates */

/** userId -> Set<res>. Every mutation for a user is pushed to their open tabs. */
const streams = new Map();

function broadcast(userId, payload) {
  const set = streams.get(userId);
  if (!set) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch {
      set.delete(res);
    }
  }
}

async function logEvent(userId, { taskId = null, type, message, actor }) {
  return db.addEvent({ id: uid(), ownerId: userId, taskId, type, message, actor, createdAt: now() });
}

/* ------------------------------------------------------------------ model */

function touch(task) {
  task.status = deriveStatus(task);
  task.updatedAt = now();
  return task;
}

/** Loads a member and confirms it belongs to this workspace before use. */
async function memberOf(userId, id) {
  if (!id) return null;
  const member = await db.getMember(id);
  return member && member.ownerId === userId ? member : null;
}

/** Loads a task and confirms it belongs to this workspace before use. */
async function taskOf(userId, id) {
  const task = await db.getTask(id);
  return task && task.ownerId === userId ? task : null;
}

function shapeTask(task) {
  return { ...task, status: deriveStatus(task) };
}

async function snapshot(userId) {
  const [members, tasks, events] = await Promise.all([
    db.listMembers(userId),
    db.listTasks(userId),
    db.listEvents(userId, 60),
  ]);
  return { members, tasks: tasks.map(shapeTask), events };
}

/** Push the fresh state to every dashboard this instance is holding open. */
async function commit(userId) {
  broadcast(userId, { type: 'sync', ...(await snapshot(userId)) });
}

/* ------------------------------------------------------------------- auth */

async function requireUser(req) {
  // EventSource cannot set headers, so the SSE stream passes the id as `?u=`.
  const id = req.get('X-TC-User') || (typeof req.query.u === 'string' ? req.query.u : '');
  const user = id ? await db.getUserById(id) : null;
  if (!user) throw new HttpError(401, 'Sign in again to continue.');
  return user;
}

/**
 * Sign-in is identity-only by design: the brief calls for name, title and email
 * with no password step. Anyone who can reach the server can claim an identity,
 * so run it on a trusted network or put a real auth layer in front of it.
 */
app.post(
  '/api/session',
  route(async (req, res) => {
    const fullName = str(req.body?.fullName, 'Full name', { max: 120 });
    const title = str(req.body?.title, 'Title', { max: 120 });
    const address = email(req.body?.email);

    const existing = await db.getUserByEmail(address);
    const user = existing
      ? { ...existing, fullName, title }
      : { id: uid(), fullName, title, email: address, createdAt: now() };

    await db.saveUser(user);
    res.json({ user, storage: STORAGE, ...(await snapshot(user.id)) });
  }),
);

app.get(
  '/api/bootstrap',
  route(async (req, res) => {
    const user = await requireUser(req);
    res.json({ user, storage: STORAGE, ...(await snapshot(user.id)) });
  }),
);

/* ---------------------------------------------------------------- members */

app.post(
  '/api/members',
  route(async (req, res) => {
    const user = await requireUser(req);
    const name = str(req.body?.name, 'Name', { max: 120 });
    const address = email(req.body?.email);
    const role = str(req.body?.role, 'Role', { required: false, max: 120 });

    const clash = await db.getMemberByEmail(user.id, address);
    if (clash) throw new HttpError(409, `${clash.name} is already on your team with that email.`);

    const member = { id: uid(), ownerId: user.id, name, email: address, role, createdAt: now() };
    await db.saveMember(member);
    await logEvent(user.id, {
      type: 'member_added',
      message: `${name} joined the team`,
      actor: user.fullName,
    });
    await commit(user.id);
    res.status(201).json(member);
  }),
);

app.patch(
  '/api/members/:id',
  route(async (req, res) => {
    const user = await requireUser(req);
    const member = await memberOf(user.id, req.params.id);
    if (!member) throw new HttpError(404, 'Team member not found.');

    if (req.body?.name !== undefined) member.name = str(req.body.name, 'Name', { max: 120 });
    if (req.body?.role !== undefined) member.role = str(req.body.role, 'Role', { required: false, max: 120 });
    if (req.body?.email !== undefined) {
      const address = email(req.body.email);
      const clash = await db.getMemberByEmail(user.id, address);
      if (clash && clash.id !== member.id) throw new HttpError(409, `${clash.name} already uses that email.`);
      member.email = address;
    }

    await db.saveMember(member);
    await commit(user.id);
    res.json(member);
  }),
);

app.delete(
  '/api/members/:id',
  route(async (req, res) => {
    const user = await requireUser(req);
    const member = await memberOf(user.id, req.params.id);
    if (!member) throw new HttpError(404, 'Team member not found.');

    await db.deleteMember(member.id);

    // Their tasks survive the person leaving; they just fall back to unassigned.
    const tasks = await db.listTasks(user.id);
    await Promise.all(
      tasks
        .filter((task) => task.assigneeId === member.id)
        .map((task) =>
          db.saveTask(
            touch({ ...task, assigneeId: null, notifiedAt: null, respondedAt: null, responseNote: '' }),
          ),
        ),
    );

    await logEvent(user.id, {
      type: 'member_removed',
      message: `${member.name} was removed from the team`,
      actor: user.fullName,
    });
    await commit(user.id);
    res.status(204).end();
  }),
);

/* ------------------------------------------------------------------ tasks */

app.post(
  '/api/tasks',
  route(async (req, res) => {
    const user = await requireUser(req);
    const title = str(req.body?.title, 'Task', { max: 300 });
    const notes = str(req.body?.notes, 'Notes', { required: false, max: 2000 });
    const dueAt = isoDate(req.body?.dueAt);
    const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'normal';

    let assigneeId = null;
    if (req.body?.assigneeId) {
      const member = await memberOf(user.id, req.body.assigneeId);
      if (!member) throw new HttpError(404, 'That team member no longer exists.');
      assigneeId = member.id;
    }

    const task = touch({
      id: uid(),
      ownerId: user.id,
      title,
      notes,
      dueAt,
      priority,
      assigneeId,
      status: STATUS.UNASSIGNED,
      responseToken: token(),
      notifiedAt: null,
      respondedAt: null,
      responseNote: '',
      createdAt: now(),
      updatedAt: now(),
      completedAt: null,
    });

    await db.saveTask(task);
    await logEvent(user.id, {
      taskId: task.id,
      type: 'task_created',
      message: `Created "${title}"`,
      actor: user.fullName,
    });
    await commit(user.id);
    res.status(201).json(shapeTask(task));
  }),
);

app.patch(
  '/api/tasks/:id',
  route(async (req, res) => {
    const user = await requireUser(req);
    const task = await taskOf(user.id, req.params.id);
    if (!task) throw new HttpError(404, 'Task not found.');

    if (req.body?.title !== undefined) task.title = str(req.body.title, 'Task', { max: 300 });
    if (req.body?.notes !== undefined) task.notes = str(req.body.notes, 'Notes', { required: false, max: 2000 });
    if (req.body?.dueAt !== undefined) task.dueAt = isoDate(req.body.dueAt);
    if (req.body?.priority !== undefined && PRIORITIES.includes(req.body.priority)) {
      task.priority = req.body.priority;
    }

    const pending = [];

    if (req.body?.assigneeId !== undefined) {
      const nextId = req.body.assigneeId || null;
      const member = nextId ? await memberOf(user.id, nextId) : null;
      if (nextId && !member) throw new HttpError(404, 'That team member no longer exists.');

      if (nextId !== task.assigneeId) {
        // A new owner has not answered yet, so the previous answer must not linger.
        task.assigneeId = nextId;
        task.notifiedAt = null;
        task.respondedAt = null;
        task.responseNote = '';
        if (task.status !== STATUS.DONE) task.status = STATUS.UNASSIGNED;
        if (member) {
          pending.push({
            taskId: task.id,
            type: 'task_assigned',
            message: `"${task.title}" assigned to ${member.name}`,
            actor: user.fullName,
          });
        }
      }
    }

    if (req.body?.status !== undefined) {
      if (!ALL_STATUSES.includes(req.body.status)) bad('Unknown status.');
      task.status = req.body.status;
      task.completedAt = req.body.status === STATUS.DONE ? now() : null;
      if (req.body.status === STATUS.DONE) {
        pending.push({
          taskId: task.id,
          type: 'task_done',
          message: `"${task.title}" marked done`,
          actor: user.fullName,
        });
      }
    }

    touch(task);
    await db.saveTask(task);
    for (const event of pending) await logEvent(user.id, event);
    await commit(user.id);
    res.json(shapeTask(task));
  }),
);

app.delete(
  '/api/tasks/:id',
  route(async (req, res) => {
    const user = await requireUser(req);
    const task = await taskOf(user.id, req.params.id);
    if (!task) throw new HttpError(404, 'Task not found.');

    await db.deleteTask(task.id);
    await db.deleteEventsForTask(task.id);
    await commit(user.id);
    res.status(204).end();
  }),
);

/**
 * Hands the client a ready-to-open `mailto:` URL and flips the task to
 * "awaiting". No mail is sent from here on purpose: the message leaves from the
 * user's own Outlook, so replies and threading stay in their mailbox.
 */
app.post(
  '/api/tasks/:id/notify',
  route(async (req, res) => {
    const user = await requireUser(req);
    const task = await taskOf(user.id, req.params.id);
    if (!task) throw new HttpError(404, 'Task not found.');
    if (!task.assigneeId) throw new HttpError(409, 'Assign this task to someone before informing them.');

    const member = await memberOf(user.id, task.assigneeId);
    if (!member) throw new HttpError(409, 'That team member no longer exists.');

    if (!task.responseToken) task.responseToken = token();

    const draft = buildEmail({
      task,
      member,
      owner: user,
      baseUrl: publicBaseUrl(req),
      timeZone: typeof req.body?.timeZone === 'string' ? req.body.timeZone : undefined,
    });

    task.notifiedAt = now();
    task.respondedAt = null;
    task.responseNote = '';
    touch(task);

    await db.saveTask(task);
    await logEvent(user.id, {
      taskId: task.id,
      type: 'task_notified',
      message: `${member.name} was emailed about "${task.title}"`,
      actor: user.fullName,
    });
    await commit(user.id);

    res.json({ ...draft, task: shapeTask(task) });
  }),
);

/* ------------------------------------------------------------------- feed */

app.get(
  '/api/stream',
  route(async (req, res) => {
    const user = await requireUser(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'sync', ...(await snapshot(user.id)) })}\n\n`);

    if (!streams.has(user.id)) streams.set(user.id, new Set());
    streams.get(user.id).add(res);

    // Proxies drop idle connections; a comment frame keeps the pipe warm.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      streams.get(user.id)?.delete(res);
    });
  }),
);

/* -------------------------------------------------- email response landing */

async function findByToken(value) {
  const task = await db.getTaskByToken(value);
  if (!task) return null;
  const member = task.assigneeId ? await db.getMember(task.assigneeId) : null;
  return { task, member };
}

app.get(
  '/r/:token',
  route(async (req, res) => {
    const found = await findByToken(req.params.token);
    if (!found) {
      return res
        .status(404)
        .type('html')
        .send(
          renderError({ title: 'Link expired', message: 'This task link is no longer valid. Ask for a fresh one.' }),
        );
    }
    res.type('html').send(renderChooser({ task: found.task, member: found.member ?? { name: '' } }));
  }),
);

app.get(
  '/r/:token/:action',
  route(async (req, res) => {
    const action = req.params.action;
    const meta = RESPONSE_ACTIONS[action];
    const found = meta ? await findByToken(req.params.token) : null;

    if (!meta || !found) {
      return res
        .status(404)
        .type('html')
        .send(
          renderError({ title: 'Link expired', message: 'This task link is no longer valid. Ask for a fresh one.' }),
        );
    }

    const { task, member } = found;
    const who = member?.name ?? 'Someone';
    const changed = task.status !== meta.status;

    task.status = meta.status;
    task.respondedAt = now();
    task.completedAt = null;
    task.updatedAt = now();

    await db.saveTask(task);

    if (changed) {
      await logEvent(task.ownerId, {
        taskId: task.id,
        type: 'task_response',
        message: `${who} answered "${meta.label}" on "${task.title}"`,
        actor: who,
      });
    }
    await commit(task.ownerId);

    res.type('html').send(
      renderConfirmation({
        action,
        task,
        member: member ?? { name: '' },
        otherActions: Object.keys(RESPONSE_ACTIONS).filter((slug) => slug !== action),
        saved: { note: task.responseNote },
      }),
    );
  }),
);

app.post(
  '/r/:token/:action/note',
  route(async (req, res) => {
    const action = req.params.action;
    const meta = RESPONSE_ACTIONS[action];
    const found = meta ? await findByToken(req.params.token) : null;

    if (!meta || !found) {
      return res
        .status(404)
        .type('html')
        .send(renderError({ title: 'Link expired', message: 'This task link is no longer valid.' }));
    }

    const { task, member } = found;
    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    const who = member?.name ?? 'Someone';

    if (note !== task.responseNote) {
      task.responseNote = note;
      task.updatedAt = now();
      await db.saveTask(task);
      if (note) {
        await logEvent(task.ownerId, {
          taskId: task.id,
          type: 'note_added',
          message: `${who} added a note: "${note.length > 90 ? `${note.slice(0, 90)}...` : note}"`,
          actor: who,
        });
      }
      await commit(task.ownerId);
    }

    res.type('html').send(
      renderConfirmation({
        action,
        task,
        member: member ?? { name: '' },
        otherActions: Object.keys(RESPONSE_ACTIONS).filter((slug) => slug !== action),
        saved: { note: task.responseNote, noteSaved: true },
      }),
    );
  }),
);

/* --------------------------------------------------------- static + errors */

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, at: now(), serverless: SERVERLESS, storage: STORAGE }),
);

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/r/')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
app.use((err, req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

/* ---------------------------------------------------------------- startup */

// A serverless host invokes the exported handler itself; there is no port to bind.
if (process.env.NODE_ENV !== 'test' && !SERVERLESS) {
  app.listen(PORT, () => {
    console.log(`\n  TaskChaser server  →  http://localhost:${PORT}`);
    console.log(`  Response links use →  ${process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`}`);
    if (!fs.existsSync(CLIENT_DIST)) {
      console.log(`  Dashboard          →  http://localhost:5173 (run \`npm run dev\`)`);
    }
    console.log(`  Storage            →  ${db.kind === 'instant' ? db.location : path.join(DATA_DIR, 'taskchaser.json')}\n`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      try {
        db.flushNow();
      } catch {
        /* best effort on the way out */
      }
      process.exit(0);
    });
  }
}

export { app, db };
