import { useState } from 'react';

import type { EmailDraft } from '../types';
import { IconCopy, IconMail, Modal } from './ui';

/**
 * Shown straight after the mail client has been handed the draft.
 *
 * `mailto:` reports nothing back, so there is no way to know whether the mail
 * app actually came up. This dialog is therefore both the confirmation and the
 * recovery path: a real anchor the user can click (which carries proper user
 * activation, unlike the automatic attempt made after an awaited API call), and
 * the full text to copy if no mail app is registered at all.
 */
export function EmailDialog({ draft, onClose }: { draft: EmailDraft; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      title="Your email is ready"
      subtitle="Your mail app should have opened with this already written. If it did not, use the button below."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={copy}>
            <IconCopy />
            {copied ? 'Copied' : 'Copy email text'}
          </button>
          {/* A genuine click here carries user activation, so this is the most
              dependable way to reach the mail app. */}
          <a className="btn btn-primary" href={draft.mailto}>
            <IconMail />
            Open mail app
          </a>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        The three links at the bottom are the buttons your team member taps. Whichever one they pick lands on this
        dashboard within a second, so there is nothing to chase up.
      </p>

      <div className="preview">
        <div className="to">
          To <b>{draft.to}</b>
        </div>
        <div className="to">
          Subject <b>{draft.subject}</b>
        </div>
        <pre>{draft.body}</pre>
      </div>

      <p className="hint">
        Nothing opened? Windows needs a default mail app set under <b>Settings → Apps → Default apps</b>. Until then,
        <b> Copy email text</b> gets you the whole message.
      </p>
    </Modal>
  );
}
