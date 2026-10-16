import { describe, expect, it } from 'vitest';
import { biffSerialToDate, localWallToManagua, normalizeText, toIsoDate, xlsxSerialToDate } from '../../src/engine/normalize';

describe('normalizeText', () => {
  it('elimina el carácter de reemplazo U+FFFD, tildes y espacios repetidos', () => {
    expect(normalizeText('a�b')).toBe('AB');
    expect(normalizeText(' Preparácion   riego� ')).toBe('PREPARACION RIEGO');
    expect(normalizeText('Caña')).toBe('CANA');
  });
});

describe('fechas de Excel independientes de la zona horaria', () => {
  it('.xlsx: mismo instante que SheetJS en Managua (firma v0.7/v0.8) y fecha exacta de la celda', () => {
    // 46082 = 2026-03-01; en Managua SheetJS 0.18.5 producía 2026-03-01T06:00:12.000Z.
    expect(xlsxSerialToDate(46082).toISOString()).toBe('2026-03-01T06:00:12.000Z');
    expect(toIsoDate(xlsxSerialToDate(46082))).toBe('2026-03-01');
    // 23:59:59 sigue siendo el mismo día (antes, en Managua, desde las 18:00 pasaba al día siguiente).
    expect(toIsoDate(xlsxSerialToDate(46082.99999))).toBe('2026-03-01');
    expect(JSON.stringify(xlsxSerialToDate(46082))).toBe('"2026-03-01T06:00:12.000Z"');
  });

  it('.xls: año, mes, día y hora de parse_date_code con la hora de Managua', () => {
    expect(biffSerialToDate(46082.5).toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(toIsoDate(biffSerialToDate(46082.5))).toBe('2026-03-01');
    expect(toIsoDate(biffSerialToDate(1))).toBe('1900-01-01');
    expect(toIsoDate(biffSerialToDate(61))).toBe('1900-03-01');
    expect(biffSerialToDate(-1)).toBeNull();
  });

  it('formatos de texto: la hora de pared del equipo pasa al mismo instante que en Managua', () => {
    const wall = new Date(2026, 2, 1, 7, 30);
    expect(localWallToManagua(wall).toISOString()).toBe('2026-03-01T13:30:00.000Z');
    expect(toIsoDate(localWallToManagua(wall))).toBe('2026-03-01');
  });
});
