import { useEffect, type ReactNode } from 'react';

import { STATUS_META, initials } from '../lib/format';
import type { TaskStatus } from '../types';

/* ------------------------------------------------------------------ icons */

type IconProps = { size?: number };

const svg = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconHome = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

export const IconList = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const IconUsers = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconMail = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
);

export const IconCheck = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconClock = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconAlert = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 9v5M12 17.5h.01" />
  </svg>
);

export const IconSearch = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconPlus = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconX = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconTrash = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export const IconSun = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const IconInbox = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7Z" />
  </svg>
);

export const IconLogout = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);

export const IconEdit = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const IconCopy = ({ size = 15 }: IconProps) => (
  <svg {...svg(size)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/* ------------------------------------------------------------- components */

export function Brandmark({ label = 'TaskChaser' }: { label?: string }) {
  return (
    <span className="brandmark">
      <span className="mark">
        <IconCheck size={15} />
      </span>
      {label}
    </span>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'avatar avatar-lg' : size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  return (
    <span className={cls} title={name} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ status, short = false }: { status: TaskStatus; short?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge s-${status}`}>
      <span className="dot" />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function EmptyState({
  glyph,
  title,
  children,
  action,
}: {
  glyph?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="glyph">{glyph ?? <IconInbox />}</span>
      <h4>{title}</h4>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Escape hatches every dialog should have: Escape to close, click the scrim. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scrim" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-head">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; kind: string; title: string; detail?: string }[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <div className="body">
            <strong>{toast.title}</strong>
            {toast.detail ? <p>{toast.detail}</p> : null}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
