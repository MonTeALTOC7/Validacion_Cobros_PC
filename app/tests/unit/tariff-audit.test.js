import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeTariffs, AUDIT_DEFAULTS, filterAuditRows } from '../../src/engine/audit/tariffAudit';
import { parsePrefacturaFile } from '../../src/engine/importers';

const line = (overrides = {}) => ({
  id: 'line',
  year: 2026,
  week: 18,
  date: '2026-05-03',
  producerCode: 'CL1',
  producerName: 'Productor',
  hacienda: 'Finca',
  suerte: '01',
  labor: 'CMN',
  service: '16013',
  unit: 'HA',
  contractorCode: 'CS9999',
  units: 2,
  tariff: 100,
  total: 200,
  pFact: '1',
  sourceFile: 'Prefactura.xlsx',
  sourceSheet: 'REPORTE',
  sourceRow: 2,
  ...overrides,
});
const population = (overrides = {}) =>
  Array.from({ length: 12 }, (_, index) =>
    line({
      id: `row-${index}`,
      sourceRow: index + 2,
      suerte: String(index),
      week: index % 2 ? 19 : 18,
      ...overrides,
    }),
  );
const rules = (result, index = 0) => result.rows[index].observations.map((item) => item.rule);

describe('auditoría aislada de Prefactura', () => {
  it('preserva campos originales y no emite diferencias contractuales', () => {
    const source = population();
    const snapshot = structuredClone(source);
    source.forEach(Object.freeze);
    Object.freeze(source);
    const audit = analyzeTariffs(source);
    expect(source).toEqual(snapshot);
    expect(audit.summary).toMatchObject({ lines: 12, total: 2400, expectedAmount: null, economicDifference: null });
    expect(audit.rows.every((row) => row.authorizedTariff === null && row.economicDifference === null)).toBe(true);
    expect(audit.rows[0].effective).toBe(100);
    expect(analyzeTariffs(source)).toEqual(audit);
  });
  it('un promedio SIAGRI inconsistente es presentación, nunca sobrecobro', () => {
    const row = line({ units: 4.2, tariff: 515.065, total: 2028.837, labor: 'GCO', service: '21076' });
    const audit = analyzeTariffs([row]);
    expect(audit.rows[0].effective).toBeCloseTo(483.056428571, 8);
    expect(audit.rows[0].presentationDifference).toBeCloseTo(-134.436, 6);
    expect(rules(audit)).toEqual(['PRESENTATION']);
    expect(audit.summary.economicDifference).toBeNull();
    expect(audit.summary.insufficient).toBe(1);
    // El mismo rótulo de presentación NO certifica ni siquiera otro importe.
    expect(analyzeTariffs([{ ...row, total: 9000 }]).rows[0].expectedAmount).toBeNull();
  });
  it('respeta precisión y tolerancia de presentación; no redondea la tarifa efectiva', () => {
    const audit = analyzeTariffs([
      line({ tariff: 0.88, units: 8.32, total: 7.32 }),
      line({ tariff: 100, total: 200.02 }),
      line({ tariff: 100, total: 200.021 }),
    ]);
    expect(rules(audit, 0)).not.toContain('PRESENTATION');
    expect(rules(audit, 1)).not.toContain('PRESENTATION');
    expect(rules(audit, 2)).toContain('PRESENTATION');
    expect(audit.rows[0].effective).toBe(7.32 / 8.32);
  });
  it('cero, negativos y campos perdidos requieren respaldo, sin divisiones inválidas', () => {
    const audit = analyzeTariffs([
      line({ units: 0, total: 100 }),
      line({ total: -100 }),
      line({ tariff: 0, total: 0 }),
      line({ total: null }),
      line({ unit: '' }),
      line({ tariff: NaN, date: '2026-02-30', contractorCode: '' }),
    ]);
    expect(audit.rows[0].effective).toBeNull();
    expect(audit.rows[3].effective).toBeNull();
    expect(audit.rows[4].effective).toBeNull();
    expect(rules(audit, 0)).toContain('INPUT');
    expect(rules(audit, 1)).toContain('NON_POSITIVE');
    expect(rules(audit, 2)).toContain('NON_POSITIVE');
    expect(rules(audit, 5)).toContain('INPUT');
  });
  it('detecta extremos altos y bajos con MAD=0 y explica el umbral', () => {
    const audit = analyzeTariffs([
      ...population(),
      line({ tariff: 0.5, total: 1, suerte: 'low' }),
      line({ tariff: 20000, total: 40000, suerte: 'high' }),
    ]);
    expect(rules(audit, 12)).toEqual(expect.arrayContaining(['EXTREME', 'REPORTED_OUTLIER', 'EFFECTIVE_OUTLIER']));
    expect(rules(audit, 13)).toContain('EXTREME');
    expect(audit.populations[0].reported).toMatchObject({ median: 100, mad: 0, lower: 75, upper: 125, sufficient: true });
    expect(audit.summary.priority).toBe(2);
  });
  it('usa MAD escalado cuando existe dispersión y mantiene los comparables visibles', () => {
    const source = population().map((row, index) => ({ ...row, tariff: 90 + index * 2, total: 2 * (90 + index * 2) }));
    const audit = analyzeTariffs(source);
    const ref = audit.populations[0].reported;
    expect(ref.median).toBe(101);
    expect(ref.mad).toBe(6);
    expect(ref.upper).toBeCloseTo(101 + 3.5 * 1.4826 * 6);
    expect(ref.rowIds).toHaveLength(12);
  });
  it('tarifas pequeñas legítimas se evalúan en su UM, nunca con un umbral menor que 1', () => {
    for (const [unit, tariff] of [
      ['CAJAS', 0.85],
      ['PAQ', 0.37],
      ['MJO', 0.64],
    ]) {
      const audit = analyzeTariffs(population({ unit, tariff, total: tariff * 2 }));
      expect(audit.summary.statistical).toBe(0);
      expect(audit.summary.priority).toBe(0);
    }
  });
  it('no mezcla servicio, UM, contratista, universo, mes, jornada o base para ganar muestras', () => {
    const different = [
      { service: '21076' },
      { unit: 'D-H' },
      { contractorCode: 'CS2661' },
      { date: '2026-06-03' },
      { jornada: 'Festiva' },
      { billingBase: 'Base autorizada aparte' },
      { labor: 'AAM' },
    ].map((patch) => line({ ...patch, tariff: 0.5, total: 1 }));
    const audit = analyzeTariffs([...population(), ...different]);
    expect(audit.populations).toHaveLength(8);
    expect(audit.rows.slice(12).every((row) => !row.referenceSufficient)).toBe(true);
    expect(audit.summary.priority).toBe(0);
    expect(audit.rows[0].jornada).toBe('No informada');
  });
  it('muestra pequeña o concentrada en una semana no produce atípicos', () => {
    expect(analyzeTariffs(population().slice(0, 3)).summary.insufficient).toBe(3);
    expect(analyzeTariffs(population({ week: 18 })).summary.insufficient).toBe(12);
    expect(analyzeTariffs(population({ contractorCode: '' })).summary.insufficient).toBe(12);
  });
  it('copias exactas no sesgan entrenamiento; señales solapadas no duplican importes', () => {
    const copies = Array.from({ length: 20 }, (_, index) =>
      line({ id: `copy-${index}`, sourceRow: 100 + index, tariff: 0.5, total: 1 }),
    );
    const otherInvoice = line({ id: 'another', pFact: '2', tariff: 0.5, total: 1 });
    const audit = analyzeTariffs([...population(), ...copies, otherInvoice]);
    expect(audit.summary.excludedTrainingCopies).toBe(19);
    expect(audit.populations[0].reported.median).toBe(100);
    expect(audit.summary.repeated).toBe(21);
    expect(audit.summary.repeatedAmount).toBe(21);
    expect(audit.summary.total).toBe(2421);
    expect(rules(audit, 12)).toEqual(expect.arrayContaining(['EXACT_REPEAT', 'CROSS_INVOICE', 'EXTREME']));
    expect(filterAuditRows(audit.rows, { category: 'repeated' })).toHaveLength(21);
  });
  it('las búsquedas no recalibran y KPI corresponde a líneas distintas', () => {
    const audit = analyzeTariffs([...population(), line({ suerte: 'extreme', tariff: 0.5, total: 1, sourceRow: 1376 })]);
    const references = structuredClone(audit.populations);
    expect(filterAuditRows(audit.rows, { search: '1376', category: 'EXTREME' })).toHaveLength(1);
    expect(filterAuditRows(audit.rows, { category: 'statistical' })).toHaveLength(audit.summary.statistical);
    expect(audit.populations).toEqual(references);
  });
  it('comparación histórica con cobertura real, sin diciembre inventado ni reajuste exigible', () => {
    const audit = analyzeTariffs([...population(), ...population({ date: '2026-06-03', tariff: 110, total: 220 })]);
    const history = audit.history[0];
    expect(history.before.from).toBe('2026-05-03');
    expect(history.after.from).toBe('2026-06-03');
    expect(history.reportedChange).toBeCloseTo(10);
    expect(history.effectiveChange).toBeCloseTo(10);
    expect(audit.summary.economicDifference).toBeNull();
    expect(analyzeTariffs(population()).history[0].effectiveChange).toBeNull();
    expect(analyzeTariffs(population()).history[0].after.from).toBeNull();
  });
  it('la estadística mensual no convierte el cambio de junio en una anomalía de vigencia', () => {
    const audit = analyzeTariffs([...population(), ...population({ date: '2026-06-01', tariff: 200, total: 400 })]);
    expect(audit.summary.statistical).toBe(0);
    expect(audit.history[0].effectiveChange).toBe(100);
  });
  it('configuración local validada; no modifica defaults compartidos', () => {
    expect(() => analyzeTariffs([], { minSamples: 0 })).toThrow();
    expect(() => analyzeTariffs([], { cutoff: '2026-02-30' })).toThrow();
    expect(analyzeTariffs([], { minSamples: 3 }).config.minSamples).toBe(3);
    expect(AUDIT_DEFAULTS.minSamples).toBe(10);
    expect(analyzeTariffs([]).summary.total).toBe(0);
  });
});

