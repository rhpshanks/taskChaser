import { init } from '@instantdb/admin';

/**
 * InstantDB adapter, talking to the app through the admin SDK.
 *
 * Every call is a targeted query or transaction rather than a whole-dataset
 * read-modify-write. That matters on a serverless host: two instances handling
 * a dashboard action and an emailed reply at the same moment must not overwrite
 * each other's work, which is exactly what a snapshot-style save would do.
 *
 * Namespaces are `owners`, `members`, `tasks` and `events`. The first is not
 * called `users` to keep it clearly apart from Instant's own `$users`.
 */

const OWNERS = 'owners';
const MEMBERS = 'members';
const TASKS = 'tasks';
const EVENTS = 'events';

export function createInstantDb({ appId, adminToken }) {
  const db = init({ appId, adminToken });

  const first = (rows) => (rows && rows.length ? rows[0] : null);

  /** Newest first, matching how the file store kept its lists. */
  const newestFirst = (rows) =>
    [...rows].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  async function findOne(namespace, where) {
    const result = await db.query({ [namespace]: { $: { where, limit: 1 } } });
    return first(result[namespace]);
  }

  async function findMany(namespace, where) {
    const result = await db.query({ [namespace]: { $: { where } } });
    return result[namespace] ?? [];
  }

  /**
   * `update` upserts in Instant, so one call covers create and edit. The id is
   * the entity key and is not duplicated into the stored attributes.
   */
  async function put(namespace, row) {
    const { id, ...rest } = row;
    await db.transact(db.tx[namespace][id].update(rest));
    return row;
  }

  async function remove(namespace, id) {
    await db.transact(db.tx[namespace][id].delete());
  }

  return {
    kind: 'instant',
    durable: true,
    location: `InstantDB app ${appId}`,
    flushNow() {
      /* writes already went over the wire */
    },

    async getUserById(id) {
      const row = await findOne(OWNERS, { id });
      return row ? { ...row, id } : null;
    },
    async getUserByEmail(email) {
      return findOne(OWNERS, { email });
    },
    async saveUser(user) {
      return put(OWNERS, user);
    },

    async listMembers(ownerId) {
      return newestFirst(await findMany(MEMBERS, { ownerId }));
    },
    async getMember(id) {
      return findOne(MEMBERS, { id });
    },
    async getMemberByEmail(ownerId, email) {
      return findOne(MEMBERS, { ownerId, email });
    },
    async saveMember(member) {
      return put(MEMBERS, member);
    },
    async deleteMember(id) {
      await remove(MEMBERS, id);
    },

    async listTasks(ownerId) {
      return newestFirst(await findMany(TASKS, { ownerId }));
    },
    async getTask(id) {
      return findOne(TASKS, { id });
    },
    async getTaskByToken(responseToken) {
      return findOne(TASKS, { responseToken });
    },
    async saveTask(task) {
      return put(TASKS, task);
    },
    async deleteTask(id) {
      await remove(TASKS, id);
    },

    async listEvents(ownerId, limit = 60) {
      return newestFirst(await findMany(EVENTS, { ownerId })).slice(0, limit);
    },
    async addEvent(event) {
      return put(EVENTS, event);
    },
    async deleteEventsForTask(taskId) {
      const rows = await findMany(EVENTS, { taskId });
      if (rows.length === 0) return;
      await db.transact(rows.map((row) => db.tx[EVENTS][row.id].delete()));
    },
  };
}
