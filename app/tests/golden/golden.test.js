// Prueba golden bloqueante: el motor sobre datos/ debe dar exactamente las cifras de referencia de expected.json,
// y esas cifras (y la lista de diferencias legacy permitidas) deben estar registradas con justificación en REGISTRO.md.
// Para actualizar: npm run golden:update -- --justificacion "motivo" (ver README de esta carpeta).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGoldenSnapshot } from './snapshot';
import { EXPECTED_PATH, MIN_JUSTIFICATION, REGISTRY_PATH, currentHashes, parseRegistry } from './registry';

const DATOS = path.resolve(path.dirname(EXPECTED_PATH), '../../../datos');

describe('golden: resultados del motor sobre datos/', async () => {
  const expected = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
  const actual = await buildGoldenSnapshot(DATOS);

  it('los archivos de datos/ son los de referencia', () => {
    expect(
      actual.datos,
      'datos/ cambió: regenere las cifras de referencia con npm run golden:update y justifique el cambio',
    ).toEqual(expected.datos);
  });

  for (const section of Object.keys(expected).filter((key) => key !== 'datos')) {
    it(`sección ${section} sin cambios`, () => {
      expect(actual[section], `cambió la sección "${section}" de las cifras de referencia`).toEqual(expected[section]);
    });
  }

  it('no hay secciones nuevas sin referencia', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  });
});

describe('golden: registro de cifras de referencia', () => {
  it('la última entrada de REGISTRO.md corresponde a los archivos vigentes y está justificada', async () => {
    const rows = parseRegistry(await readFile(REGISTRY_PATH, 'utf8'));
    expect(rows.length, 'REGISTRO.md no tiene entradas').toBeGreaterThan(0);
    const last = rows.at(-1);
    const hashes = await currentHashes();
    expect(last.expected, 'expected.json cambió sin registrarse en REGISTRO.md').toBe(hashes.expected);
    expect(last.allowlist, 'legacy-allowlist.json cambió sin registrarse en REGISTRO.md').toBe(hashes.allowlist);
    expect(last.justificacion.length, 'la justificación es demasiado breve').toBeGreaterThanOrEqual(MIN_JUSTIFICATION);
  });
});
