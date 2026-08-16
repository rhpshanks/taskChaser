import type { Priority } from '../types';

/**
 * Turns one typed line ("write brief today at 4pm") into a title plus a due
 * date, so adding a task never means filling in a form.
 *
 * The rules are deliberately narrow and readable rather than a full date
 * grammar: everything it fails to recognise simply stays in the title, which is
 * a much better failure than guessing a wrong deadline.
 */

export interface ParsedTask {
  title: string;
  dueAt: Date | null;
  priority: Priority;
  /** The fragments that were consumed, for showing the user what was understood. */
  matched: string[];
}

const DEFAULT_HOUR = 17; // A bare day means "by end of the working day".

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');
const WEEKDAY_NAMES = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

interface Span {
  start: number;
  end: number;
}

function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * "4" on its own is far more often 4pm than 4am for work tasks, so anything
 * before 7 is nudged into the afternoon. An explicit am/pm always wins.
 */
function resolveHour(raw: number, meridiem: string | undefined): number {
  const hour = raw % 24;
  if (meridiem) {
    const pm = meridiem.startsWith('p');
    if (hour === 12) return pm ? 12 : 0;
    return pm ? hour + 12 : hour;
  }
  if (hour >= 1 && hour < 7) return hour + 12;
  return hour;
}

/** Time of day, e.g. "at 4pm", "by 16:30", "noon". Returns hour/minute + span. */
function matchTime(text: string): { hour: number; minute: number; span: Span } | null {
  const named = /\b(noon|midday|midnight)\b/i.exec(text);
  if (named) {
    const word = named[1]!.toLowerCase();
    return {
      hour: word === 'midnight' ? 23 : 12,
      minute: word === 'midnight' ? 59 : 0,
      span: { start: named.index, end: named.index + named[0].length },
    };
  }

  // "at 4pm", "at 4:30 pm", "4pm", "@ 16:30", "by 9.30am"
  const clock =
    /(?:\b(?:at|by|@)\s*)?\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i.exec(text) ??
    /\b(?:at|by|@)\s*(\d{1,2})[:.](\d{2})\b/i.exec(text) ??
    /\b(?:at|by|@)\s*(\d{1,2})\b(?!\s*(?:st|nd|rd|th|\/|-))/i.exec(text);

  if (!clock) return null;

  const raw = Number(clock[1]);
  if (!Number.isFinite(raw) || raw > 24) return null;

  const meridiem = clock[3]?.toLowerCase().replace(/\./g, '');
  const hasExplicit24 = !meridiem && clock[2] !== undefined;

  return {
    hour: hasExplicit24 ? raw % 24 : resolveHour(raw, meridiem),
    minute: clock[2] ? Number(clock[2]) : 0,
    span: { start: clock.index, end: clock.index + clock[0].length },
  };
}

interface DayMatch {
  date: Date;
  span: Span;
  /** Set when the phrase already pinned an exact time, e.g. "in 2 hours". */
  exact?: boolean;
  /** A default hour the phrase implies, e.g. "tonight" -> 20. */
  impliedHour?: number;
  impliedMinute?: number;
}

function matchDay(text: string, now: Date): DayMatch | null {
  const today = startOfDay(now);

  // Order matters: longer phrases are tried before the shorter ones they contain.
  const dayAfter = /\bday after tomorrow\b/i.exec(text);
  if (dayAfter) {
    return { date: addDays(today, 2), span: { start: dayAfter.index, end: dayAfter.index + dayAfter[0].length } };
  }

  const relative = /\bin\s+(a|an|\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks)\b/i.exec(text);
  if (relative) {
    const word = relative[1]!.toLowerCase();
    const count = word === 'a' || word === 'an' ? 1 : Number(word);
    const unit = relative[2]!.toLowerCase();
    const date = new Date(now);
    if (unit.startsWith('min')) date.setMinutes(date.getMinutes() + count);
    else if (unit.startsWith('h')) date.setHours(date.getHours() + count);
    else if (unit.startsWith('d')) date.setDate(date.getDate() + count);
    else date.setDate(date.getDate() + count * 7);
    date.setSeconds(0, 0);
    return {
      date,
      exact: true,
      span: { start: relative.index, end: relative.index + relative[0].length },
    };
  }

  const nextWeek = /\bnext week\b/i.exec(text);
  if (nextWeek) {
    const delta = ((1 - today.getDay() + 7) % 7) + 7; // Monday of next week
    return {
      date: addDays(today, delta),
      impliedHour: 9,
      span: { start: nextWeek.index, end: nextWeek.index + nextWeek[0].length },
    };
  }

  const named =
    /\b(today|tonight|this evening|this afternoon|this morning|tomorrow morning|tomorrow|tmrw|tmw|eod|end of day|eow|end of week)\b/i.exec(
      text,
    );
  if (named) {
    const phrase = named[1]!.toLowerCase();
    const span = { start: named.index, end: named.index + named[0].length };
    switch (phrase) {
      case 'today':
        return { date: today, span };
      case 'tonight':
      case 'this evening':
        return { date: today, impliedHour: 20, span };
      case 'this afternoon':
        return { date: today, impliedHour: 14, span };
      case 'this morning':
        return { date: today, impliedHour: 9, span };
      case 'eod':
      case 'end of day':
        return { date: today, impliedHour: 18, span };
      case 'tomorrow morning':
        return { date: addDays(today, 1), impliedHour: 9, span };
      case 'tomorrow':
      case 'tmrw':
      case 'tmw':
        return { date: addDays(today, 1), span };
      case 'eow':
      case 'end of week': {
        const delta = (5 - today.getDay() + 7) % 7; // upcoming Friday
        return { date: addDays(today, delta), impliedHour: 18, span };
      }
    }
  }

  // "25 Aug", "25th August", "Aug 25"
  const dayMonth = new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`, 'i').exec(text);
  const monthDay = new RegExp(`\\b(?:on\\s+)?(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i').exec(text);
  const calendar = dayMonth
    ? { day: Number(dayMonth[1]), month: MONTHS[dayMonth[2]!.toLowerCase()]!, match: dayMonth }
    : monthDay
      ? { day: Number(monthDay[2]), month: MONTHS[monthDay[1]!.toLowerCase()]!, match: monthDay }
      : null;

  if (calendar && calendar.day >= 1 && calendar.day <= 31) {
    const date = new Date(today.getFullYear(), calendar.month, calendar.day);
    // A date that has already gone by means they mean next year.
    if (date < today) date.setFullYear(date.getFullYear() + 1);
    return {
      date,
      span: { start: calendar.match.index, end: calendar.match.index + calendar.match[0].length },
    };
  }

  // "25/08", "25-08-2026" (day-first, matching the user's locale conventions)
  const numeric = /\b(?:on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      let year = today.getFullYear();
      if (numeric[3]) {
        const parsed = Number(numeric[3]);
        year = parsed < 100 ? 2000 + parsed : parsed;
      }
      const date = new Date(year, month, day);
      if (!numeric[3] && date < today) date.setFullYear(year + 1);
      return { date, span: { start: numeric.index, end: numeric.index + numeric[0].length } };
    }
  }

  // "friday", "on monday", "next tuesday"
  const weekday = new RegExp(`\\b(?:(next|this|on|by)\\s+)?(${WEEKDAY_NAMES})\\b`, 'i').exec(text);
  if (weekday) {
    const qualifier = weekday[1]?.toLowerCase();
    const target = WEEKDAYS[weekday[2]!.toLowerCase()]!;
    let delta = (target - today.getDay() + 7) % 7;
    if (qualifier === 'next') delta = delta === 0 ? 7 : delta + 7;
    return {
      date: addDays(today, delta),
      span: { start: weekday.index, end: weekday.index + weekday[0].length },
    };
  }

  return null;
}

