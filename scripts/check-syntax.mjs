import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const rootScripts = [
  'dashboard.js',
  'patient-summary.js',
  'splash.js',
  'treatment-plan.js',
  'statistics.js',
  'appointment-request.js',
  'appointment-requests.js',
  'lab.js',
  'prescription.js',
  'service-worker.js',
  'offline.js'
];

const functionScripts = (await readdir(new URL('../netlify/functions/', import.meta.url)))
  .filter(name => name.endsWith('.mjs'))
  .map(name => `netlify/functions/${name}`);

for (const file of [...rootScripts, ...functionScripts]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
