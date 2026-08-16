import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.js';
import { buildEmail } from './email.js';
import { renderChooser, renderConfirmation, renderError } from './pages.js';
import { ALL_STATUSES, PRIORITIES, RESPONSE_ACTIONS, STATUS, deriveStatus } from './domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const DATA_DIR = path.resolve(here, '..', process.env.DATA_DIR ?? './data');
const CLIENT_DIST = path.resolve(here, '../../client/dist');

const store = createStore({ dataDir: DATA_DIR });
const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.disable('x-powered-by');

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

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
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

function logEvent(userId, { taskId = null, type, message, actor }) {
  const event = { id: uid(), ownerId: userId, taskId, type, message, actor, createdAt: now() };
  store.data.events.unshift(event);
  // The activity feed is a rolling window, not an audit log.
  if (store.data.events.length > 500) store.data.events.length = 500;
  return event;
}

/* ------------------------------------------------------------------ model */

function touch(task) {
  task.status = deriveStatus(task);
  task.updatedAt = now();
  return task;
}

const memberOf = (userId, id) =>
  store.data.members.find((m) => m.id === id && m.ownerId === userId) ?? null;

function shapeTask(task) {
  return { ...task, status: deriveStatus(task) };
}

function snapshot(userId) {
  return {
    members: store.data.members.filter((m) => m.ownerId === userId),
    tasks: store.data.tasks.filter((t) => t.ownerId === userId).map(shapeTask),
    events: store.data.events.filter((e) => e.ownerId === userId).slice(0, 60),
  };
}

/** Persist, then push the fresh snapshot to every open dashboard. */
function commit(userId) {
  store.save();
  broadcast(userId, { type: 'sync', ...snapshot(userId) });
}

/* ------------------------------------------------------------------- auth */

function requireUser(req) {
  // EventSource cannot set headers, so the SSE stream passes the id as `?u=`.
  const id = req.get('X-TC-User') || (typeof req.query.u === 'string' ? req.query.u : '');
  const user = id ? store.data.users.find((u) => u.id === id) : null;
  if (!user) throw new HttpError(401, 'Sign in again to continue.');
  return user;
}

/**
 * Sign-in is identity-only by design: the brief calls for name, title and email
 * with no password step. Anyone who can reach the server can claim an identity,
 * so run it on a trusted network or put a real auth layer in front of it.
 */
app.post('/api/session', (req, res) => {
  const fullName = str(req.body?.fullName, 'Full name', { max: 120 });
  const title = str(req.body?.title, 'Title', { max: 120 });
  const address = email(req.body?.email);

  let user = store.data.users.find((u) => u.email === address);
  if (user) {
    user.fullName = fullName;
    user.title = title;
  } else {
    user = { id: uid(), fullName, title, email: address, createdAt: now() };
    store.data.users.push(user);
  }
  store.save();
  res.json({ user, ...snapshot(user.id) });
});

app.get('/api/bootstrap', (req, res) => {
  const user = requireUser(req);
  res.json({ user, ...snapshot(user.id) });
});

/* ---------------------------------------------------------------- members */

app.post('/api/members', (req, res) => {
  const user = requireUser(req);
  const name = str(req.body?.name, 'Name', { max: 120 });
  const address = email(req.body?.email);
  const role = str(req.body?.role, 'Role', { required: false, max: 120 });

  const clash = store.data.members.find((m) => m.ownerId === user.id && m.email === address);
  if (clash) throw new HttpError(409, `${clash.name} is already on your team with that email.`);

  const member = { id: uid(), ownerId: user.id, name, email: address, role, createdAt: now() };
  store.data.members.push(member);
  logEvent(user.id, { type: 'member_added', message: `${name} joined the team`, actor: user.fullName });
  commit(user.id);
  res.status(201).json(member);
});

