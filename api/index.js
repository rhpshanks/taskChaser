/**
 * Vercel serverless entry point.
 *
 * `vercel.json` rewrites both `/api/*` and `/r/*` here, so this one function
 * serves the JSON API and the pages the three email links land on. The Express
 * app is used as a plain (req, res) handler, which is exactly what Vercel's
 * Node runtime expects.
 *
 * The static dashboard is NOT served from here: Vercel publishes `client/dist`
 * to its CDN directly.
 */
export { app as default } from '../server/src/index.js';
