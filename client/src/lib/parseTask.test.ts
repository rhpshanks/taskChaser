import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTaskInput } from './parseTask.ts';

// Monday, 17 August 2026 at 10:00 local time.
const NOW = new Date(2026, 7, 17, 10, 0, 0, 0);

function due(input: string) {
  const parsed = parseTaskInput(input, NOW);
  assert.ok(parsed.dueAt, `expected a due date for "${input}"`);
  const d = parsed.dueAt;
  return {
    title: parsed.title,
    priority: parsed.priority,
    stamp: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
      d.getHours(),
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

test('the headline example from the brief', () => {
  const result = due('write brief today at 4pm');
  assert.equal(result.title, 'write brief');
  assert.equal(result.stamp, '2026-08-17 16:00');
});

test('a bare day falls back to end of the working day', () => {
  assert.equal(due('send invoices tomorrow').stamp, '2026-08-18 17:00');
  assert.equal(due('review deck today').stamp, '2026-08-17 17:00');
});

test('phrases that imply their own time', () => {
  assert.equal(due('call the printer tonight').stamp, '2026-08-17 20:00');
  assert.equal(due('ship the build eod').stamp, '2026-08-17 18:00');
  assert.equal(due('close the sprint eow').stamp, '2026-08-21 18:00');
  assert.equal(due('plan roadmap next week').stamp, '2026-08-24 09:00');
});

test('weekday names resolve forwards, and "next" jumps a week', () => {
  assert.equal(due('review PR by friday').title, 'review PR');
  assert.equal(due('review PR by friday').stamp, '2026-08-21 17:00');
  assert.equal(due('retro next tuesday at 11am').stamp, '2026-08-25 11:00');
});

test('relative offsets', () => {
  assert.equal(due('ping the vendor in 2 hours').stamp, '2026-08-17 12:00');
  assert.equal(due('follow up in 3 days').stamp, '2026-08-20 10:00');
  assert.equal(due('nudge finance in 30 mins').stamp, '2026-08-17 10:30');
});

test('calendar dates, written either way round', () => {
  assert.equal(due('submit filing 25 aug at 3pm').stamp, '2026-08-25 15:00');
  assert.equal(due('submit filing Aug 25').stamp, '2026-08-25 17:00');
  assert.equal(due('submit filing 25/08').stamp, '2026-08-25 17:00');
  assert.equal(due('submit filing 03/09/2027').stamp, '2027-09-03 17:00');
});

test('a date that has already passed this year rolls to next year', () => {
  assert.equal(due('renew licence 3 feb').stamp, '2027-02-03 17:00');
});

test('a bare hour is read as working hours, and rolls over if it has passed', () => {
  assert.equal(due('call vendor at 4').stamp, '2026-08-17 16:00');
  assert.equal(due('standup at 9am').stamp, '2026-08-18 09:00', 'nine has already gone, so tomorrow');
  assert.equal(due('sync at 16:30').stamp, '2026-08-17 16:30');
});

test('priority markers are lifted out of the title', () => {
  const bang = due('ship deck !high tomorrow 9am');
  assert.equal(bang.title, 'ship deck');
  assert.equal(bang.priority, 'high');
  assert.equal(bang.stamp, '2026-08-18 09:00');

  const word = parseTaskInput('urgent fix the login bug', NOW);
  assert.equal(word.priority, 'urgent');
  assert.equal(word.title, 'fix the login bug');
});

test('text with no date at all is left completely alone', () => {
  const parsed = parseTaskInput('refactor the onboarding flow', NOW);
  assert.equal(parsed.dueAt, null);
  assert.equal(parsed.title, 'refactor the onboarding flow');
  assert.equal(parsed.priority, 'normal');
});

test('empty input does not throw', () => {
  const parsed = parseTaskInput('   ', NOW);
  assert.equal(parsed.title, '');
  assert.equal(parsed.dueAt, null);
});

test('digits inside a date are never re-read as a clock time', () => {
  assert.equal(due('prepare 25 aug board pack').stamp, '2026-08-25 17:00');
  assert.equal(due('order 3 laptops tomorrow').title, 'order 3 laptops');
});
