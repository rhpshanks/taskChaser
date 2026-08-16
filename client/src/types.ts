export type TaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'awaiting'
  | 'ready'
  | 'need_time'
  | 'escalated'
  | 'done';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface User {
  id: string;
  fullName: string;
  title: string;
  email: string;
  createdAt: string;
}

export interface Member {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface Task {
  id: string;
  ownerId: string;
  title: string;
  notes: string;
  dueAt: string | null;
  priority: Priority;
  assigneeId: string | null;
  status: TaskStatus;
  responseToken: string;
  notifiedAt: string | null;
  respondedAt: string | null;
  responseNote: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  ownerId: string;
  taskId: string | null;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
}

/** Whether the server it is talking to can actually keep the data. */
export interface StorageInfo {
  durable: boolean;
  dir: string;
}

export interface Snapshot {
  members: Member[];
  tasks: Task[];
  events: ActivityEvent[];
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  mailto: string;
  task: Task;
}