function matchPriority(text: string): { priority: Priority; span: Span } | null {
  const bang = /\s*!(low|normal|high|urgent)\b/i.exec(text);
  if (bang) {
    return {
      priority: bang[1]!.toLowerCase() as Priority,
      span: { start: bang.index, end: bang.index + bang[0].length },
    };
  }
  const word = /\b(urgent|asap|high priority|top priority|low priority)\b/i.exec(text);
  if (word) {
    const phrase = word[1]!.toLowerCase();
    const priority: Priority = phrase === 'low priority' ? 'low' : phrase === 'urgent' || phrase === 'asap' ? 'urgent' : 'high';
    return { priority, span: { start: word.index, end: word.index + word[0].length } };
  }
  return null;
}

function stripSpans(text: string, spans: Span[]): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const span of ordered) {
    out = out.slice(0, span.start) + ' ' + out.slice(span.end);
  }
  return out
    .replace(/\s+/g, ' ')
    // Clean up prepositions and separators left dangling by the removals.
    .replace(/\s*[,;]\s*$/g, '')
    .replace(/\b(due|by|on|at|before)\s*$/i, '')
    .replace(/^\s*(due|by|on|at)\b\s*/i, '')
    .trim();
}

export function parseTaskInput(input: string, now: Date = new Date()): ParsedTask {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return { title: '', dueAt: null, priority: 'normal', matched: [] };

  const spans: Span[] = [];
  const matched: string[] = [];

  const priorityHit = matchPriority(text);
  if (priorityHit) {
    spans.push(priorityHit.span);
    matched.push(text.slice(priorityHit.span.start, priorityHit.span.end).trim());
  }

  const dayHit = matchDay(text, now);
  if (dayHit) {
    spans.push(dayHit.span);
    matched.push(text.slice(dayHit.span.start, dayHit.span.end).trim());
  }

  // A time phrase must not be re-read out of the day phrase it belongs to
  // (e.g. the "25" of "25 Aug", or the "2" of "in 2 hours").
  const timeSearchable = dayHit
    ? text.slice(0, dayHit.span.start) + ' '.repeat(dayHit.span.end - dayHit.span.start) + text.slice(dayHit.span.end)
    : text;
  const timeHit = dayHit?.exact ? null : matchTime(timeSearchable);
  if (timeHit) {
    spans.push(timeHit.span);
    matched.push(text.slice(timeHit.span.start, timeHit.span.end).trim());
  }

  let dueAt: Date | null = null;
  if (dayHit?.exact) {
    dueAt = dayHit.date;
  } else if (dayHit || timeHit) {
    const base = dayHit ? new Date(dayHit.date) : startOfDay(now);
    const hour = timeHit?.hour ?? dayHit?.impliedHour ?? DEFAULT_HOUR;
    const minute = timeHit?.minute ?? dayHit?.impliedMinute ?? 0;
    base.setHours(hour, minute, 0, 0);
    // A bare time that has already passed today means tomorrow.
    if (!dayHit && base.getTime() <= now.getTime()) base.setDate(base.getDate() + 1);
    dueAt = base;
  }

  return {
    title: stripSpans(text, spans) || text,
    dueAt,
    priority: priorityHit?.priority ?? 'normal',
    matched,
  };
}
