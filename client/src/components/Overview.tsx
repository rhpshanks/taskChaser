import { useMemo } from 'react';

import { useStore } from '../store';
import { formatDue, isOverdue, timeAgo } from '../lib/format';
import type { Task, TaskStatus } from '../types';
import type { TaskFilter } from './TasksView';
import {
  Avatar,
  EmptyState,
  IconAlert,
  IconCheck,
  IconClock,
  IconList,
  IconMail,
  IconUsers,
  StatusBadge,
} from './ui';

/** Which activity types get which colour treatment in the feed. */
function feedKind(type: string, message: string): string {
  if (type === 'task_notified') return 'notified';
  if (type !== 'task_response') return '';
  if (message.includes('Task Ready')) return 'ready';
  if (message.includes('Need Time')) return 'need_time';
  if (message.includes('Escalation')) return 'escalated';
  return '';
}

function feedIcon(type: string, kind: string) {
  if (kind === 'ready') return <IconCheck size={13} />;
  if (kind === 'need_time') return <IconClock size={13} />;
  if (kind === 'escalated') return <IconAlert size={13} />;
  if (type === 'task_notified') return <IconMail size={13} />;
  if (type.startsWith('member')) return <IconUsers size={13} />;
  return <IconList size={13} />;
}

export function Overview({
  goToTasks,
  onOpenTask,
}: {
  goToTasks: (filter: TaskFilter) => void;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, members, events, user } = useStore();

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done');
    return {
      open: open.length,
      awaiting: tasks.filter((t) => t.status === 'awaiting').length,
      ready: tasks.filter((t) => t.status === 'ready').length,
      needTime: tasks.filter((t) => t.status === 'need_time').length,
      escalated: tasks.filter((t) => t.status === 'escalated').length,
      overdue: open.filter((t) => isOverdue(t.dueAt, t.status)).length,
    };
  }, [tasks]);

  /**
   * The one list worth reading first: anything escalated, anything overdue,
   * and anything sitting unanswered. Sorted by how loudly it is asking.
   */
  const attention = useMemo(() => {
    const weight = (task: Task): number => {
      if (task.status === 'escalated') return 0;
      if (isOverdue(task.dueAt, task.status)) return 1;
      if (task.status === 'need_time') return 2;
      if (task.status === 'awaiting') return 3;
      return 9;
    };
    return tasks
      .filter((t) => t.status !== 'done' && weight(t) < 9)
      .sort((a, b) => weight(a) - weight(b) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
      .slice(0, 6);
  }, [tasks]);

  const load = useMemo(
    () =>
      members
        .map((member) => {
          const mine = tasks.filter((t) => t.assigneeId === member.id && t.status !== 'done');
          const by = (status: TaskStatus) => mine.filter((t) => t.status === status).length;
          return {
            member,
            total: mine.length,
            escalated: by('escalated'),
            awaiting: by('awaiting') + by('need_time'),
            ready: by('ready'),
            assigned: by('assigned'),
          };
        })
        .sort((a, b) => b.total - a.total),
    [members, tasks],
  );

  const firstName = (user?.fullName ?? '').split(/\s+/)[0] ?? '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.015em' }}>
          {greeting}, {firstName}.
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 2 }}>
          {stats.escalated > 0
            ? `${stats.escalated} escalation${stats.escalated === 1 ? '' : 's'} needs you first.`
            : stats.overdue > 0
              ? `${stats.overdue} task${stats.overdue === 1 ? ' is' : 's are'} past due.`
              : stats.needTime > 0
                ? `${stats.needTime} task${stats.needTime === 1 ? '' : 's'} asked for more time.`
                : stats.awaiting > 0
                  ? `Waiting on ${stats.awaiting} repl${stats.awaiting === 1 ? 'y' : 'ies'}. Nothing on fire.`
                  : 'Nothing is waiting on you.'}
        </p>
      </div>

      <div className="stats">
        <button className="stat" onClick={() => goToTasks('open')}>
          <span className="label">
            <IconList size={13} /> Open
          </span>
          <span className="value">{stats.open}</span>
          <span className="foot">across {members.length || 'no'} team member{members.length === 1 ? '' : 's'}</span>
        </button>

        {/* A zero is good news, so it stays neutral rather than shouting in red. */}
        <button className={`stat${stats.awaiting ? ' is-warn' : ''}`} onClick={() => goToTasks('awaiting')}>
          <span className="label">
            <IconMail size={13} /> Awaiting reply
          </span>
          <span className="value">{stats.awaiting}</span>
          <span className="foot">emailed, no answer yet</span>
        </button>

        <button className={`stat${stats.ready ? ' is-ok' : ''}`} onClick={() => goToTasks('ready')}>
          <span className="label">
            <IconCheck size={13} /> Ready
          </span>
          <span className="value">{stats.ready}</span>
          <span className="foot">answered Task Ready</span>
        </button>

        <button className={`stat${stats.needTime ? ' is-warn' : ''}`} onClick={() => goToTasks('need_time')}>
          <span className="label">
            <IconClock size={13} /> Need time
          </span>
          <span className="value">{stats.needTime}</span>
          <span className="foot">asked for an extension</span>
        </button>

        <button className={`stat${stats.escalated ? ' is-hot' : ''}`} onClick={() => goToTasks('escalated')}>
          <span className="label">
            <IconAlert size={13} /> Escalations
          </span>
          <span className="value">{stats.escalated}</span>
          <span className="foot">blocked, needs you</span>
        </button>

        <button className={`stat${stats.overdue ? ' is-hot' : ''}`} onClick={() => goToTasks('open')}>
          <span className="label">
            <IconClock size={13} /> Overdue
          </span>
          <span className="value">{stats.overdue}</span>
          <span className="foot">past the due time</span>
        </button>
      </div>

      <div className="cols">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Needs your attention</h3>
              <span className="sub">Escalations, overdue work, and unanswered emails</span>
            </div>
            <button className="btn btn-sm" onClick={() => goToTasks('open')}>
              All tasks
            </button>
          </div>

          {attention.length === 0 ? (
            <EmptyState glyph={<IconCheck size={20} />} title="All clear">
              Nothing is overdue, escalated, or waiting on a reply.
            </EmptyState>
          ) : (
            <div className="task-list">
              {attention.map((task) => {
                const assignee = members.find((m) => m.id === task.assigneeId);
                const overdue = isOverdue(task.dueAt, task.status);
                return (
                  <div
                    key={task.id}
                    className="task-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTask(task.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onOpenTask(task.id);
                    }}
                    style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}
                  >
                    <div className="task-main">
                      <div className="title">
                        <i className={`pri pri-${task.priority}`} />
                        <span>{task.title}</span>
                      </div>
                      <div className="task-meta">
                        <StatusBadge status={task.status} short />
                        {assignee ? (
                          <span className="who">
                            <Avatar name={assignee.name} size="sm" />
                            {assignee.name}
                          </span>
                        ) : (
                          <span className="chip">Nobody assigned</span>
                        )}
                        <span className={overdue ? 'chip chip-hot' : 'chip'}>
                          {overdue ? <IconAlert size={11} /> : null}
                          {formatDue(task.dueAt)}
                        </span>
                      </div>
                      {task.responseNote ? <p className="note-line">“{task.responseNote}”</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div style={{ display: 'grid', gap: 20 }}>
          <section className="card">
            <div className="card-head">
              <h3>Live activity</h3>
              <span className="sub">Updates itself</span>
            </div>
            {events.length === 0 ? (
              <EmptyState title="Nothing has happened yet">
                Replies from your team will appear here the moment they tap a button.
              </EmptyState>
            ) : (
              <div className="feed">
                {events.slice(0, 14).map((event) => {
                  const kind = feedKind(event.type, event.message);
                  return (
                    <div key={event.id} className={`feed-item${kind ? ` k-${kind}` : ''}`}>
                      <span className="icon">{feedIcon(event.type, kind)}</span>
                      <div className="text">
                        {event.message}
                        <div className="when">{timeAgo(event.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Who is carrying what</h3>
              <span className="sub">Open tasks only</span>
            </div>
            {load.length === 0 ? (
              <EmptyState glyph={<IconUsers size={20} />} title="No team members yet">
                Add people on the Team tab to start assigning work.
              </EmptyState>
            ) : (
              <div>
                {load.map((row) => (
                  <div className="load-row" key={row.member.id}>
                    <Avatar name={row.member.name} />
                    <div className="who">
                      <strong>{row.member.name}</strong>
                      <span>
                        {row.total === 0 ? 'Nothing open' : `${row.total} open`}
                        {row.escalated > 0 ? ` · ${row.escalated} escalated` : ''}
                      </span>
                    </div>
                    <div className="bar" aria-hidden>
                      {row.total > 0 ? (
                        <>
                          <i className="b-escalated" style={{ width: `${(row.escalated / row.total) * 100}%` }} />
                          <i className="b-awaiting" style={{ width: `${(row.awaiting / row.total) * 100}%` }} />
                          <i className="b-ready" style={{ width: `${(row.ready / row.total) * 100}%` }} />
                          <i className="b-assigned" style={{ width: `${(row.assigned / row.total) * 100}%` }} />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
