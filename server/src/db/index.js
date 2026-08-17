import { createFileDb } from './file.js';
import { createInstantDb } from './instant.js';

/**
 * Picks the storage backend. InstantDB wins whenever it is configured, so a
 * deployment gets durable storage by setting two environment variables and
 * nothing else. Without them it falls back to the JSON file, which keeps local
 * runs and the test suite working with no credentials and no network.
 */
export function createDb({ dataDir, durable }) {
  // The suite must never reach a live database, whatever happens to be exported
  // into the environment on the machine running it.
  if (process.env.NODE_ENV === 'test') {
    return createFileDb({ dataDir, durable });
  }

  const appId = process.env.INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;

  if (appId && adminToken) {
    return createInstantDb({ appId, adminToken });
  }

  if (appId && !adminToken) {
    console.warn(
      '[db] INSTANT_APP_ID is set but INSTANT_ADMIN_TOKEN is missing, so InstantDB is not being used.',
    );
  }

  return createFileDb({ dataDir, durable });
}
