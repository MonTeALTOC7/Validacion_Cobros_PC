// Regenera las cifras de referencia (tests/golden/expected.json) y, opcionalmente, la lista de diferencias legacy
// permitidas, y deja constancia en tests/golden/REGISTRO.md con huellas SHA-256 y la justificación.
// Uso: npm run golden:update -- --justificacion "motivo del cambio" [--diffs diffs.json]
//   diffs.json se obtiene con: npx vite-node tests/e2e/compare-legacy.mjs -- --write-diffs diffs.json
// Nunca se ejecuta en la CI: un cambio de cifras siempre llega como cambio revisable en el diff del PR.
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGoldenSnapshot } from '../tests/golden/snapshot';
import { buildAllowlist, justify } from '../tests/golden/legacy-diff.js';
import {
  ALLOWLIST_PATH,
  EXPECTED_PATH,
  MIN_JUSTIFICATION,
  REGISTRY_PATH,
  currentHashes,
  parseRegistry,
} from '../tests/golden/registry';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const justification = (arg('--justificacion') ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
if (justification.length < MIN_JUSTIFICATION)
  throw new Error(`Indique --justificacion con al menos ${MIN_JUSTIFICATION} caracteres explicando por qué cambian las cifras.`);

const datos = path.resolve(path.dirname(EXPECTED_PATH), '../../../datos');
await writeFile(EXPECTED_PATH, JSON.stringify(await buildGoldenSnapshot(datos), null, 2) + '\n');

const diffsPath = arg('--diffs');
if (diffsPath) {
  const { justified, unjustified } = justify(JSON.parse(await readFile(diffsPath, 'utf8')));
  if (unjustified.length) {
    unjustified.slice(0, 30).forEach((d) => console.error('SIN REGLA · ' + JSON.stringify(d)));
    throw new Error(
      `${unjustified.length} diferencia(s) con el legacy no cumplen ninguna regla de tests/golden/legacy-diff.js. ` +
        'Corrija la regresión o documente una regla nueva antes de permitirlas.',
    );
  }
  await writeFile(ALLOWLIST_PATH, JSON.stringify(buildAllowlist(justified), null, 2) + '\n');
}

const hashes = await currentHashes();
const rows = parseRegistry(await readFile(REGISTRY_PATH, 'utf8').catch(() => ''));
const last = rows.at(-1);
if (last && last.expected === hashes.expected && last.allowlist === hashes.allowlist) {
  console.log('Las cifras de referencia no cambiaron; no se agrega entrada al registro.');
} else {
  const today = new Date().toISOString().slice(0, 10);
  await appendFile(REGISTRY_PATH, `| ${today} | \`${hashes.expected}\` | \`${hashes.allowlist}\` | ${justification} |\n`);
  console.log(`Registro actualizado: expected ${hashes.expected.slice(0, 12)}… · allowlist ${hashes.allowlist.slice(0, 12)}…`);
}
