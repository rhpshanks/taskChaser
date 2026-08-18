import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A stacking-order guard.
 *
 * The email dialog once rendered as an unusable blurred sheet: `.scrim` and
 * `.modal-card` are siblings inside `.modal`, which makes its own stacking
 * context, so the scrim's z-index of 60 painted the backdrop over the card and
 * swallowed every click. jsdom has no layout engine and cannot hit-test, so the
 * rule is asserted against the stylesheet itself.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'styles.css'), 'utf8');

/** Flat list of plain rules, comments removed. Nested at-rules are skipped. */
function declaredZIndexes(): Map<string, number> {
  const withoutComments = css.replace(/\/\*[^]*?\*\//g, '');
  const found = new Map<string, number>();

  for (const chunk of withoutComments.split('}')) {
    const brace = chunk.lastIndexOf('{');
    if (brace === -1) continue;

    // The selector is whatever follows the previous rule on its own line(s).
    const selector = chunk.slice(0, brace).trim().split('\n').pop()?.trim() ?? '';
    if (!selector || selector.startsWith('@')) continue;

    const match = /(?:^|;)\s*z-index\s*:\s*(-?\d+)/.exec(chunk.slice(brace + 1));
    // Later rules win, matching the cascade for equal specificity.
    if (match) found.set(selector, Number(match[1]));
  }
  return found;
}

const zIndex = declaredZIndexes();

function need(selector: string): number {
  const value = zIndex.get(selector);
  assert.ok(value !== undefined, `no z-index declared for "${selector}"`);
  return value as number;
}

test('the modal backdrop sits behind the dialog, not over it', () => {
  const scrim = need('.modal .scrim');
  const card = need('.modal-card');
  assert.ok(
    scrim < card,
    `.modal .scrim (${scrim}) must stack below .modal-card (${card}), or the dialog is unclickable`,
  );
});

test('the drawer backdrop sits behind the drawer panel', () => {
  const scrim = need('.scrim');
  const drawer = need('.drawer');
  assert.ok(scrim < drawer, `.scrim (${scrim}) must stack below .drawer (${drawer})`);
});
