/** Shared vocabulary for task state, used by the API and the response pages. */

export const STATUS = {
  UNASSIGNED: 'unassigned',
  ASSIGNED: 'assigned',
  AWAITING: 'awaiting',
  READY: 'ready',
  NEED_TIME: 'need_time',
  ESCALATED: 'escalated',
  DONE: 'done',
};

export const ALL_STATUSES = Object.values(STATUS);

/** The three buttons that go in the email, keyed by their URL slug. */
export const RESPONSE_ACTIONS = {
  ready: {
    status: STATUS.READY,
    label: 'Task Ready',
    blurb: 'the task is done and ready for review',
  },
  'need-time': {
    status: STATUS.NEED_TIME,
    label: 'Need Time',
    blurb: 'more time is needed to finish this',
  },
  escalate: {
    status: STATUS.ESCALATED,
    label: 'Escalation',
    blurb: 'this is blocked and needs attention',
  },
};

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/**
 * A task's status is mostly derived: it follows whether an assignee exists and
 * whether the assignee has answered. Only `done` and an explicit response are
 * sticky, so re-assigning a fresh task cannot silently keep a stale answer.
 */
export function deriveStatus(task) {
  if (task.status === STATUS.DONE) return STATUS.DONE;
  if (!task.assigneeId) return STATUS.UNASSIGNED;
  if (task.respondedAt) return task.status;
  if (task.notifiedAt) return STATUS.AWAITING;
  return STATUS.ASSIGNED;
}

export function isOverdue(task, now = Date.now()) {
  if (!task.dueAt) return false;
  if (task.status === STATUS.DONE) return false;
  return new Date(task.dueAt).getTime() < now;
}
