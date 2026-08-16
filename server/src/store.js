import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny JSON-file store. Everything lives in memory and is flushed to disk on
 * every mutation via a write-to-temp-then-rename, so a crash mid-write cannot
 * leave a half-written file behind.
 *
 * Deliberately dependency-free: TaskChaser is meant to run on a laptop or a
 * single small box with `npm install && npm start`, no database to provision.
 */

const EMPTY = { users: [], members: [], tasks: [], events: [] };

export function createStore({ dataDir }) {
  const file = path.join(dataDir, 'taskchaser.json');
  let data = load();
  let writeQueued = false;

  function load() {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...structuredClone(EMPTY), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // A corrupt file is worth shouting about rather than silently wiping.
        console.error(`[store] could not read ${file}:`, err.message);
        const backup = `${file}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(file, backup);
          console.error(`[store] moved the unreadable file to ${backup}`);
        } catch {
          /* nothing more we can do */
        }
      }
      return structuredClone(EMPTY);
    }
  }

  function flush() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  /** Coalesce bursts of mutations into one disk write per tick. */
  function save() {
    if (writeQueued) return;
    writeQueued = true;
    queueMicrotask(() => {
      writeQueued = false;
      try {
        flush();
      } catch (err) {
        console.error('[store] write failed:', err.message);
      }
    });
  }

  return {
    get data() {
      return data;
    },
    save,
    flushNow: flush,
    /** Test helper: wipe everything back to an empty workspace. */
    reset() {
      data = structuredClone(EMPTY);
      save();
    },
  };
}
