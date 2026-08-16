import type { EmailDraft, Member, Snapshot, StorageInfo, Task, User } from './types';

type Bootstrap = { user: User; storage: StorageInfo } & Snapshot;

const SESSION_KEY = 'taskchaser.userId';

export const session = {
  get: () => localStorage.getItem(SESSION_KEY),
  set: (id: string) => localStorage.setItem(SESSION_KEY, id),
  clear: () => localStorage.removeItem(SESSION_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const userId = session.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-TC-User': userId } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (payload as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  signIn: (input: { fullName: string; title: string; email: string }) =>
    request<Bootstrap>('/session', { method: 'POST', body: body(input) }),

  bootstrap: () => request<Bootstrap>('/bootstrap'),

  addMember: (input: { name: string; email: string; role: string }) =>
    request<Member>('/members', { method: 'POST', body: body(input) }),

  updateMember: (id: string, patch: Partial<Pick<Member, 'name' | 'email' | 'role'>>) =>
    request<Member>(`/members/${id}`, { method: 'PATCH', body: body(patch) }),

  removeMember: (id: string) => request<void>(`/members/${id}`, { method: 'DELETE' }),

  addTask: (input: {
    title: string;
    notes?: string;
    dueAt?: string | null;
    priority?: string;
    assigneeId?: string | null;
  }) => request<Task>('/tasks', { method: 'POST', body: body(input) }),

  updateTask: (id: string, patch: Record<string, unknown>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: body(patch) }),

  removeTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  notify: (id: string) =>
    request<EmailDraft>(`/tasks/${id}/notify`, {
      method: 'POST',
      body: body({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    }),
};
