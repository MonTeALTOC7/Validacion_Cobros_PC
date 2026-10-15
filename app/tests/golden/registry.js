// Registro de cifras de referencia: cada versión de expected.json y legacy-allowlist.json debe tener una fila con
// sus huellas SHA-256 y una justificación. La prueba golden exige que la última fila coincida con los archivos.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './snapshot';

export const GOLDEN_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EXPECTED_PATH = path.join(GOLDEN_DIR, 'expected.json');
export const ALLOWLIST_PATH = path.join(GOLDEN_DIR, 'legacy-allowlist.json');
export const REGISTRY_PATH = path.join(GOLDEN_DIR, 'REGISTRO.md');
export const MIN_JUSTIFICATION = 30;

/** Filas de la tabla del registro: { fecha, expected, allowlist, justificacion }. */
export const parseRegistry = (text) =>
  text
    .split('\n')
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))
    .map((line) => {
      const [fecha, expected, allowlist, ...rest] = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        fecha,
        expected: expected.replace(/`/g, ''),
        allowlist: allowlist.replace(/`/g, ''),
        justificacion: rest.join('|'),
      };
    });

export const currentHashes = async () => ({
  expected: sha256(await readFile(EXPECTED_PATH)),
  allowlist: sha256(await readFile(ALLOWLIST_PATH)),
});
