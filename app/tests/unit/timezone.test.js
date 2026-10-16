// Las fechas y los identificadores de fila no dependen de la zona horaria del equipo.
// Cada zona se prueba en un proceso propio (SheetJS fija su zona al cargarse): las cifras de referencia completas
// (filas, hallazgos, finanzas, Seguimiento y sus huellas) deben ser exactamente las de expected.json, calculadas en
// Managua, y la lectura de libros .xlsx y .xls con fechas de 2000 a 2100 debe dar la fecha exacta y la misma firma.
import path from 'node:path';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED = JSON.parse(readFileSync(path.join(APP, 'tests/golden/expected.json'), 'utf8'));
// UTC−6 (operativa), UTC, al oeste con horario de verano, al este (fechas un día antes antes de la corrección),
// UTC+14 y una zona con cambio de hora a medianoche.
const ZONES = ['America/Managua', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Santiago'];

const probe = async (tz) => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [path.join(APP, 'node_modules/vite-node/vite-node.mjs'), path.join(APP, 'tests/unit/tz-probe.mjs')],
    { cwd: APP, env: { ...process.env, TZ: tz, VITEST: '' }, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
};

describe('zona horaria del equipo', async () => {
  const results = Object.fromEntries(await Promise.all(ZONES.map(async (tz) => [tz, await probe(tz)])));

  it.each(ZONES)('%s: cifras de referencia idénticas a las de Managua (expected.json)', (tz) => {
    expect(results[tz].golden).toEqual(EXPECTED);
  });

  it.each(ZONES)('%s: libros .xlsx y .xls con la fecha exacta de cada celda y la misma firma que en Managua', (tz) => {
    for (const bookType of ['xlsx', 'biff8']) {
      expect(results[tz].synthetic[bookType].rows).toBe(36890);
      expect(results[tz].synthetic[bookType].wrong).toBe(0);
      expect(results[tz].synthetic[bookType].signatures).toBe(results['America/Managua'].synthetic[bookType].signatures);
    }
  });
});
