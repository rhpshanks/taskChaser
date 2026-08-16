import { useMemo, useState, type FormEvent } from 'react';

import { useStore } from '../store';
import { STATUS_META } from '../lib/format';
import type { Member, TaskStatus } from '../types';
import { Avatar, EmptyState, IconCheck, IconEdit, IconPlus, IconTrash, IconUsers } from './ui';

const TALLY_ORDER: TaskStatus[] = ['escalated', 'need_time', 'awaiting', 'assigned', 'ready'];

function AddMemberForm() {
  const { addMember } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await addMember({ name: name.trim(), email: email.trim(), role: role.trim() });
      setName('');
      setEmail('');
      setRole('');
    } catch {
      // Keep what was typed so it can be corrected.
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="card-head">
        <div>
          <h3>Add a team member</h3>
          <span className="sub">Their email is where the task notification goes.</span>
        </div>
      </div>
      <div className="card-body">
        <div className="member-form">
          <div className="field">
            <label htmlFor="m-name">Name</label>
            <input
              id="m-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sara Khan"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="m-email">Email</label>
            <input
              id="m-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sara@company.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="m-role">Role (optional)</label>
            <input
              id="m-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Content Lead"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !email.trim()}>
            <IconPlus />
            Add
          </button>
        </div>
      </div>
    </form>
  );
}

function MemberCard({ member }: { member: Member }) {
  const { tasks, updateMember, removeMember } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState(member.role);

  const tally = useMemo(() => {
    const mine = tasks.filter((task) => task.assigneeId === member.id);
    const counts = new Map<TaskStatus, number>();
    for (const task of mine) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    return { total: mine.length, counts };
  }, [tasks, member.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await updateMember(member.id, { name: name.trim(), email: email.trim(), role: role.trim() });
    setEditing(false);
  }

  function confirmRemove() {
    const open = tally.total;
    const warning = open
      ? `Remove ${member.name}? Their ${open} task${open === 1 ? '' : 's'} will go back to unassigned.`
      : `Remove ${member.name} from the team?`;
    if (window.confirm(warning)) void removeMember(member.id);
  }

  if (editing) {
    return (
      <form className="member-card" onSubmit={save}>
        <div className="field">
          <label htmlFor={`n-${member.id}`}>Name</label>
          <input id={`n-${member.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`e-${member.id}`}>Email</label>
          <input
            id={`e-${member.id}`}
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`r-${member.id}`}>Role</label>
          <input id={`r-${member.id}`} className="input" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" type="submit">
            <IconCheck size={14} />
            Save
          </button>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              setName(member.name);
              setEmail(member.email);
              setRole(member.role);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="member-card">
      <div className="top">
        <Avatar name={member.name} size="lg" />
        <div className="who">
          <strong>{member.name}</strong>
          <div className="role">{member.role || 'Team member'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${member.name}`}>
          <IconEdit />
        </button>
        <button className="btn btn-danger btn-sm" onClick={confirmRemove} aria-label={`Remove ${member.name}`}>
          <IconTrash />
        </button>
      </div>

      <a className="mail" href={`mailto:${member.email}`} onClick={(e) => e.stopPropagation()}>
        {member.email}
      </a>

      <div className="tally">
        {tally.total === 0 ? (
          <span className="chip">No tasks yet</span>
        ) : (
          <>
            <span className="chip">
              {tally.total} task{tally.total === 1 ? '' : 's'}
            </span>
            {TALLY_ORDER.filter((status) => tally.counts.get(status)).map((status) => (
              <span key={status} className={`badge s-${status}`}>
                <span className="dot" />
                {tally.counts.get(status)} {STATUS_META[status].short.toLowerCase()}
              </span>
            ))}
          </>
        )}
      </div>
    </article>
  );
}

export function TeamView() {
  const { members } = useStore();

  return (
    <>
      <AddMemberForm />

      {members.length === 0 ? (
        <div className="card">
          <EmptyState glyph={<IconUsers size={20} />} title="Your team list is empty">
            Add the people you assign work to. You only do this once, and their email is what makes the Inform via
            Email button work.
          </EmptyState>
        </div>
      ) : (
        <div className="team-grid">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </>
  );
}
