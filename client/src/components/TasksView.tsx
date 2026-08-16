import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { useStore } from '../store';
import { parseTaskInput } from '../lib/parseTask';
import { PRIORITY_LABEL, formatDue, isOverdue, timeAgo } from '../lib/format';
import type { EmailDraft, Member, Task, TaskStatus } from '../types';
import { Avatar, EmptyState, IconAlert, IconCheck, IconMail, IconPlus, IconSearch, StatusBadge } from './ui';

export type TaskFilter = 'open' | 'all' | 'awaiting' | 'ready' | 'need_time' | 'escalated' | 'done';

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'ready', label: 'Ready' },
  { key: 'need_time', label: 'Need time' },
  { key: 'escalated', label: 'Escalation' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

function matchesFilter(task: Task, filter: TaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return task.status !== 'done';
  return task.status === filter;
}

/* -------------------------------------------------------------- composer */

function Composer({ members, onDraft }: { members: Member[]; onDraft: (draft: EmailDraft) => void }) {
  const { addTask, informByEmail, notify } = useStore();
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-parsed on every keystroke so the chips below the box show, live, what
  // the app understood before anything is committed.
  const parsed = useMemo(() => parseTaskInput(text), [text]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === 'n' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function submit(event: FormEvent, thenInform: boolean) {
    event.preventDefault();
    if (busy) return;
    const title = parsed.title.trim();
    if (!title) {
      notify('Type the task first', 'For example: write brief today at 4pm', 'err');
      return;
    }

    setBusy(true);
    try {
      const task = await addTask({
        title,
        dueAt: parsed.dueAt ? parsed.dueAt.toISOString() : null,
        priority: parsed.priority,
        assigneeId: assigneeId || null,
      });
      setText('');

      if (thenInform && assigneeId) {
        const draft = await informByEmail(task.id);
        window.location.href = draft.mailto;
        onDraft(draft);
      }
    } catch {
      // The store surfaces the reason; leave the text so nothing is lost.
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form className="card composer" onSubmit={(e) => submit(e, false)}>
      <div className="composer-row">
        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="write brief today at 4pm"
          aria-label="New task"
        />
        <select
          className="select"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          aria-label="Assign to"
          style={{ width: 168, flex: 'none' }}
          disabled={members.length === 0}
        >
          <option value="">{members.length === 0 ? 'No team yet' : 'Assign to...'}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <IconPlus />
          Add task
        </button>
        {/* The brief's rule: the email option only exists once someone is picked. */}
        {assigneeId ? (
          <button className="btn" type="button" onClick={(e) => submit(e, true)} disabled={busy}>
            <IconMail />
            Add + Inform via Email
          </button>
        ) : null}
      </div>

      <div className="composer-meta">
        {parsed.dueAt ? (
          <span className="chip chip-accent">Due {formatDue(parsed.dueAt.toISOString())}</span>
        ) : (
          <span className="label">
            Add a time in plain English: <b>today at 4pm</b>, <b>friday</b>, <b>in 2 hours</b>, <b>25 aug 3pm</b>
          </span>
        )}
        {parsed.priority !== 'normal' ? (
          <span className="chip">
            <i className={`pri pri-${parsed.priority}`} />
            {PRIORITY_LABEL[parsed.priority]}
          </span>
        ) : null}
        {parsed.dueAt && parsed.title ? <span className="label">Task: “{parsed.title}”</span> : null}
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- task row */

function TaskRow({
  task,
  members,
  isOpen,
  onOpen,
  onDraft,
}: {
  task: Task;
  members: Member[];
  isOpen: boolean;
  onOpen: () => void;
  onDraft: (draft: EmailDraft) => void;
}) {
  const { updateTask, informByEmail } = useStore();
  const [busy, setBusy] = useState(false);
  const assignee = members.find((m) => m.id === task.assigneeId) ?? null;
  const overdue = isOverdue(task.dueAt, task.status);
  const done = task.status === 'done';

  async function inform(event: React.MouseEvent) {
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const draft = await informByEmail(task.id);
      window.location.href = draft.mailto;
      onDraft(draft);
    } catch {
      /* reported by the store */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`task-row${isOpen ? ' is-open' : ''}${done ? ' is-done' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <button
        className="tick"
        aria-pressed={done}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        onClick={(e) => {
          e.stopPropagation();
          void updateTask(task.id, { status: done ? (task.assigneeId ? 'assigned' : 'unassigned') : 'done' });
        }}
      >
        <IconCheck size={12} />
      </button>

      <div className="task-main">
        <div className="title">
          <i className={`pri pri-${task.priority}`} title={`${PRIORITY_LABEL[task.priority]} priority`} />
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
          {task.respondedAt ? <span className="label" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
            replied {timeAgo(task.respondedAt)}
          </span> : null}
        </div>

        {task.responseNote ? <p className="note-line">“{task.responseNote}”</p> : null}
      </div>

      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <select
          className="select"
          style={{ width: 148 }}
          value={task.assigneeId ?? ''}
          aria-label={`Assign ${task.title}`}
          onChange={(e) => void updateTask(task.id, { assigneeId: e.target.value || null })}
          disabled={members.length === 0}
        >
          <option value="">{members.length === 0 ? 'No team yet' : 'Assign to...'}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>

        {/* Appears only once the task has an assignee, per the brief. */}
        {assignee ? (
          <button
            className={task.notifiedAt ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
            onClick={inform}
            disabled={busy}
            title={`Email ${assignee.email}`}
          >
            <IconMail size={14} />
            {task.notifiedAt ? 'Chase again' : 'Inform via Email'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ view */

export function TasksView({
  filter,
  setFilter,
  onOpenTask,
  openTaskId,
  onDraft,
}: {
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  onOpenTask: (id: string) => void;
  openTaskId: string | null;
  onDraft: (draft: EmailDraft) => void;
}) {
  const { tasks, members } = useStore();
  const [query, setQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [sort, setSort] = useState<'due' | 'created' | 'status'>('due');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = useMemo(() => {
    const out = {} as Record<TaskFilter, number>;
    for (const { key } of FILTERS) out[key] = tasks.filter((t) => matchesFilter(t, key)).length;
    return out;
  }, [tasks]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rank: Record<TaskStatus, number> = {
      escalated: 0,
      need_time: 1,
      awaiting: 2,
      assigned: 3,
      unassigned: 4,
      ready: 5,
      done: 6,
    };

    return tasks
      .filter((task) => matchesFilter(task, filter))
      .filter((task) => !assigneeFilter || task.assigneeId === assigneeFilter)
      .filter((task) => {
        if (!needle) return true;
        const who = members.find((m) => m.id === task.assigneeId)?.name ?? '';
        return `${task.title} ${task.notes} ${who} ${task.responseNote}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (sort === 'status') return rank[a.status] - rank[b.status];
        if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
        // Due-date order, with undated tasks parked at the bottom.
        if (!a.dueAt && !b.dueAt) return b.createdAt.localeCompare(a.createdAt);
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt);
      });
  }, [tasks, members, filter, assigneeFilter, query, sort]);

  return (
    <>
      <Composer members={members} onDraft={onDraft} />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter tasks by status">
          {FILTERS.map(({ key, label }) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              <span className="n">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="search">
          <IconSearch />
          <input
            ref={searchRef}
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks    /"
            aria-label="Search tasks"
          />
        </div>

        <select
          className="select"
          style={{ width: 158 }}
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">Everyone</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>

        <select
          className="select"
          style={{ width: 140 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort tasks"
        >
          <option value="due">Sort: due date</option>
          <option value="status">Sort: urgency</option>
          <option value="created">Sort: newest</option>
        </select>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <EmptyState title={tasks.length === 0 ? 'No tasks yet' : 'Nothing matches these filters'}>
            {tasks.length === 0
              ? 'Type your first one in the box above, in the same words you would use out loud.'
              : 'Try a different status, or clear the search.'}
          </EmptyState>
        ) : (
          <div className="task-list">
            {visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                members={members}
                isOpen={openTaskId === task.id}
                onOpen={() => onOpenTask(task.id)}
                onDraft={onDraft}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