app.patch('/api/members/:id', (req, res) => {
  const user = requireUser(req);
  const member = memberOf(user.id, req.params.id);
  if (!member) throw new HttpError(404, 'Team member not found.');

  if (req.body?.name !== undefined) member.name = str(req.body.name, 'Name', { max: 120 });
  if (req.body?.role !== undefined) member.role = str(req.body.role, 'Role', { required: false, max: 120 });
  if (req.body?.email !== undefined) {
    const address = email(req.body.email);
    const clash = store.data.members.find(
      (m) => m.ownerId === user.id && m.email === address && m.id !== member.id,
    );
    if (clash) throw new HttpError(409, `${clash.name} already uses that email.`);
    member.email = address;
  }
  commit(user.id);
  res.json(member);
});

app.delete('/api/members/:id', (req, res) => {
  const user = requireUser(req);
  const member = memberOf(user.id, req.params.id);
  if (!member) throw new HttpError(404, 'Team member not found.');

  store.data.members = store.data.members.filter((m) => m.id !== member.id);
  // Their tasks survive the person leaving; they just fall back to unassigned.
  for (const task of store.data.tasks) {
    if (task.assigneeId === member.id) {
      task.assigneeId = null;
      task.notifiedAt = null;
      task.respondedAt = null;
      task.responseNote = '';
      touch(task);
    }
  }
  logEvent(user.id, {
    type: 'member_removed',
    message: `${member.name} was removed from the team`,
    actor: user.fullName,
  });
  commit(user.id);
  res.status(204).end();
});

/* ------------------------------------------------------------------ tasks */

