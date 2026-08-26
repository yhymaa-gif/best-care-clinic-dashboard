import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist-cloudflare');
const staticConfig = join(root, 'cloudflare', 'static');
const rootExtensions = new Set(['.css', '.csv', '.html', '.js', '.png', '.webmanifest']);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isFile() || !rootExtensions.has(extname(entry.name))) continue;
  await cp(join(root, entry.name), join(output, entry.name));
}

await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
await cp(join(staticConfig, '_headers'), join(output, '_headers'));
await cp(join(staticConfig, '_redirects'), join(output, '_redirects'));

console.log('Cloudflare static assets prepared without server code or repository metadata.');
