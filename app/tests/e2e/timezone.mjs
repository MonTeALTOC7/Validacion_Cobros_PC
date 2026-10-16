// Fechas e identificadores de filas independientes de la zona horaria del equipo, en el navegador.
// 1) La versión nueva importa los mismos Excel de datos/ en varias zonas: filas (id, fecha, año, semana), fechas del
//    Maestro y huella de hallazgos idénticas entre zonas e iguales a las cifras de referencia (golden, Managua).
// 2) Transición en un mismo origen desde el build v0.8 previo a la corrección (tests/v08):
//    - en Managua los datos que guardó son idénticos a los que importa la versión nueva (no hace falta migrar);
//    - al este de UTC guardó fechas un día antes; la versión nueva no los modifica en silencio y, al volver a importar
//      los mismos archivos, la comprobación previa muestra las filas que cambian y deja confirmar la corrección.
// Uso: node tests/e2e/timezone.mjs [--site dist|..]
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, launch, openAndWait, readDb } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const datos = path.resolve(appDir, arg('--datos', '../datos'));
const site = path.resolve(appDir, arg('--site', 'dist'));
const expected = JSON.parse(readFileSync(path.join(appDir, 'tests/golden/expected.json'), 'utf8'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK ' : 'FALLA'} · ${name}${detail ? ' · ' + detail : ''}`);
};
const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const r2 = (value) => Math.round(value * 100) / 100;
const movement = (rows) => rows.map((r) => [r.sourceRow, r.id, r.date, r.year, r.week]);
/** Huellas de lo que la aplicación guardó: filas, Maestro y hallazgos (misma fórmula que tests/golden/snapshot.js). */
const fingerprints = (values) => ({
  payroll: sha256(movement(values.inputs.payroll)),
  prefactura: sha256(movement(values.inputs.prefactura)),
  master: sha256(values.inputs.master.map((r) => [r.id, r.plantingDate, r.lastCutDate])),
  hallazgos: sha256(
    [...values.analysis.findings]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => [
        f.id,
        f.type,
        f.status,
        f.severity,
        [...(f.flags ?? [])].sort(),
        r2(f.payrollUnits ?? 0),
        r2(f.billedUnits ?? 0),
        r2(f.amount ?? 0),
        [...(f.payrollRowIds ?? [])].sort(),
        [...(f.prefacturaRowIds ?? [])].sort(),
      ]),
  ),
});
const sameDates = (a, b) => a.filter((row, i) => row.date === b[i]?.date).length;

const { server, origin } = await serve({
  '/nueva/datos/': datos,
  '/nueva/': site,
  '/previa/datos/': datos,
  '/previa/': path.join(appDir, 'tests/v08'),
});
const browser = await launch();
try {
  // 1) Importación directa en varias zonas
  const zones = ['America/Managua', 'UTC', 'America/New_York', 'Europe/Madrid', 'Asia/Tokyo', 'Pacific/Kiritimati'];
  let reference = null;
  for (const timezoneId of zones) {
    const { context, page, errors } = await openAndWait(browser, `${origin}/nueva/index.html`, { timezoneId });
    const { values } = await readDb(page);
    const prints = fingerprints(values);
    reference ??= { prints, values };
    check(
      `${timezoneId} · filas, Maestro y hallazgos idénticos a Managua`,
      JSON.stringify(prints) === JSON.stringify(reference.prints),
    );
    check(
      `${timezoneId} · huella de hallazgos = cifras de referencia`,
      prints.hallazgos === expected.huellas.hallazgos,
      `${values.analysis.findings.length} hallazgos`,
    );
    check(`${timezoneId} · sin errores de página`, !errors.length, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // 2) Transición desde el build v0.8 previo, en el mismo origen
  for (const timezoneId of ['America/Managua', 'Asia/Tokyo']) {
    const { context, page } = await openAndWait(browser, `${origin}/previa/index.html`, { timezoneId });
    const before = (await readDb(page)).values.inputs;
    const shifted = timezoneId !== 'America/Managua';
    const keptDates = sameDates(before.payroll, reference.values.inputs.payroll);
    check(
      `${timezoneId} · v0.8 previa: ${shifted ? 'fechas guardadas un día antes (error reproducido)' : 'mismas fechas e ids que la versión nueva'}`,
      shifted
        ? keptDates === 0
        : sha256(movement(before.payroll)) === reference.prints.payroll &&
            sha256(movement(before.prefactura)) === reference.prints.prefactura,
      `${keptDates}/${before.payroll.length} fechas de Nómina coinciden`,
    );

    await page.goto(`${origin}/nueva/index.html`);
    await page.waitForTimeout(6000);
    const after = (await readDb(page)).values;
    check(
      `${timezoneId} · la versión nueva conserva los datos guardados sin modificarlos`,
      sha256(movement(after.inputs.payroll)) === sha256(movement(before.payroll)) &&
        sha256(movement(after.inputs.prefactura)) === sha256(movement(before.prefactura)),
    );
    if (!shifted) {
      check(
        `${timezoneId} · hallazgos recalculados = cifras de referencia`,
        fingerprints(after).hallazgos === expected.huellas.hallazgos,
      );
    } else {
      // Volver a importar los mismos archivos corrige las fechas guardadas, con la comprobación previa habitual.
      await page.locator('.sidebar nav button', { hasText: 'Actualizar archivos' }).first().click();
      // Mismos archivos y nombres que los publicados (el id de las filas del Maestro incluye el nombre del archivo).
      const manifest = JSON.parse(readFileSync(path.join(datos, 'manifest.json'), 'utf8'));
      const published = (kind) => manifest.files.find((file) => file.kind === kind);
      for (const [label, kind] of [
        ['Nómina', 'payroll'],
        ['Prefactura', 'prefactura'],
        // Con el Maestro Central (por defecto) el Maestro se renueva solo al abrir; con el Maestro en Excel se reimporta.
        ['Cronológico Maestro', 'master'],
      ]) {
        const { path: file, name } = published(kind);
        await page
          .locator('.file-card', { hasText: label })
          .first()
          .locator('input[type=file]')
          .setInputFiles({
            name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: readFileSync(path.join(datos, file)),
          });
        const drawer = page.locator('.drawer', { hasText: 'Comprobación antes de reemplazar' });
        await drawer.waitFor({ timeout: 60000 });
        const text = await drawer.innerText();
        check(
          `${timezoneId} · reimportar ${label}: se muestran las filas que cambian (no «mismo archivo»)`,
          !text.includes('Es el mismo archivo') && /agregadas o modificadas\s*[1-9]/i.test(text),
        );
        await drawer.locator('input[type=checkbox]').check();
        await drawer.locator('button', { hasText: 'Confirmar actualización' }).click();
        await drawer.waitFor({ state: 'detached', timeout: 60000 });
        await page.waitForTimeout(1500);
      }
      const fixed = fingerprints((await readDb(page)).values);
      check(
        `${timezoneId} · tras reimportar: filas, Maestro y hallazgos idénticos a Managua y a las cifras de referencia`,
        JSON.stringify(fixed) === JSON.stringify(reference.prints) && fixed.hallazgos === expected.huellas.hallazgos,
        Object.keys(fixed)
          .filter((key) => fixed[key] !== reference.prints[key])
          .join(', '),
      );
    }
    const db = await readDb(page);
    check(
      `${timezoneId} · IndexedDB sin cambios de esquema`,
      db.version === 10 && db.stores.join(',') === 'audit,closures,values',
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
// 18 en importación directa y 11 en la transición. Menos significa que la prueba no terminó.
if (failed || results.length < 29) process.exitCode = 1;
