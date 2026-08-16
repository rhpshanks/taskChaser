import { RESPONSE_ACTIONS } from './domain.js';

/**
 * Standalone HTML for the pages a team member lands on after tapping a link in
 * the email. Self-contained (no build step, no assets) so it renders instantly
 * on a phone, which is where most of these taps happen.
 */

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

const THEME = {
  ready: { accent: '#0f9d58', soft: '#e7f6ee', icon: '&#10003;' },
  'need-time': { accent: '#c77700', soft: '#fdf1de', icon: '&#8987;' },
  escalate: { accent: '#d93025', soft: '#fdeceb', icon: '&#9888;' },
  neutral: { accent: '#4f46e5', soft: '#eceafd', icon: '&#8505;' },
};

function shell({ title, accent, inner }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(title)} &middot; TaskChaser</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --accent: ${accent};
    --bg: #f4f5f9;
    --card: #ffffff;
    --ink: #14161c;
    --muted: #5b6070;
    --line: #e3e5ee;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0e1016; --card: #171a23; --ink: #eef0f6; --muted: #9aa0b4; --line: #262b38; }
  }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--ink);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    width: 100%; max-width: 520px; background: var(--card); border: 1px solid var(--line);
    border-radius: 16px; padding: 32px; box-shadow: 0 12px 40px rgba(16, 18, 28, .08);
  }
  .badge {
    width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
    background: var(--accent); color: #fff; font-size: 26px; margin-bottom: 20px;
  }
  h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.3; letter-spacing: -.01em; }
  p { margin: 0 0 16px; color: var(--muted); }
  .task {
    margin: 20px 0; padding: 16px; border-radius: 12px; border: 1px solid var(--line);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .task strong { display: block; color: var(--ink); font-size: 16px; margin-bottom: 4px; }
  .task span { color: var(--muted); font-size: 13px; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  textarea {
    width: 100%; min-height: 88px; resize: vertical; padding: 12px; border-radius: 10px;
    border: 1px solid var(--line); background: var(--bg); color: var(--ink);
    font: inherit;
  }
  textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  button, .btn {
    display: inline-block; border: 0; border-radius: 10px; padding: 12px 18px;
    font: inherit; font-weight: 600; cursor: pointer; text-decoration: none;
    background: var(--accent); color: #fff;
  }
  button:hover, .btn:hover { filter: brightness(1.06); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .ghost { background: transparent; color: var(--muted); border: 1px solid var(--line); }
  .alt { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--line); }
  .alt h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 12px; }
  .alt-links { display: flex; flex-wrap: wrap; gap: 10px; }
  .alt-links a {
    flex: 1 1 auto; text-align: center; padding: 10px 14px; border-radius: 10px;
    border: 1px solid var(--line); color: var(--ink); text-decoration: none; font-size: 14px; font-weight: 500;
  }
  .alt-links a:hover { border-color: var(--accent); color: var(--accent); }
  .foot { margin: 24px 0 0; font-size: 12px; color: var(--muted); text-align: center; }
  .ok { color: var(--accent); font-weight: 600; }
</style>
</head>
<body>
  <main class="card">${inner}</main>
</body>
</html>`;
}

export function renderConfirmation({ action, task, member, otherActions, saved }) {
  const meta = RESPONSE_ACTIONS[action];
  const theme = THEME[action] ?? THEME.neutral;
  const due = task.dueAt
    ? new Date(task.dueAt).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'No due date';

  const inner = `
    <div class="badge">${theme.icon}</div>
    <h1>Thanks, ${escapeHtml((member.name || '').split(/\s+/)[0] || 'there')}.</h1>
    <p>You marked this <span class="ok">${escapeHtml(meta.label)}</span> &mdash; ${escapeHtml(meta.blurb)}. The dashboard already shows it.</p>

    <div class="task">
      <strong>${escapeHtml(task.title)}</strong>
      <span>Due ${escapeHtml(due)}</span>
    </div>

    <form method="post" action="/r/${encodeURIComponent(task.responseToken)}/${encodeURIComponent(action)}/note">
      <label for="note">Want to add a line? (optional)</label>
      <textarea id="note" name="note" maxlength="500" placeholder="${
        action === 'need-time'
          ? 'e.g. I can have this by Thursday noon.'
          : action === 'escalate'
            ? 'e.g. Blocked on the client sign-off.'
            : 'e.g. Draft is in the shared folder.'
      }">${escapeHtml(saved?.note ?? '')}</textarea>
      <div class="actions">
        <button type="submit">${saved?.noteSaved ? 'Update note' : 'Send note'}</button>
      </div>
    </form>

    <div class="alt">
      <h2>Picked the wrong one?</h2>
      <div class="alt-links">
        ${otherActions
          .map(
            (slug) =>
              `<a href="/r/${encodeURIComponent(task.responseToken)}/${encodeURIComponent(slug)}">${escapeHtml(
                RESPONSE_ACTIONS[slug].label,
              )}</a>`,
          )
          .join('')}
      </div>
    </div>

    <p class="foot">You can close this page now.</p>
  `;

  return shell({ title: meta.label, accent: theme.accent, inner });
}

export function renderChooser({ task, member }) {
  const inner = `
    <div class="badge">${THEME.neutral.icon}</div>
    <h1>How is this task going?</h1>
    <p>Pick one and ${escapeHtml(member.name || 'your manager')}&rsquo;s dashboard updates straight away.</p>
    <div class="task">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${task.dueAt ? `Due ${escapeHtml(new Date(task.dueAt).toLocaleString('en-GB'))}` : 'No due date'}</span>
    </div>
    <div class="alt-links" style="margin-top:20px">
      ${Object.keys(RESPONSE_ACTIONS)
        .map(
          (slug) =>
            `<a href="/r/${encodeURIComponent(task.responseToken)}/${encodeURIComponent(slug)}">${escapeHtml(
              RESPONSE_ACTIONS[slug].label,
            )}</a>`,
        )
        .join('')}
    </div>
  `;
  return shell({ title: 'Update your task', accent: THEME.neutral.accent, inner });
}

export function renderError({ title, message }) {
  const inner = `
    <div class="badge">${THEME.escalate.icon}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p class="foot">TaskChaser</p>
  `;
  return shell({ title, accent: THEME.escalate.accent, inner });
}
