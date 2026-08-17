import { createStore } from '../store.js';

/**
 * File-backed adapter: the original JSON store behind the async repository
 * interface. Used for local runs and by the test suite, so neither needs
 * credentials or a network.
 */
export function createFileDb({ dataDir, durable }) {
  const store = createStore({ dataDir });
  const d = () => store.data;

  const byId = (list, id) => list.find((row) => row.id === id) ?? null;

  /** Replace a row in place, or append it when it is new. */
  function upsert(list, row) {
    const at = list.findIndex((existing) => existing.id === row.id);
    if (at === -1) list.unshift(row);
    else list[at] = row;
    store.save();
    return row;
  }

  return {
    kind: 'file',
    durable,
    location: dataDir,
    flushNow: () => store.flushNow(),

    async getUserById(id) {
      return byId(d().users, id);
    },
    async getUserByEmail(email) {
      return d().users.find((u) => u.email === email) ?? null;
    },
    async saveUser(user) {
      return upsert(d().users, user);
    },

    async listMembers(ownerId) {
      return d().members.filter((m) => m.ownerId === ownerId);
    },
    async getMember(id) {
      return byId(d().members, id);
    },
    async getMemberByEmail(ownerId, email) {
      return d().members.find((m) => m.ownerId === ownerId && m.email === email) ?? null;
    },
    async saveMember(member) {
      return upsert(d().members, member);
    },
    async deleteMember(id) {
      d().members = d().members.filter((m) => m.id !== id);
      store.save();
    },

    async listTasks(ownerId) {
      return d().tasks.filter((t) => t.ownerId === ownerId);
    },
    async getTask(id) {
      return byId(d().tasks, id);
    },
    async getTaskByToken(token) {
      return d().tasks.find((t) => t.responseToken === token) ?? null;
    },
    async saveTask(task) {
      return upsert(d().tasks, task);
    },
    async deleteTask(id) {
      d().tasks = d().tasks.filter((t) => t.id !== id);
      store.save();
    },

    async listEvents(ownerId, limit = 60) {
      return d()
        .events.filter((e) => e.ownerId === ownerId)
        .slice(0, limit);
    },
    async addEvent(event) {
      d().events.unshift(event);
      // The activity list is a rolling window, not an audit log.
      if (d().events.length > 500) d().events.length = 500;
      store.save();
      return event;
    },
    async deleteEventsForTask(taskId) {
      d().events = d().events.filter((e) => e.taskId !== taskId);
      store.save();
    },
  };
}
