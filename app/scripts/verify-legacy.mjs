// Verifica que la copia del bundle legacy de referencia (tests/legacy) siga idéntica byte a byte:
// 1) contra las huellas de tests/legacy/SHA256SUMS;
// 2) contra el commit e7587c3 (último build v0.7 publicado), si el historial está disponible.
// Uso: node scripts/verify-legacy.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCE_COMMIT = 'e7587c3';
const legacyDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/legacy');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const sums = (await readFile(path.join(legacyDir, 'SHA256SUMS'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [hash, file] = line.split(/\s+\*?/);
    return { hash, file: file.replace(/^\.\//, '') };
  });

const failures = [];
let history = true;
try {
  execFileSync('git', ['cat-file', '-e', `${REFERENCE_COMMIT}^{commit}`], { stdio: 'ignore' });
} catch {
  history = false;
}
for (const { hash, file } of sums) {
  const local = await readFile(path.join(legacyDir, file));
  if (sha256(local) !== hash) failures.push(`${file}: no coincide con SHA256SUMS`);
  if (history) {
    const reference = execFileSync('git', ['show', `${REFERENCE_COMMIT}:${file}`], { maxBuffer: 64 * 1024 * 1024 });
    if (!reference.equals(local)) failures.push(`${file}: difiere de ${REFERENCE_COMMIT}`);
  }
}
console.log(
  `Legacy: ${sums.length} archivos comprobados contra SHA256SUMS` +
    (history ? ` y contra ${REFERENCE_COMMIT}` : ` (historial ${REFERENCE_COMMIT} no disponible)`),
);
if (failures.length) {
  failures.forEach((failure) => console.error('FALLA · ' + failure));
  process.exitCode = 1;
} else console.log('Copia legacy idéntica a la referencia.');
