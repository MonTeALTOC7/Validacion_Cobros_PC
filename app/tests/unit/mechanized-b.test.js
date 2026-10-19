import { describe, it, expect } from 'vitest';
import { reconcile, makeReview, reviewStatus, selectedAmount, classifyPrefactura } from '../../src/mechanized/reconciliation';
import { validateBackup } from '../../src/mechanized/storage';
import { hm, pf, program, coverageRules } from '../fixtures/mechanized-b';
const full = (changes = {}, rules = {}) => reconcile({ hm: [hm], prefactura: [pf], program: [program], ...changes }, rules);
const confirm = (result, index = 0) =>
  makeReview(result.cases[index], result.evidence, {
    state: 'confirmed',
    links: result.cases[index].related.map((e) => e.id),
    notes: 'Revisión sintética de documentos exactos',
  });
const backup = (review) => ({ format: 'casur-mechanized-decisions', version: 1, reviews: [review] });
describe('Etapa B: conciliación documental aislada', () => {
  it('descarta una sugerencia exacta sin borrar la evaluación ni confirmar el caso', () => {
    const r = full(),
      item = r.cases[0];
    expect(() => makeReview(item, r.evidence, { state: 'discarded', links: [], notes: 'No corresponde' })).toThrow(
      /sugerencia exacta/,
    );
    const review = makeReview(item, r.evidence, {
      state: 'discarded',
      links: [r.evidence.find((e) => e.source === 'pf').id],
      notes: 'Documento de otra ejecución',
    });
    expect(review.links).toHaveLength(2);
    expect(reviewStatus(review, item, r.evidence).confirmed).toBe(false);
    expect(item.state).toBe('strong');
  });
  it('no pierde PF conectada por Programación cuando HM queda fuera de tolerancia directa', () => {
    const r = full({ program: [{ ...program, executionDate: '2026-10-14' }], prefactura: [{ ...pf, date: '2026-10-28' }] });
    expect(r.cases).toHaveLength(2);
    expect(new Set(r.cases.flatMap((c) => c.related.map((e) => e.id))).size).toBe(r.evidence.length);
    expect(r.cases.find((c) => c.anchor.source === 'program').related.some((e) => e.source === 'pf')).toBe(true);
  });
  it('identifica las tres fuentes y preserva HR/HA, sufijos, originales, Zona y Semana SIAGRI', () => {
    const before = JSON.stringify([hm, pf, program]);
    const result = full();
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].state).toBe('strong');
    expect(result.cases[0].related).toHaveLength(3);
    expect(result.cases[0].anchor.row).toMatchObject({ zone: '5', week: '39', suerte: '02A', units: 3, unit: 'HR' });
    expect(result.evidence.find((e) => e.source === 'pf').row.units).toBe(5.97);
    expect(JSON.stringify([hm, pf, program])).toBe(before);
  });
  it('FTS/MEC solo es candidata al configurar explícitamente el par; nunca equivalencia automática', () => {
    expect(full({ hm: [{ ...hm, labor: 'FTS' }], program: [] }).cases).toHaveLength(2);
    const result = full({ hm: [{ ...hm, labor: 'FTS' }], program: [] }, { alternatives: [['FTS', 'MEC']] });
    expect(result.cases[0].state).toBe('candidate');
    expect(result.cases[0].matches[0].strong).toBe(false);
    expect(reviewStatus(null, result.cases[0], result.evidence).confirmed).toBe(false);
  });
  it('ejecutada y PF sin HM conserva respaldo y ausencia de HM', () => {
    const r = full({ hm: [] });
    expect(r.cases[0].state).toBe('pfOnly');
    expect(r.cases[0].related).toHaveLength(2);
  });
  it.each([true, false])('ejecución con/sin HM no declara ausencia de PF sin cobertura: HM=%s', (withHM) => {
    const input = { hm: withHM ? [hm] : [], prefactura: [] };
    expect(full(input).cases[0].state).toBe('coverage');
    expect(full(input, coverageRules).cases[0].state).toBe('coverage');
    const r = full({ ...input, prefactura: [{ ...pf, suerte: '99' }] }, coverageRules);
    expect(r.cases.find((c) => c.anchor.source !== 'pf').state).toBe('missing');
  });
  it.each([
    { executed: 'NO', suspended: '0' },
    { executed: 'NO', suspended: '1' },
    { executed: 'SI', suspended: '1' },
  ])('no ejecutada/suspendida nunca implica cobro faltante: %j', (state) => {
    expect(full({ hm: [], prefactura: [], program: [{ ...program, ...state }] }, coverageRules).cases[0].state).toBe(
      'notExecuted',
    );
    expect(full({ program: [{ ...program, ...state }] }).cases[0].state).toBe('inconsistent');
  });
  it('agrega productos compatibles a un evento sin duplicar 5.97 HA ni perder dosis', () => {
    const r = full({ program: [program, { ...program, product: 'P-DEMO-B', productQuantity: '30' }] });
    const event = r.evidence.find((e) => e.source === 'program');
    expect(event.lines).toHaveLength(2);
    expect(event.workQuantity).toBe(5.97);
    expect(event.ambiguous).toBe(false);
    expect(event.lines.map((r) => r.productQuantity)).toEqual(['59.7', '30']);
  });
  it.each([{ units: 6 }, { product: 'P-DEMO-A' }])('superficie o producto repetido ambiguo exige revisión: %j', (delta) => {
    const r = full({ program: [program, { ...program, product: 'P-DEMO-B', ...delta }] });
    expect(r.cases[0].state).toBe('duplicate');
    expect(() => confirm(r)).toThrow(/ambiguas/);
  });
  it('documentos ausentes mantienen eventos ambiguos con todos sus productos', () => {
    const r = full({
      program: [
        { ...program, document: '' },
        { ...program, document: '', product: 'P-DEMO-B' },
      ],
    });
    expect(r.evidence.filter((e) => e.source === 'program')).toHaveLength(2);
    expect(r.cases[0].state).toBe('duplicate');
  });
  it('distingue dos pases del mismo documento/suerte en fechas distintas sin unirlos transitivamente', () => {
    const r = full({ hm: [hm, { ...hm, date: '2026-10-05' }], program: [] });
    expect(r.cases).toHaveLength(2);
    expect(r.cases.every((c) => c.state === 'candidate')).toBe(true);
    expect(r.counts.movements).toBe(2);
  });
  it('PF idénticas son ambiguas; distintos documentos con igual contenido son posible duplicidad', () => {
    const a = full({ prefactura: [pf, { ...pf, id: 'otro', sourceRow: 90 }] });
    expect(a.cases[0].state).toBe('duplicate');
    expect(() => confirm(a)).toThrow();
    const b = full({ prefactura: [pf, { ...pf, pFact: 'PF-DEMO-2' }] });
    expect(b.cases[0].state).toBe('duplicate');
    expect(b.counts.pfLines).toBe(2);
  });
  it('fecha de ejecución prevalece, muestra delta y respeta tolerancia configurable', () => {
    const a = full({ prefactura: [{ ...pf, date: '2026-10-15' }] });
    expect(a.cases[0].matches.find((m) => a.evidence.find((e) => e.id === m.id).source === 'pf').delta).toBe(14);
    expect(a.cases[0].state).toBe('candidate');
    expect(full({ prefactura: [{ ...pf, date: '2026-10-16' }] }).cases).toHaveLength(2);
    expect(full({ prefactura: [{ ...pf, date: '2026-10-16' }] }, { tolerance: 15 }).cases).toHaveLength(1);
    expect(() => full({}, { tolerance: -1 })).toThrow();
  });
  it('zona ausente no es otra zona, zona contradictoria sí requiere aclaración', () => {
    expect(full({ prefactura: [{ ...pf, zone: '' }] }).cases[0].state).toBe('strong');
    expect(full({ prefactura: [{ ...pf, zone: '6' }] }).cases[0].state).toBe('inconsistent');
    expect(
      full({ hm: [{ ...hm, zone: '' }], program: [], prefactura: [{ ...pf, suerte: '99' }] }, coverageRules).cases[0].state,
    ).toBe('coverage');
  });
  it('retiene 200 movimientos: 163 HR y 37 KM sin conversiones', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      ...hm,
      document: `HM-${i}`,
      unit: i < 163 ? 'HR' : 'KM',
      labor: i < 163 ? 'MEC' : i < 194 ? 'ALC' : 'ALR',
    }));
    const r = full({ hm: rows, program: [], prefactura: [] });
    expect(r.cases).toHaveLength(200);
    expect(r.evidence.filter((e) => e.row.unit === 'HR')).toHaveLength(163);
    expect(r.evidence.filter((e) => e.row.unit === 'KM')).toHaveLength(37);
    expect(r.evidence.filter((e) => e.row.labor === 'ALC')).toHaveLength(31);
    expect(r.evidence.filter((e) => e.row.labor === 'ALR')).toHaveLength(6);
  });
  it('PF sola y exclusiones ZGC usan SAP, UM, contratista y clase sin modificar la fuente', () => {
    expect(full({ hm: [], program: [] }).cases[0].state).toBe('pfOnly');
    expect(classifyPrefactura({ ...pf, labor: 'ZGC', service: '10005' }).eligible).toBe(false);
    expect(classifyPrefactura({ ...pf, labor: 'ZGC', service: 'DESCONOCIDO' }).certain).toBe(false);
    expect(classifyPrefactura({ ...pf, unit: 'KG' }).certain).toBe(false);
    expect(full({ prefactura: [{ ...pf, service: '10005' }] }).cases.some((c) => c.state === 'excluded')).toBe(true);
  });
  it('decisión explícita guarda evidencias, nota, fecha y reapertura con historial', () => {
    const r = full(),
      review = confirm(r);
    expect(reviewStatus(review, r.cases[0], r.evidence)).toEqual({ stale: false, confirmed: true });
    expect(Object.keys(review.snapshots)).toHaveLength(3);
    const reopened = makeReview(
      r.cases[0],
      r.evidence,
      { state: 'reopened', links: review.links, notes: 'Revisar respaldo' },
      review,
    );
    expect(reopened.history).toHaveLength(2);
    expect(reviewStatus(reopened, r.cases[0], r.evidence).confirmed).toBe(false);
    expect(() => makeReview(r.cases[0], r.evidence, { state: 'confirmed', links: [], notes: 'Sin respaldo' })).toThrow();
  });
  it('reimportar/reordenar/cambiar archivo no pierde decisión; cambiar cantidades sí requiere revisión', () => {
    const r = full(),
      review = confirm(r);
    const unchanged = full({ prefactura: [{ ...pf, id: 'nuevo', sourceRow: 99, sourceFile: 'actualizado.xlsx' }] });
    expect(reviewStatus(review, unchanged.cases[0], unchanged.evidence).confirmed).toBe(true);
    const changed = full({ prefactura: [{ ...pf, total: 600 }] });
    expect(reviewStatus(review, changed.cases[0], changed.evidence)).toEqual({ stale: true, confirmed: false });
  });
  it('respaldo desaparecido, nuevo candidato y cambio de reglas invalidan vigencia sin borrar historial', () => {
    const r = full(),
      review = confirm(r);
    for (const next of [
      full({ prefactura: [] }),
      full({ prefactura: [pf, { ...pf, pFact: 'NUEVA' }] }),
      full({}, { tolerance: 7 }),
    ])
      expect(reviewStatus(review, next.cases[0], next.evidence).stale).toBe(true);
    expect(reviewStatus(review, null, []).confirmed).toBe(false);
    expect(review.history).toHaveLength(1);
  });
  it('permite vínculos manuales entre suertes; mismo importe PF contado una vez', () => {
    const r = full({ hm: [hm, { ...hm, document: 'HM-OTRO', suerte: '03A' }], program: [] });
    const a = confirm(r, 0);
    const other = r.cases.find((c) => c.anchor.row.suerte === '03A');
    const b = makeReview(other, r.evidence, {
      state: 'confirmed',
      links: r.evidence.filter((e) => e.source === 'pf').map((e) => e.id),
      notes: 'Trabajó en ambas suertes; respaldo documental compartido',
    });
    expect(selectedAmount([a, b], r)).toBe(597);
  });
  it('valida respaldo, historial y duplicados sin restaurar confirmaciones ciegamente', () => {
    const review = confirm(full());
    expect(validateBackup(backup(review)).reviews).toHaveLength(1);
    expect(() => validateBackup({ ...backup(review), version: 9 })).toThrow();
    expect(() => validateBackup({ ...backup(review), reviews: [review, review] })).toThrow();
    expect(() => validateBackup(backup({ ...review, state: 'without' }))).toThrow();
    expect(() => validateBackup(backup({ ...review, snapshots: {} }))).toThrow();
    expect(reviewStatus(review, null, []).stale).toBe(true);
  });
});
