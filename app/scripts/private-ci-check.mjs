// Legacy regressions use repository fixtures. Publish only status/counts, never their records or diagnostics.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const [label, command, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label || '') || !command) throw new Error('Expected a safe check label and command.');
const child = spawn(command === 'node' ? process.execPath : command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let tail = '',
  passed = null,
  total = null;
const consume = (chunk) => {
  tail = (tail + chunk.toString().replace(/\u001b\[[0-9;]*m/g, '')).slice(-8000);
  const checks = [...tail.matchAll(/(?:^|\n)\s*(\d+)\/(\d+) comprobaciones correctas/g)].at(-1);
  const tests = [...tail.matchAll(/(?:^|\n)\s*Tests\s+(\d+) passed\s+\((\d+)\)/g)].at(-1);
  if (checks || tests) {
    passed = Number((checks || tests)[1]);
    total = Number((checks || tests)[2]);
  }
};
child.stdout.on('data', consume);
child.stderr.on('data', consume);
const exitCode = await new Promise((resolve) => {
  child.on('error', () => resolve(1));
  child.on('close', (code) => resolve(code ?? 1));
});
const result = { check: label, success: exitCode === 0, exitCode, passed, total };
if (process.env.CASUR_CI_RESULTS) {
  let results = [];
  try {
    results = JSON.parse(await readFile(process.env.CASUR_CI_RESULTS, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await writeFile(process.env.CASUR_CI_RESULTS, JSON.stringify([...results, result], null, 2));
}
console.log(
  `${exitCode === 0 ? 'PASS' : 'FAIL'} ${label}${passed != null ? `: ${passed}/${total}` : ''}. Detailed fixture output omitted for privacy.`,
);
if (exitCode !== 0) console.error('Reproduce this check locally to inspect diagnostics; no source records were published.');
process.exitCode = exitCode;
