import type { Priority, TaskStatus } from '../types';

export const STATUS_META: Record<TaskStatus, { label: string; short: string }> = {
  unassigned: { label: 'Unassigned', short: 'Unassigned' },
  assigned: { label: 'Assigned, not told yet', short: 'Assigned' },
  awaiting: { label: 'Awaiting reply', short: 'Awaiting' },
  ready: { label: 'Task Ready', short: 'Ready' },
  need_time: { label: 'Needs more time', short: 'Need time' },
  escalated: { label: 'Escalation', short: 'Escalation' },
  done: { label: 'Done', short: 'Done' },
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`;
}

/** "Today 4:00 pm", "Tomorrow 9:00 am", "Fri 21 Aug, 5:00 pm". */
export function formatDue(iso: string | null, now = new Date()): string {
  if (!iso) return 'No due date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No due date';

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = daysApart(date, now);

  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${day}, ${time}`;
}

function daysApart(a: Date, b: Date): number {
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((dayA - dayB) / 86_400_000);
}

/** "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function isOverdue(dueAt: string | null, status: TaskStatus, now = new Date()): boolean {
  if (!dueAt || status === 'done' || status === 'ready') return false;
  return new Date(dueAt).getTime() < now.getTime();
}

/** A local datetime string that <input type="datetime-local"> understands. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
