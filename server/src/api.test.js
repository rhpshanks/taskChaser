import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the store at a throwaway directory before the server module loads it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskchaser-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = tmpDir;
process.env.PUBLIC_BASE_URL = 'http://tasks.example.test';

const { app } = await import('./index.js');
const { buildEmail } = await import('./email.js');
const { deriveStatus, STATUS } = await import('./domain.js');

const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let userId = '';

const call = (path, init = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-TC-User': userId } : {}),
      ...init.headers,
    },
  });

const json = async (path, init) => {
  const res = await call(path, init);
  return { status: res.status, body: await res.json().catch(() => null) };
};

/* --------------------------------------------------------------- unit bits */

test('status is derived from assignment and reply, not stored blindly', () => {
  assert.equal(deriveStatus({ assigneeId: null }), STATUS.UNASSIGNED);
  assert.equal(deriveStatus({ assigneeId: 'm1' }), STATUS.ASSIGNED);
  assert.equal(deriveStatus({ assigneeId: 'm1', notifiedAt: 'x' }), STATUS.AWAITING);
  assert.equal(
    deriveStatus({ assigneeId: 'm1', notifiedAt: 'x', respondedAt: 'y', status: STATUS.READY }),
    STATUS.READY,
  );
  assert.equal(deriveStatus({ assigneeId: null, status: STATUS.DONE }), STATUS.DONE);
});

test('the email carries all three response links and opens in a mail client', () => {
  const draft = buildEmail({
    task: {
      title: 'Write brief',
      dueAt: '2026-08-17T11:00:00.000Z',
      priority: 'high',
      notes: 'Two pages max.',
      responseToken: 'tok123',
    },
    member: { name: 'Sara Khan', email: 'sara@example.com' },
    owner: { fullName: 'Hashaam Shahid', title: 'Head of Operations' },
    baseUrl: 'http://tasks.example.test',
    timeZone: 'Asia/Karachi',
  });

  assert.ok(draft.mailto.startsWith('mailto:sara%40example.com?subject='));
  assert.match(draft.subject, /Write brief/);
  for (const slug of ['ready', 'need-time', 'escalate']) {
    assert.ok(draft.body.includes(`http://tasks.example.test/r/tok123/${slug}`), `missing ${slug} link`);
  }
  assert.ok(draft.body.includes('Two pages max.'));
  assert.ok(draft.body.includes('HIGH'));
  assert.ok(draft.body.includes('4:00 pm'), 'due time should be rendered in the requested time zone');
});

/* ---------------------------------------------------------- the whole flow */

test('sign in creates the workspace owner', async () => {
  const { status, body } = await json('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Hashaam Shahid',
      title: 'Head of Operations',
      email: 'HASHAAM@example.com',
    }),
  });
  assert.equal(status, 200);
  assert.equal(body.user.email, 'hashaam@example.com', 'email should be normalised');
  assert.deepEqual(body.tasks, []);
  userId = body.user.id;
});

test('unauthenticated requests are rejected', async () => {
  const res = await fetch(`${base}/api/bootstrap`);
  assert.equal(res.status, 401);
});

test('bad input is rejected with a readable message', async () => {
  const { status, body } = await json('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name: 'No Email', email: 'not-an-address' }),
  });
  assert.equal(status, 400);
  assert.match(body.error, /valid address/);
});

let memberId = '';
let taskId = '';
let responseToken = '';

test('a team member can be added once per email', async () => {
  const first = await json('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sara Khan', email: 'sara@example.com', role: 'Content Lead' }),
  });
  assert.equal(first.status, 201);
  memberId = first.body.id;

  const duplicate = await json('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sara K', email: 'sara@example.com' }),
  });
  assert.equal(duplicate.status, 409);
});

test('a task starts unassigned and cannot be emailed yet', async () => {
  const created = await json('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Write brief', dueAt: '2026-08-17T11:00:00.000Z', priority: 'high' }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'unassigned');
  taskId = created.body.id;
  responseToken = created.body.responseToken;

  const tooEarly = await json(`/api/tasks/${taskId}/notify`, { method: 'POST', body: '{}' });
  assert.equal(tooEarly.status, 409);
  assert.match(tooEarly.body.error, /Assign this task/);
});

test('assigning then notifying moves the task to awaiting', async () => {
  const assigned = await json(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeId: memberId }),
  });
  assert.equal(assigned.body.status, 'assigned');

  const notified = await json(`/api/tasks/${taskId}/notify`, { method: 'POST', body: '{}' });
  assert.equal(notified.status, 200);
  assert.equal(notified.body.to, 'sara@example.com');
  assert.equal(notified.body.task.status, 'awaiting');
  assert.ok(notified.body.mailto.includes('subject='));
});

test('tapping "Task Ready" in the email updates the dashboard', async () => {
  const page = await fetch(`${base}/r/${responseToken}/ready`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Task Ready/);
  assert.match(html, /Sara/);

  const { body } = await json('/api/bootstrap');
  const task = body.tasks.find((t) => t.id === taskId);
  assert.equal(task.status, 'ready');
  assert.ok(task.respondedAt);
  assert.ok(
    body.events.some((e) => e.type === 'task_response' && e.message.includes('Task Ready')),
    'the response should show up in the activity feed',
  );
});

test('a mis-tap can be corrected from the same page', async () => {
  await fetch(`${base}/r/${responseToken}/escalate`);
  const { body } = await json('/api/bootstrap');
  assert.equal(body.tasks.find((t) => t.id === taskId).status, 'escalated');
});

test('the note posted back from the email lands on the task', async () => {
  const res = await fetch(`${base}/r/${responseToken}/escalate/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ note: 'Blocked on client sign-off.' }).toString(),
  });
  assert.equal(res.status, 200);

  const { body } = await json('/api/bootstrap');
  assert.equal(body.tasks.find((t) => t.id === taskId).responseNote, 'Blocked on client sign-off.');
});

test('re-assigning clears the previous answer so it cannot mislead', async () => {
  const other = await json('/api/members', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bilal Ahmed', email: 'bilal@example.com' }),
  });
  const moved = await json(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeId: other.body.id }),
  });
  assert.equal(moved.body.status, 'assigned');
  assert.equal(moved.body.respondedAt, null);
  assert.equal(moved.body.responseNote, '');
});

test('an unknown token shows an expired page rather than crashing', async () => {
  const res = await fetch(`${base}/r/does-not-exist/ready`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Link expired/);
});

test('removing a member releases their tasks instead of deleting them', async () => {
  const { body: before } = await json('/api/bootstrap');
  const victim = before.members.find((m) => m.email === 'bilal@example.com');

  const res = await call(`/api/members/${victim.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);

  const { body: after } = await json('/api/bootstrap');
  const task = after.tasks.find((t) => t.id === taskId);
  assert.ok(task, 'the task should survive');
  assert.equal(task.assigneeId, null);
  assert.equal(task.status, 'unassigned');
});

test('one workspace never sees another workspace', async () => {
  const outsider = await json('/api/session', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Someone Else', title: 'PM', email: 'else@example.com' }),
  });
  assert.deepEqual(outsider.body.tasks, []);
  assert.deepEqual(outsider.body.members, []);
});

test('data survives a restart', async () => {
  const { db } = await import('./index.js');
  assert.equal(db.kind, 'file', 'the suite must run against the file store, not a live database');
  db.flushNow();
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'taskchaser.json'), 'utf8'));
  assert.ok(onDisk.tasks.some((t) => t.id === taskId));
  assert.ok(onDisk.users.length >= 2);
});
