import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pages = ['index.html', 'statistics.html', 'appointment-request.html', 'appointment-requests.html', 'lab.html', 'treatment-plan.html', 'plan-consent.html'];

test('HTML pages have unique element ids', async () => {
  for (const page of pages) {
    const html = await readFile(resolve(page), 'utf8');
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)]
      .map(match => match[1])
      .filter(id => !id.includes('${'));
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${page} duplicate ids: ${duplicates.join(', ')}`);
  }
});

test('inline scripts parse without syntax errors', async () => {
  for (const page of pages) {
    const html = await readFile(resolve(page), 'utf8');
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    for (const [index, source] of scripts.entries()) {
      assert.doesNotThrow(() => new Function(source), `${page} inline script ${index + 1}`);
    }
  }
});
