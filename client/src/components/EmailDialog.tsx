import { useState } from 'react';

import type { EmailDraft } from '../types';
import { IconCopy, IconMail, Modal } from './ui';

/**
 * Shown straight after the mail client has been handed the draft. `mailto:`
 * gives no success signal back, so the preview doubles as the fallback: if
 * Outlook did not come up, the whole message can be copied out of here.
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
      title="Outlook should be opening"
      subtitle="The message is already written. Send it as it is, or edit it first."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={copy}>
            <IconCopy />
            {copied ? 'Copied' : 'Copy email text'}
          </button>
          <a className="btn" href={draft.mailto}>
            <IconMail />
            Open again
          </a>
          <button className="btn btn-primary" onClick={onClose}>
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
        Nothing happened? Windows needs Outlook set as the default mail app. Use <b>Copy email text</b> in the
        meantime.
      </p>
    </Modal>
  );
}
