import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parsePrefacturaFile } from '../../src/engine/importers';
import { analyzeTariffs } from '../../src/engine/audit/tariffAudit';
import {
  caseGuidance,
  observedReference,
  reviewReasons,
  reviewRows,
  trend,
} from '../../src/components/audit/operationalPresentation';

const row = (fields = {}) => ({
  auditId: 'a',
  sourceRow: 1,
  tariff: 100,
  effective: 400,
  total: 400,
  referenceSufficient: true,
  observations: [],
  ...fields,
});
describe('presentación operativa sin cambios al motor', () => {
  it('conserva varios motivos y deduplica por identidad, no por dinero', () => {
    const a = row({ observations: [{ rule: 'EXTREME' }, { rule: 'EFFECTIVE_OUTLIER' }, { rule: 'CROSS_INVOICE' }] });
    const b = row({ auditId: 'b', referenceSufficient: false });
    expect(reviewReasons(a)).toEqual(['Tarifa inusual', 'Posible repetición']);
    expect(reviewRows([b, a, a]).map((item) => item.auditId)).toEqual(['a', 'b']);
    expect(reviewRows([b, a, a]).reduce((sum, item) => sum + item.total, 0)).toBe(800);
  });
  it('no confunde ausencia de señal con referencia suficiente', () => {
    expect(reviewReasons(row({ referenceSufficient: false }))).toEqual(['Falta información']);
    expect(reviewRows([row()])).toEqual([]);
  });
  it('no muestra medianas insuficientes o no finitas como referencia válida', () => {
    expect(observedReference({ reported: { median: 100, sufficient: false } }, 'reported')).toBeNull();
    expect(observedReference({ reported: { median: NaN, sufficient: true } }, 'reported')).toBeNull();
    expect(observedReference(null, 'reported')).toBeNull();
  });
  it('explica anomalía efectiva con la métrica efectiva, no la reportada', () => {
    const guidance = caseGuidance(row({ observations: [{ rule: 'EFFECTIVE_OUTLIER', metric: 'effective' }] }), {
      effective: { sufficient: true, median: 100 },
      reported: { sufficient: true, median: 500 },
    });
    expect(guidance.why).toContain('tarifa efectiva está por encima');
    expect(guidance.why).not.toContain('tarifa reportada');
  });
  it('SIAGRI y repetición requieren verificar, no dictaminan error', () => {
    const guidance = caseGuidance(row({ observations: [{ rule: 'PRESENTATION' }, { rule: 'EXACT_REPEAT' }] }));
    expect(guidance.why).toContain('no demuestra su causa ni valida el cobro');
    expect(guidance.why).toContain('no confirman un doble cobro');
    expect(guidance.actions).toHaveLength(3);
  });
  it('describe cambios sin imponer 4,6%, con suficiencia y precisión explícita', () => {
    expect(trend(100, 101, true)).toBe('Subió');
    expect(trend(100, 99, true)).toBe('Bajó');
    expect(trend(100, 100.001, true)).toBe('Se mantuvo a 2 decimales');
    expect(trend(100, 150, false)).toBe('Muestra insuficiente');
    expect(trend(null, 150, true)).toBe('Muestra insuficiente');
  });
  it('CMN real 0,88 conserva origen, motor y conjunto único', async () => {
    const bytes = await readFile(new URL('../../../datos/Prefactura_2026.xlsx', import.meta.url));
    const parsed = await parsePrefacturaFile(new File([bytes], 'Prefactura_2026.xlsx'));
    const source = parsed.rows ?? parsed;
    const audit = analyzeTariffs(source);
    const snapshot = JSON.stringify(audit);
    const queue = reviewRows(audit.rows);
    const cmn = queue.find((item) => item.sourceRow === 1376);
    expect(cmn.tariff).toBe(0.88);
    expect(cmn.total).toBe(7.32);
    const population = audit.populations.find((item) => item.key === cmn.populationKey);
    expect(caseGuidance(cmn, population).why).toContain('tarifa reportada está por debajo');
    expect(observedReference(population, 'reported')).toBeGreaterThan(1000);
    expect(new Set(queue.map((item) => item.auditId)).size).toBe(queue.length);
    expect(JSON.stringify(audit)).toBe(snapshot);
    expect(audit.summary.total).toBe(13278583.33);
  });
});
