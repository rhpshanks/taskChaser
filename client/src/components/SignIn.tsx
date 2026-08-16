import { useState, type FormEvent } from 'react';

import { useStore } from '../store';
import { Brandmark } from './ui';

const STEPS = [
  'Add the people you work with, once.',
  'Type a task the way you would say it: "write brief today at 4pm".',
  'Hit Inform via Email. Outlook opens with the message already written.',
  'They tap Task Ready, Need Time or Escalation. Your board updates itself.',
];

export function SignIn() {
  const { signIn } = useStore();
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signIn({ fullName: fullName.trim(), title: title.trim(), email: email.trim() });
    } catch {
      // The store has already raised a toast; keep the form filled in.
    } finally {
      setBusy(false);
    }
  }

  const complete = fullName.trim() && title.trim() && email.trim();

  return (
    <div className="signin">
      <aside className="signin-brand">
        <Brandmark />
        <div>
          <h1>Stop chasing people for status.</h1>
          <p className="lede">
            Assign the task, send one email, and let their answer update your dashboard. No logins for your team, no
            app for them to install.
          </p>
          <ol className="signin-steps">
            {STEPS.map((step, index) => (
              <li className="signin-step" key={step}>
                <span className="num">{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Your data stays on the machine running this app.</p>
      </aside>

      <main className="signin-form">
        <form onSubmit={onSubmit}>
          <div>
            <h2>Welcome to TaskChaser</h2>
            <p className="sub">Tell us who you are and your board is ready.</p>
          </div>

          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ayesha Malik"
              autoComplete="name"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Head of Operations"
              autoComplete="organization-title"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
            <span className="hint">Used as the sender on the emails you send from here.</span>
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={!complete || busy}>
            {busy ? 'Opening your board...' : 'Go to dashboard'}
          </button>

          <p className="hint" style={{ textAlign: 'center' }}>
            Signing in with an email you have used before reopens that board.
          </p>
        </form>
      </main>
    </div>
  );
}
