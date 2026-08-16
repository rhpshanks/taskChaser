import { useMemo, useState } from 'react';

import { useStore } from './store';
import { isOverdue } from './lib/format';
import type { EmailDraft } from './types';

import { SignIn } from './components/SignIn';
import { Overview } from './components/Overview';
import { TasksView, type TaskFilter } from './components/TasksView';
import { TeamView } from './components/TeamView';
import { TaskDrawer } from './components/TaskDrawer';
import { EmailDialog } from './components/EmailDialog';
import {
  Avatar,
  Brandmark,
  IconHome,
  IconList,
  IconLogout,
  IconMoon,
  IconSun,
  IconUsers,
  Toasts,
} from './components/ui';

type Tab = 'overview' | 'tasks' | 'team';

const PAGE_META: Record<Tab, { title: string; sub: string }> = {
  overview: { title: 'Dashboard', sub: 'Everything at a glance' },
  tasks: { title: 'Tasks', sub: 'Write it, assign it, send it' },
  team: { title: 'Team', sub: 'The people you assign work to' },
};

export function App() {
  const store = useStore();
  const { user, ready, connected, tasks, members, toasts, dismissToast, theme, toggleTheme, signOut } = store;

  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);

  const openTask = useMemo(() => tasks.find((t) => t.id === openTaskId) ?? null, [tasks, openTaskId]);

  const needsAttention = useMemo(
    () => tasks.filter((t) => t.status === 'escalated' || (t.status !== 'done' && isOverdue(t.dueAt, t.status))).length,
    [tasks],
  );
  const openCount = useMemo(() => tasks.filter((t) => t.status !== 'done').length, [tasks]);

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>Loading…</div>
    );
  }

  if (!user) {
    return (
      <>
        <SignIn />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  function goToTasks(next: TaskFilter) {
    setFilter(next);
    setTab('tasks');
  }

  function openTaskFrom(id: string) {
    setOpenTaskId(id);
  }

  const page = PAGE_META[tab];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <Brandmark />
        </div>

        <div className="nav">
          <button
            className="nav-item"
            aria-current={tab === 'overview' ? 'page' : undefined}
            onClick={() => setTab('overview')}
          >
            <IconHome />
            Dashboard
            {needsAttention > 0 ? <span className="count alert">{needsAttention}</span> : null}
          </button>

          <button
            className="nav-item"
            aria-current={tab === 'tasks' ? 'page' : undefined}
            onClick={() => setTab('tasks')}
          >
            <IconList />
            Tasks
            <span className="count">{openCount}</span>
          </button>

          <button className="nav-item" aria-current={tab === 'team' ? 'page' : undefined} onClick={() => setTab('team')}>
            <IconUsers />
            Team
            <span className="count">{members.length}</span>
          </button>
        </div>

        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={user.fullName} />
            <div className="who">
              <strong>{user.fullName}</strong>
              <span>{user.title}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              title="Switch theme"
            >
              {theme === 'light' ? <IconMoon /> : <IconSun />}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={signOut} title="Sign out" aria-label="Sign out">
              <IconLogout />
            </button>
          </div>
        </div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{page.title}</h1>
            <div className="sub">{page.sub}</div>
          </div>
          <div className="spacer" />
          <span
            className={`live ${connected ? 'on' : 'off'}`}
            title={
              connected
                ? 'Connected. Replies from your team appear here without a refresh.'
                : 'Reconnecting to the server...'
            }
          >
            <span className="dot" />
            {connected ? 'Live' : 'Offline'}
          </span>
        </header>

        <div className="content">
          {tab === 'overview' ? <Overview goToTasks={goToTasks} onOpenTask={openTaskFrom} /> : null}
          {tab === 'tasks' ? (
            <TasksView
              filter={filter}
              setFilter={setFilter}
              openTaskId={openTaskId}
              onOpenTask={openTaskFrom}
              onDraft={setDraft}
            />
          ) : null}
          {tab === 'team' ? <TeamView /> : null}
        </div>
      </main>

      {openTask ? <TaskDrawer task={openTask} onClose={() => setOpenTaskId(null)} onDraft={setDraft} /> : null}
      {draft ? <EmailDialog draft={draft} onClose={() => setDraft(null)} /> : null}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
