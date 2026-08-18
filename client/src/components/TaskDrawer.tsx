import { useEffect, useState } from 'react';

import { useStore } from '../store';
import { PRIORITY_LABEL, formatDue, fromLocalInput, isOverdue, timeAgo, toLocalInput } from '../lib/format';
import { openMailClient } from '../lib/openMail';
import type { EmailDraft, Priority, Task } from '../types';
import { IconAlert, IconMail, IconTrash, IconX, StatusBadge } from './ui';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export function TaskDrawer({
  task,
  onClose,
  onDraft,
}: {
  task: Task;
  onClose: () => void;
  onDraft: (draft: EmailDraft) => void;
}) {
  const { members, events, updateTask, removeTask, informByEmail } = useStore();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [busy, setBusy] = useState(false);

  const assignee = members.find((m) => m.id === task.assigneeId) ?? null;
  const history = events.filter((event) => event.taskId === task.id);
  const overdue = isOverdue(task.dueAt, task.status);

  // The task can change underneath us from an email reply, so mirror it back
  // into the local edit fields whenever a different task is opened.
  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
  }, [task.id, task.title, task.notes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function inform() {
    if (busy) return;
    setBusy(true);
    try {
      const draft = await informByEmail(task.id);
      openMailClient(draft.mailto);
      onDraft(draft);
    } catch {
      /* reported by the store */
    } finally {
      setBusy(false);
    }
  }

  function commitTitle() {
    const next = title.trim();
    if (next && next !== task.title) void updateTask(task.id, { title: next });
    else setTitle(task.title);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Task details">
        <header className="drawer-head">
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
            <StatusBadge status={task.status} />
            <textarea
              className="textarea"
              style={{ minHeight: 0, fontSize: 16, fontWeight: 600, padding: '6px 8px' }}
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              aria-label="Task title"
            />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>

        <div className="drawer-body">
          <div className="field">
            <label htmlFor="d-assignee">Assigned to</label>
            <select
              id="d-assignee"
              className="select"
              value={task.assigneeId ?? ''}
              onChange={(e) => void updateTask(task.id, { assigneeId: e.target.value || null })}
            >
              <option value="">{members.length === 0 ? 'No team members yet' : 'Nobody'}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.role ? ` — ${member.role}` : ''}
                </option>
              ))}
            </select>
            {assignee ? (
              <span className="hint">
                Emails go to <b>{assignee.email}</b>
              </span>
            ) : (
              <span className="hint">Pick someone to unlock the Inform via Email button.</span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label htmlFor="d-due">Due</label>
              <input
                id="d-due"
                className="input"
                type="datetime-local"
                value={toLocalInput(task.dueAt)}
                onChange={(e) => void updateTask(task.id, { dueAt: fromLocalInput(e.target.value) })}
              />
              {overdue ? (
                <span className="hint" style={{ color: 'var(--hot)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconAlert size={12} /> Overdue
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="d-priority">Priority</label>
              <select
                id="d-priority"
                className="select"
                value={task.priority}
                onChange={(e) => void updateTask(task.id, { priority: e.target.value })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="d-notes">Notes</label>
            <textarea
              id="d-notes"
              className="textarea"
              value={notes}
              placeholder="Anything the assignee needs to know. This goes into the email."
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== task.notes && void updateTask(task.id, { notes })}
            />
          </div>

          {task.responseNote ? (
            <div>
              <div className="section-label">Their note</div>
              <p className="note-line" style={{ maxWidth: 'none', marginTop: 0 }}>
                “{task.responseNote}”
              </p>
            </div>
          ) : null}

          <div>
            <div className="section-label">History</div>
            {history.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--faint)' }}>Nothing recorded yet.</p>
            ) : (
              <ul className="timeline">
                {history.map((event) => (
                  <li key={event.id}>
                    {event.message}
                    <time>{timeAgo(event.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="section-label">Status</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {task.status === 'done' ? (
                <button
                  className="btn btn-sm"
                  onClick={() => void updateTask(task.id, { status: task.assigneeId ? 'assigned' : 'unassigned' })}
                >
                  Reopen task
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => void updateTask(task.id, { status: 'done' })}>
                  Mark done
                </button>
              )}
              <span className="chip">Created {timeAgo(task.createdAt)}</span>
              {task.notifiedAt ? <span className="chip">Emailed {timeAgo(task.notifiedAt)}</span> : null}
              {task.respondedAt ? <span className="chip">Replied {timeAgo(task.respondedAt)}</span> : null}
            </div>
          </div>
        </div>

        <footer className="drawer-foot">
          {assignee ? (
            <button className="btn btn-primary" onClick={inform} disabled={busy} style={{ flex: 1 }}>
              <IconMail />
              {task.notifiedAt ? 'Chase again by email' : 'Inform via Email'}
            </button>
          ) : (
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--faint)' }}>
              Assign this task to enable the email.
            </span>
          )}
          <span className="chip">{formatDue(task.dueAt)}</span>
          <button
            className="btn btn-danger btn-sm"
            aria-label="Delete task"
            onClick={() => {
              if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                void removeTask(task.id);
                onClose();
              }
            }}
          >
            <IconTrash />
          </button>
        </footer>
      </aside>
    </>
  );
}
