// Runs every automated check: unit tests, E2E in Chromium and WebKit, and (with --bench) the OCR benchmark.
import { spawnSync } from 'node:child_process';
const run = (cmd, args, env = {}) => { console.log(`\n$ ${[cmd, ...args].join(' ')}`); const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: false }); return r.status === 0; };
const node = process.execPath;
const results = {
  unit: run(node, ['--test', 'unit.test.mjs']),
  e2eChromium: run(node, ['--test', '--test-concurrency=1', 'e2e.test.mjs']),
  e2eWebkit: run(node, ['--test', '--test-concurrency=1', 'e2e.test.mjs'], { BROWSER: 'webkit' }),
};
if (process.argv.includes('--bench')) results.benchChromium = run(node, ['ocr-bench.mjs']);
console.log('\nRESULT', JSON.stringify(results));
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
