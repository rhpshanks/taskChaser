import { RESPONSE_ACTIONS } from './domain.js';

/**
 * Builds the message that Outlook (or whichever client owns `mailto:`) opens
 * pre-written. It is plain text on purpose: `mailto:` has no way to carry HTML,
 * and every mail client turns a bare URL into a tappable link, so the three
 * response links behave like buttons without needing a real mail server.
 */

const CRLF = '\r\n';

function formatDue(iso, timeZone) {
  if (!iso) return 'No due date set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No due date set';
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      timeZone: timeZone || undefined,
    });
    return fmt.format(date);
  } catch {
    return date.toUTCString();
  }
}

export function buildEmail({ task, member, owner, baseUrl, timeZone }) {
  const link = (slug) => `${baseUrl.replace(/\/+$/, '')}/r/${task.responseToken}/${slug}`;
  const firstName = (member.name || '').trim().split(/\s+/)[0] || 'there';
  const priority = task.priority && task.priority !== 'normal' ? task.priority.toUpperCase() : null;

  const subject = `[TaskChaser] ${task.title}`;

  const lines = [
    `Hi ${firstName},`,
    '',
    `${owner.fullName}${owner.title ? ` (${owner.title})` : ''} has assigned you the following task.`,
    '',
    '----------------------------------------',
    `TASK      ${task.title}`,
    `DUE       ${formatDue(task.dueAt, timeZone)}`,
    ...(priority ? [`PRIORITY  ${priority}`] : []),
    '----------------------------------------',
  ];

  if (task.notes && task.notes.trim()) {
    lines.push('', 'NOTES', task.notes.trim());
  }

  lines.push(
    '',
    'Tap ONE of the three options below. Your answer updates the dashboard',
    'instantly, so there is nothing else to reply to.',
    '',
    `[ ${RESPONSE_ACTIONS.ready.label.toUpperCase()} ]`,
    link('ready'),
    '',
    `[ ${RESPONSE_ACTIONS['need-time'].label.toUpperCase()} ]`,
    link('need-time'),
    '',
    `[ ${RESPONSE_ACTIONS.escalate.label.toUpperCase()} ]`,
    link('escalate'),
    '',
    'Thanks,',
    owner.fullName,
    '',
    '--',
    'Sent from TaskChaser',
  );

  const body = lines.join(CRLF);

  const mailto =
    `mailto:${encodeURIComponent(member.email)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  return { to: member.email, subject, body, mailto };
}
