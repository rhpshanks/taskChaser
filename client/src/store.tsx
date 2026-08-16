import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, api, session } from './api';
import type { ActivityEvent, EmailDraft, Member, Snapshot, StorageInfo, Task, User } from './types';

/**
 * Server-Sent Events give instant updates, but they cannot be relied on
 * everywhere: a serverless host kills the connection at its function timeout,
 * and a reply handled by one instance never reaches a dashboard held open by
 * another. Polling alongside the stream keeps the board correct on any host.
 */
const POLL_MS = 8000;

/** The statuses that mean a team member actually answered the email. */
const ANSWERED = new Set(['ready', 'need_time', 'escalated']);

type ToastKind = 'ok' | 'err' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface StoreValue extends Snapshot {
  user: User | null;
  ready: boolean;
  connected: boolean;
  storage: StorageInfo | null;
  toasts: Toast[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  dismissToast: (id: number) => void;
  notify: (title: string, detail?: string, kind?: ToastKind) => void;
  signIn: (input: { fullName: string; title: string; email: string }) => Promise<void>;
  signOut: () => void;
  addMember: (input: { name: string; email: string; role: string }) => Promise<void>;
  updateMember: (id: string, patch: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  addTask: (input: Parameters<typeof api.addTask>[0]) => Promise<Task>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  informByEmail: (id: string) => Promise<EmailDraft>;
}

const StoreContext = createContext<StoreValue | null>(null);

const THEME_KEY = 'taskchaser.theme';

function readTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);

  const toastId = useRef(0);
  /** Statuses at the last render, so an incoming reply can announce itself. */
  const lastStatuses = useRef(new Map<string, string>());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const notify = useCallback((title: string, detail?: string, kind: ToastKind = 'info') => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, kind, title, detail }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  /**
   * The single path a snapshot takes into the UI, whether it arrived over the
   * stream, from a poll, or at sign-in. Announcing here rather than at the
   * call sites means an answer raises exactly one toast no matter which
   * transport noticed it first.
   */
  const ingest = useCallback(
    (snapshot: Snapshot, { announce = true }: { announce?: boolean } = {}) => {
      if (announce) {
        for (const task of snapshot.tasks) {
          const before = lastStatuses.current.get(task.id);
          if (before && before !== task.status && ANSWERED.has(task.status)) {
            const who = snapshot.members.find((m) => m.id === task.assigneeId)?.name ?? 'Someone';
            const said =
              task.status === 'ready' ? 'Task Ready' : task.status === 'need_time' ? 'Need Time' : 'Escalation';
            notify(`${who}: ${said}`, task.title, task.status === 'escalated' ? 'err' : 'ok');
          }
        }
      }
      lastStatuses.current = new Map(snapshot.tasks.map((t) => [t.id, t.status]));
      setMembers(snapshot.members);
      setTasks(snapshot.tasks);
      setEvents(snapshot.events);
    },
    [notify],
  );

  const fail = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      notify('That did not work', message, 'err');
      throw err;
    },
    [notify],
  );

  /* ---------------------------------------------------- restore a session */

  useEffect(() => {
    const id = session.get();
    if (!id) {
      setReady(true);
      return;
    }
    api
      .bootstrap()
      .then((data) => {
        setUser(data.user);
        setStorage(data.storage ?? null);
        ingest(data, { announce: false });
      })
      .catch(() => session.clear())
      .finally(() => setReady(true));
  }, [ingest]);

  /* --------------------------------------- live updates from email replies */

  useEffect(() => {
    if (!user) {
      setConnected(false);
      return;
    }
    const source = new EventSource(`/api/stream?u=${encodeURIComponent(user.id)}`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Snapshot & { type: string };
        if (payload.type === 'sync') ingest(payload);
      } catch {
        /* a malformed frame is not worth tearing the stream down for */
      }
    };

    return () => source.close();
  }, [user, ingest]);

  /* ------------------------- polling, for hosts where the stream cannot hold */

  useEffect(() => {
    if (!user) return;

    let stopped = false;
    const tick = async () => {
      // Nothing to refresh for a hidden tab, and it keeps idle hosts quiet.
      if (document.hidden || stopped) return;
      try {
        const data = await api.bootstrap();
        if (!stopped) ingest(data);
      } catch (err) {
        // A dead session would otherwise retry forever; anything else (the
        // server restarting, a flaky network) is worth another tick.
        if (err instanceof ApiError && err.status === 401) {
          stopped = true;
          session.clear();
          setUser(null);
        }
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [user, ingest]);

  /* ---------------------------------------------------------------- actions */

  const value = useMemo<StoreValue>(
    () => ({
      user,
      members,
      tasks,
      events,
      ready,
      connected,
      storage,
      toasts,
      theme,
      notify,
      dismissToast,
      toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),

      async signIn(input) {
        try {
          const data = await api.signIn(input);
          session.set(data.user.id);
          setUser(data.user);
          setStorage(data.storage ?? null);
          ingest(data, { announce: false });
        } catch (err) {
          fail(err);
        }
      },

      signOut() {
        session.clear();
        setUser(null);
        setMembers([]);
        setTasks([]);
        setEvents([]);
        lastStatuses.current = new Map();
      },

      async addMember(input) {
        try {
          await api.addMember(input);
          notify('Team member added', `${input.name} can now be assigned tasks.`, 'ok');
        } catch (err) {
          fail(err);
        }
      },

      async updateMember(id, patch) {
        try {
          await api.updateMember(id, patch);
        } catch (err) {
          fail(err);
        }
      },

      async removeMember(id) {
        try {
          await api.removeMember(id);
          notify('Team member removed', 'Their tasks are back in the unassigned pile.', 'ok');
        } catch (err) {
          fail(err);
        }
      },

      async addTask(input) {
        try {
          return await api.addTask(input);
        } catch (err) {
          return fail(err) as never;
        }
      },

      async updateTask(id, patch) {
        try {
          await api.updateTask(id, patch);
        } catch (err) {
          fail(err);
        }
      },

      async removeTask(id) {
        try {
          await api.removeTask(id);
          notify('Task deleted', undefined, 'ok');
        } catch (err) {
          fail(err);
        }
      },

      async informByEmail(id) {
        try {
          return await api.notify(id);
        } catch (err) {
          return fail(err) as never;
        }
      },
    }),
    [user, members, tasks, events, ready, connected, storage, toasts, theme, notify, dismissToast, ingest, fail],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}