app.post('/api/tasks', (req, res) => {
  const user = requireUser(req);
  const title = str(req.body?.title, 'Task', { max: 300 });
  const notes = str(req.body?.notes, 'Notes', { required: false, max: 2000 });
  const dueAt = isoDate(req.body?.dueAt);
  const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'normal';

  let assigneeId = null;
  if (req.body?.assigneeId) {
    const member = memberOf(user.id, req.body.assigneeId);
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

  store.data.tasks.unshift(task);
  logEvent(user.id, { taskId: task.id, type: 'task_created', message: `Created "${title}"`, actor: user.fullName });
  commit(user.id);
  res.status(201).json(shapeTask(task));
});

app.patch('/api/tasks/:id', (req, res) => {
  const user = requireUser(req);
  const task = store.data.tasks.find((t) => t.id === req.params.id && t.ownerId === user.id);
  if (!task) throw new HttpError(404, 'Task not found.');

  if (req.body?.title !== undefined) task.title = str(req.body.title, 'Task', { max: 300 });
  if (req.body?.notes !== undefined) task.notes = str(req.body.notes, 'Notes', { required: false, max: 2000 });
  if (req.body?.dueAt !== undefined) task.dueAt = isoDate(req.body.dueAt);
  if (req.body?.priority !== undefined && PRIORITIES.includes(req.body.priority)) {
    task.priority = req.body.priority;
  }

  if (req.body?.assigneeId !== undefined) {
    const nextId = req.body.assigneeId || null;
    if (nextId && !memberOf(user.id, nextId)) throw new HttpError(404, 'That team member no longer exists.');
    if (nextId !== task.assigneeId) {
      // A new owner has not answered yet, so the previous answer must not linger.
      task.assigneeId = nextId;
      task.notifiedAt = null;
      task.respondedAt = null;
      task.responseNote = '';
      if (task.status !== STATUS.DONE) task.status = STATUS.UNASSIGNED;
      if (nextId) {
        const member = memberOf(user.id, nextId);
        logEvent(user.id, {
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
      logEvent(user.id, {
        taskId: task.id,
        type: 'task_done',
        message: `"${task.title}" marked done`,
        actor: user.fullName,
      });
    }
  }

  touch(task);
  commit(user.id);
  res.json(shapeTask(task));
});

app.delete('/api/tasks/:id', (req, res) => {
  const user = requireUser(req);
  const task = store.data.tasks.find((t) => t.id === req.params.id && t.ownerId === user.id);
  if (!task) throw new HttpError(404, 'Task not found.');
  store.data.tasks = store.data.tasks.filter((t) => t.id !== task.id);
  store.data.events = store.data.events.filter((e) => e.taskId !== task.id);
  commit(user.id);
  res.status(204).end();
});

/**
 * Hands the client a ready-to-open `mailto:` URL and flips the task to
 * "awaiting". No mail is sent from here on purpose: the message leaves from the
 * user's own Outlook, so replies and threading stay in their mailbox.
 */
app.post('/api/tasks/:id/notify', (req, res) => {
  const user = requireUser(req);
  const task = store.data.tasks.find((t) => t.id === req.params.id && t.ownerId === user.id);
  if (!task) throw new HttpError(404, 'Task not found.');
  if (!task.assigneeId) throw new HttpError(409, 'Assign this task to someone before informing them.');

  const member = memberOf(user.id, task.assigneeId);
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

  logEvent(user.id, {
    taskId: task.id,
    type: 'task_notified',
    message: `${member.name} was emailed about "${task.title}"`,
    actor: user.fullName,
  });
  commit(user.id);

  res.json({ ...draft, task: shapeTask(task) });
});

/* ------------------------------------------------------------------- feed */

app.get('/api/stream', (req, res) => {
  const user = requireUser(req);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'sync', ...snapshot(user.id) })}\n\n`);

  if (!streams.has(user.id)) streams.set(user.id, new Set());
  streams.get(user.id).add(res);

  // Proxies drop idle connections; a comment frame keeps the pipe warm.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(user.id)?.delete(res);
  });
});

/* -------------------------------------------------- email response landing */

function findByToken(value) {
  const task = store.data.tasks.find((t) => t.responseToken === value);
  if (!task) return null;
  const member = task.assigneeId ? store.data.members.find((m) => m.id === task.assigneeId) : null;
  return { task, member };
}

app.get('/r/:token', (req, res) => {
  const found = findByToken(req.params.token);
  if (!found) {
    return res
      .status(404)
      .type('html')
      .send(renderError({ title: 'Link expired', message: 'This task link is no longer valid. Ask for a fresh one.' }));
  }
  res.type('html').send(renderChooser({ task: found.task, member: found.member ?? { name: '' } }));
});

app.get('/r/:token/:action', (req, res) => {
  const action = req.params.action;
  const meta = RESPONSE_ACTIONS[action];
  const found = findByToken(req.params.token);

  if (!meta || !found) {
    return res
      .status(404)
      .type('html')
      .send(renderError({ title: 'Link expired', message: 'This task link is no longer valid. Ask for a fresh one.' }));
  }

  const { task, member } = found;
  const who = member?.name ?? 'Someone';
  const changed = task.status !== meta.status;

  task.status = meta.status;
  task.respondedAt = now();
  task.completedAt = null;
  task.updatedAt = now();

  if (changed) {
    logEvent(task.ownerId, {
      taskId: task.id,
      type: 'task_response',
      message: `${who} answered "${meta.label}" on "${task.title}"`,
      actor: who,
    });
  }
  commit(task.ownerId);

  res.type('html').send(
    renderConfirmation({
      action,
      task,
      member: member ?? { name: '' },
      otherActions: Object.keys(RESPONSE_ACTIONS).filter((slug) => slug !== action),
      saved: { note: task.responseNote },
    }),
  );
});

app.post('/r/:token/:action/note', (req, res) => {
  const action = req.params.action;
  const meta = RESPONSE_ACTIONS[action];
  const found = findByToken(req.params.token);

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
    if (note) {
      logEvent(task.ownerId, {
        taskId: task.id,
        type: 'note_added',
        message: `${who} added a note: "${note.length > 90 ? `${note.slice(0, 90)}...` : note}"`,
        actor: who,
      });
    }
    commit(task.ownerId);
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
});

/* --------------------------------------------------------- static + errors */

app.get('/api/health', (_req, res) => res.json({ ok: true, at: now() }));

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

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n  TaskChaser server  →  http://localhost:${PORT}`);
    console.log(`  Response links use →  ${process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`}`);
    if (!fs.existsSync(CLIENT_DIST)) {
      console.log(`  Dashboard          →  http://localhost:5173 (run \`npm run dev\`)`);
    }
    console.log(`  Data file          →  ${path.join(DATA_DIR, 'taskchaser.json')}\n`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      try {
        store.flushNow();
      } catch {
        /* best effort on the way out */
      }
      process.exit(0);
    });
  }
}

export { app, store };
