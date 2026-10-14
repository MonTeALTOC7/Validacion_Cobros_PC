import { describe, expect, it } from 'vitest';
import {
  comparePeriods,
  createWeekIndex,
  operationalYear,
  parsePeriodoText,
  periodKey,
  resolveStartPeriod,
} from '../../src/engine/periods';
import { normalizeSuerte, parseNumberCell, toIsoDate } from '../../src/engine/normalize';

describe('año operativo SIAGRI', () => {
  it('asigna diciembre con semana baja al año siguiente (verificado en Nómina 2025-12-22…31 = S1–S2)', () => {
    expect(operationalYear('2025-12-29', 2)).toBe(2026);
    expect(operationalYear('2025-12-22', 1)).toBe(2026);
  });
  it('mantiene diciembre con semana alta en su año (S50–S52)', () => {
    expect(operationalYear('2025-12-15', 52)).toBe(2025);
  });
  it('asigna enero con semana alta al año anterior', () => {
    expect(operationalYear('2027-01-02', 53)).toBe(2026);
  });
  it('devuelve null con fecha inválida', () => {
    expect(operationalYear('', 3)).toBeNull();
  });
});

describe('períodos', () => {
  it('ordena por año y semana', () => {
    expect(comparePeriods('2025-S52', '2026-S01')).toBeLessThan(0);
    expect(comparePeriods(periodKey(2026, 2), '2026-S10')).toBeLessThan(0);
  });
  it('interpreta la columna Periodo de la Prefactura', () => {
    expect(parsePeriodoText('SEMANA 2  -  29/12/25 - 04/01/26')).toEqual({ week: 2, start: '2025-12-29', end: '2026-01-04' });
    expect(parsePeriodoText('sin formato')).toBeNull();
  });
  it('la fecha inicial no parte la semana operativa (incluye 29–31 dic en la S2 de 2026)', () => {
    const rows = [
      { year: 2026, week: 1, date: '2025-12-24' },
      { year: 2026, week: 2, date: '2025-12-30' },
      { year: 2026, week: 2, date: '2026-01-02' },
    ];
    expect(resolveStartPeriod(rows, '2026-01-01')).toEqual({ year: 2026, week: 2 });
  });
  it('mide la distancia entre semanas a través del cambio de año', () => {
    const index = createWeekIndex([
      { year: 2025, week: 52 },
      { year: 2026, week: 1 },
    ]);
    expect(index(2026, 1) - index(2025, 52)).toBe(1);
  });
});

describe('normalización', () => {
  it('suerte: texto y número equivalen, con sufijo de letras', () => {
    expect(normalizeSuerte('1')).toBe('01');
    expect(normalizeSuerte(1)).toBe('01');
    expect(normalizeSuerte('1.0')).toBe('01');
    expect(normalizeSuerte('5a')).toBe('05A');
  });
  it('distingue vacío, cero y no numérico', () => {
    expect(parseNumberCell('')).toMatchObject({ value: 0, valid: true, empty: true });
    expect(parseNumberCell(0)).toMatchObject({ value: 0, valid: true });
    expect(parseNumberCell('1,234.5')).toMatchObject({ value: 1234.5, valid: true });
    expect(parseNumberCell('abc')).toMatchObject({ value: 0, valid: false });
  });
  it('fechas en texto: AAAA-MM-DD y DD/MM/AAAA, sin ambigüedad mes/día', () => {
    expect(toIsoDate('2026-03-02')).toBe('2026-03-02');
    expect(toIsoDate('02/03/2026')).toBe('2026-03-02');
    expect(toIsoDate('31/02/2026')).toBe('');
    expect(toIsoDate(46082)).toBe('2026-03-01');
  });
});
