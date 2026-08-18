/**
 * Hands a `mailto:` URL to the operating system's default mail client.
 *
 * Assigning `window.location.href` is unreliable for this. It runs after an
 * awaited API call, so the browser's transient user activation may already have
 * lapsed, and browsers gate launching an external protocol on that activation.
 * A protocol with no registered handler can also leave a top-level navigation
 * half-done. Clicking a detached anchor is the form browsers handle most
 * consistently, and it cannot strand the page.
 */
export function openMailClient(mailto: string): void {
  const link = document.createElement('a');
  link.href = mailto;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Removing it in the same tick can cancel the launch in some browsers.
  window.setTimeout(() => link.remove(), 0);
}