describe('auditoría sobre Prefactura real versionada', () => {
  let source;
  let audit;
  beforeAll(async () => {
    const data = await readFile(new URL('../../../datos/Prefactura_2026.xlsx', import.meta.url));
    source = (await parsePrefacturaFile(new File([data], 'Prefactura_2026.xlsx'))).rows;
    audit = analyzeTariffs(source);
  });
  it('conserva 4452 líneas y C$13,278,583.33 sin ajustar importes', () => {
    expect(audit.summary.lines).toBe(4452);
    expect(audit.summary.total).toBe(13278583.33);
    expect(audit.rows.map((row) => [row.id, row.units, row.tariff, row.total])).toEqual(
      source.map((row) => [row.id, row.units, row.tariff, row.total]),
    );
    expect(audit.coverage).toMatchObject({ from: '2026-01-02', to: '2026-09-20' });
    expect(audit.summary.presentation).toBe(0);
  });
  it('CMN 0,88: filas 1376, 1403, 1424 prioritarias, con multiplicación consistente', () => {
    const cmn = audit.rows.filter((row) => [1376, 1403, 1424].includes(row.sourceRow));
    expect(cmn).toHaveLength(3);
    cmn.forEach((row) => {
      expect(row).toMatchObject({
        labor: 'CMN',
        service: '16013',
        unit: 'HA',
        tariff: 0.88,
        sourceSheet: 'REPORTE',
        pFact: '16183',
        economicDifference: null,
      });
      expect(row.observations.map((item) => item.rule)).toContain('EXTREME');
      expect(row.observations.map((item) => item.rule)).not.toContain('PRESENTATION');
    });
  });
  it('repeticiones conservadas y cobertura mensual/histórica auditable', () => {
    expect(audit.summary.excludedTrainingCopies).toBe(16);
    expect(audit.repetitions.filter((group) => group.rule === 'EXACT_REPEAT')).toHaveLength(16);
    expect(audit.repetitions.filter((group) => group.rule === 'CROSS_INVOICE')).toHaveLength(2);
    expect(audit.history.every((item) => item.before.from === null || item.before.from >= '2026-01-02')).toBe(true);
    expect(audit.populations.every((item) => item.month >= '2026-01')).toBe(true);
  });
});
