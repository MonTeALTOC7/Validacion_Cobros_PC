import { read as readWorkbook, utils as XLSXUtils } from 'xlsx';
import {
  cleanCode,
  extractContractorCode,
  hashId,
  normalizeSuerte,
  normalizeText,
  toIsoDate,
  toNumber,
} from './normalize';

const rowSignature = (a) =>
  JSON.stringify(
    Object.entries(a)
      .filter(([s]) => !['id', 'sourceRow', 'sheet'].includes(s))
      .sort(([s], [t]) => s.localeCompare(t)),
  );
export const diffRows = (a, s) => {
  const t = (x) => {
    const m = new Map();
    x.forEach((f) => {
      const S = rowSignature(f);
      m.set(S, (m.get(S) ?? 0) + 1);
    });
    return m;
  };
  const n = t(a);
  const i = t(s);
  let r = 0;
  i.forEach((x, m) => {
    r += Math.min(x, n.get(m) ?? 0);
  });
  const l = [...new Set(s.map((x) => x.week).filter((x) => !!x))]
    .filter((x) => !a.some((m) => m.week === x))
    .sort((x, m) => x - m);
  const o = (x, m) => {
    const f = new Map(m);
    const S = [];
    x.forEach((A) => {
      const E = rowSignature(A);
      const D = f.get(E) ?? 0;
      D ? f.set(E, D - 1) : S.length < 8 && S.push(A);
    });
    return S;
  };
  return {
    added: s.length - r,
    removed: a.length - r,
    unchanged: r,
    addedExamples: o(s, n),
    removedExamples: o(a, i),
    duplicates: [...i.values()].reduce((x, m) => x + Math.max(0, m - 1), 0),
    newWeeks: l,
  };
};
export const unitTotals = (a) => {
  const s = new Map();
  a.forEach((t) => {
    const n = t;
    n.unit && typeof n.units == 'number' && s.set(n.unit, (s.get(n.unit) ?? 0) + n.units);
  });
  return [...s].sort(([t], [n]) => t.localeCompare(n));
};
const readSheet = (a, s) => {
  const t = a.Sheets[s];
  return t
    ? XLSXUtils.sheet_to_json(t, {
        defval: '',
        raw: true,
      })
    : [];
};
const assertColumns = (a, s, t) => {
  if (!a.length) throw new Error(`${t}: la hoja no contiene registros.`);
  const n = new Set(Object.keys(a[0]));
  const i = s.filter((r) => !n.has(r));
  if (i.length) throw new Error(`${t}: faltan columnas requeridas: ${i.join(', ')}.`);
};
const sha256Hex = async (a) => {
  const s = await crypto.subtle.digest('SHA-256', a);
  return Array.from(new Uint8Array(s))
    .map((t) => t.toString(16).padStart(2, '0'))
    .join('');
};
export const parsePayrollFile = async (a) => {
  const s = await a.arrayBuffer();
  const t = readWorkbook(s, {
    type: 'array',
    cellDates: true,
  });
  const n = readSheet(t, 'REPORTE');
  assertColumns(
    n,
    [
      'Hacienda',
      'Nombre Hacienda',
      'Suerte',
      'Semana',
      'Fecha',
      'Labor',
      'Unidad de Medida',
      'Servicio',
      'Unidades',
    ],
    'Nómina',
  );
  const i = n
    .map((r, l) => ({
      id: hashId('payroll', a.name, l + 2),
      sourceRow: l + 2,
      week: toNumber(r.Semana),
      date: toIsoDate(r.Fecha),
      haciendaCode: cleanCode(r.Hacienda),
      hacienda: normalizeText(r['Nombre Hacienda']),
      suerte: normalizeSuerte(r.Suerte),
      labor: normalizeText(r.Labor),
      laborName: String(r['Nombre Labor'] ?? '').trim(),
      service: cleanCode(r.Servicio).toUpperCase(),
      serviceName: String(r['Nombre Servicio'] ?? '').trim(),
      unit: normalizeText(r['Unidad de Medida']),
      units: toNumber(r.Unidades),
      payrollTariff: toNumber(r.Tarifa),
      worker: String(r['Nombre Trabajador'] ?? '').trim(),
    }))
    .filter(
      (r) => r.date && r.hacienda && r.service && r.unit && r.week >= 1 && r.week <= 53 && r.units !== 0,
    );
  if (!i.length) throw new Error('Nómina: no hay filas utilizables. Se conserva el archivo anterior.');
  return {
    rows: i,
    file: {
      ...(await buildFileMetadata(a, 'payroll', s, i)),
      rawRows: n.length,
      skippedRows: n.length - i.length,
    },
  };
};
export const parsePrefacturaFile = async (a) => {
  const s = await a.arrayBuffer();
  const t = readWorkbook(s, {
    type: 'array',
    cellDates: true,
  });
  const n = readSheet(t, 'REPORTE');
  assertColumns(
    n,
    [
      'Semana',
      'Fecha',
      'Nombre Hacienda',
      'Ste',
      'Labor',
      'Servicio SAP',
      'Unidades',
      'UM',
      'P.FACT',
      'Contratista',
    ],
    'Prefactura',
  );
  const i = n
    .map((r, l) => ({
      id: hashId('prefactura', a.name, l + 2),
      sourceRow: l + 2,
      week: toNumber(r.Semana),
      date: toIsoDate(r.Fecha),
      haciendaCode: cleanCode(r.Hda),
      hacienda: normalizeText(r['Nombre Hacienda']),
      suerte: normalizeSuerte(r.Ste),
      labor: normalizeText(r.Labor),
      laborName: String(r.Descripcion ?? '').trim(),
      service: cleanCode(r['Servicio SAP']).toUpperCase(),
      serviceName: String(r['Nombre Servicio'] ?? '').trim(),
      unit: normalizeText(r.UM),
      units: toNumber(r.Unidades),
      tariff: toNumber(r.Tarifa),
      total: toNumber(r.Total),
      pFact: cleanCode(r['P.FACT']),
      producerCode: cleanCode(r.Productor),
      producer: String(r['Nombre Productor'] ?? '').trim(),
      contractorCode: extractContractorCode(r.Contratista),
      contractor: String(r.Contratista ?? '').trim(),
    }))
    .filter(
      (r) => r.date && r.hacienda && r.service && r.unit && r.week >= 1 && r.week <= 53 && r.units !== 0,
    );
  if (!i.length) throw new Error('Prefactura: no hay filas utilizables. Se conserva el archivo anterior.');
  return {
    rows: i,
    file: {
      ...(await buildFileMetadata(a, 'prefactura', s, i)),
      rawRows: n.length,
      skippedRows: n.length - i.length,
    },
  };
};
export const parseMasterFile = async (a) => {
  const s = await a.arrayBuffer();
  const t = readWorkbook(s, {
    type: 'array',
    cellDates: true,
  });
  const n = [];
  for (const i of t.SheetNames) {
    const r = readSheet(t, i);
    !r.length ||
      !Object.prototype.hasOwnProperty.call(r[0], 'Hacienda') ||
      r.forEach((l, o) => {
        const x = normalizeText(l.Hacienda);
        const m = normalizeSuerte(l.Suerte);
        !x ||
          !m ||
          n.push({
            id: hashId('master', a.name, i, o + 2),
            sourceRow: o + 2,
            sheet: i,
            haciendaCode: cleanCode(l.Cod),
            hacienda: x,
            suerte: m,
            tenure: normalizeText(l.Tenencia),
            erp: cleanCode(l.ERP),
            zone: String(l.ZONA ?? '').trim(),
            status: String(l.Estado ?? '').trim(),
            plantingDate: l['F. Siembra'] ? toIsoDate(l['F. Siembra']) : '',
            lastCutDate: l['F. Ult. Cte'] ? toIsoDate(l['F. Ult. Cte']) : '',
            area: toNumber(l.Area),
            producerScope:
              normalizeText(i).includes('PRODUCTOR') || normalizeText(l.ZONA).includes('PRODUCTOR'),
          });
      });
  }
  if (!n.length) throw new Error('Maestro: no se encontraron hojas con Hacienda y Suerte.');
  return {
    rows: n,
    file: await buildFileMetadata(a, 'master', s, n),
  };
};
export const parseExampleFile = async (a) => {
  const s = await a.arrayBuffer();
  const t = readWorkbook(s, {
    type: 'array',
    cellDates: true,
  });
  const n = t.SheetNames.flatMap((i) => readSheet(t, i));
  return {
    rows: n,
    file: await buildFileMetadata(a, 'example', s, n),
  };
};
export const parseReviewFile = async (a) => {
  const s = await a.arrayBuffer();
  const t = readWorkbook(s, {
    type: 'array',
    cellDates: true,
  });
  const n = readSheet(t, 'REPORTE');
  assertColumns(
    n,
    [
      'AÑO',
      'SEM.',
      'Nombre Hacienda',
      'STE.',
      'LAB',
      'Nombre Servicio',
      'UM',
      'PRESTADOR',
      'TOTAL',
      'TARIFA',
      'UND',
    ],
    'Revisión por Correo',
  );
  const i = n
    .map((l, o) => ({
      id: hashId('review', a.name, o + 2),
      sourceRow: o + 2,
      year: toNumber(l.AÑO),
      week: toNumber(l['SEM.']),
      hacienda: normalizeText(l['Nombre Hacienda']),
      suerte: normalizeSuerte(l['STE.']),
      labor: normalizeText(l.LAB),
      serviceName: String(l['Nombre Servicio'] ?? '').trim(),
      unit: normalizeText(l.UM),
      units: toNumber(l.UND),
      tariff: toNumber(l.TARIFA),
      total: toNumber(l.TOTAL),
      contractorCode: extractContractorCode(l.PRESTADOR),
      contractor: String(l.PRESTADOR ?? '').trim(),
    }))
    .filter(
      (l) => l.year >= 2e3 && l.week >= 1 && l.week <= 53 && l.hacienda && l.labor && l.unit && l.units !== 0,
    );
  if (!i.length) throw new Error('Revisión por Correo: no se encontraron registros utilizables.');
  if (new Set(i.map((l) => l.year)).size !== 1)
    throw new Error(
      'Revisión por Correo: seleccione un reporte de un solo año para no mezclar semanas de distintos años.',
    );
  const r = i.map((l) => l.week);
  return {
    rows: i,
    file: {
      name: a.name,
      size: a.size,
      importedAt: new Date().toISOString(),
      hash: await sha256Hex(s),
      rows: i.length,
      weekStart: Math.min(...r),
      weekEnd: Math.max(...r),
      source: 'UPLOADED',
      rawRows: n.length,
      skippedRows: n.length - i.length,
    },
  };
};
const buildFileMetadata = async (a, s, t, n) => {
  const i = n;
  const r = i
    .map((o) => o.date)
    .filter((o) => !!o)
    .sort();
  const l = i.map((o) => o.week).filter((o) => !!o && Number.isFinite(o));
  return {
    kind: s,
    name: a.name,
    size: a.size,
    modified: a.lastModified,
    importedAt: new Date().toISOString(),
    hash: await sha256Hex(t),
    rows: n.length,
    source: 'UPLOADED',
    validation: 'RECOGNIZED',
    dateStart: r[0],
    dateEnd: r.at(-1),
    weekStart: l.length ? Math.min(...l) : undefined,
    weekEnd: l.length ? Math.max(...l) : undefined,
  };
};
