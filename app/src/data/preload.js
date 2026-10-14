import {
  parseExampleFile,
  parseMasterFile,
  parsePayrollFile,
  parsePrefacturaFile,
  parseReviewFile,
} from '../engine/importers';

export const loadPreloadedInputs = async () => {
  const a = await fetch('./datos/manifest.json', {
    cache: 'no-store',
  });
  if (!a.ok) return null;
  const s = await a.json();
  const t = {
    payroll: [],
    prefactura: [],
    master: [],
    files: [],
  };
  for (const n of s.files) {
    const i = await fetch(`./datos/${n.path}`, {
      cache: 'no-store',
    });
    if (!i.ok) throw new Error(`No fue posible precargar ${n.name}.`);
    const r = await i.blob();
    const l = new File([r], n.name, {
      type: r.type,
      lastModified: Date.parse(s.generatedAt) || Date.now(),
    });
    if (n.kind === 'payroll') {
      const o = await parsePayrollFile(l);
      t.payroll = o.rows;
      o.file.source = 'PRELOADED';
      t.files.push(o.file);
    } else if (n.kind === 'prefactura') {
      const o = await parsePrefacturaFile(l);
      t.prefactura = o.rows;
      o.file.source = 'PRELOADED';
      t.files.push(o.file);
    } else if (n.kind === 'master') {
      const o = await parseMasterFile(l);
      t.master = o.rows;
      o.file.source = 'PRELOADED';
      t.files.push(o.file);
    } else {
      const o = await parseExampleFile(l);
      o.file.source = 'PRELOADED';
      t.files.push(o.file);
    }
  }
  return t;
};
export const refreshMasterFromPreload = async (a) => {
  if (!a.master.some((t) => t.plantingDate === undefined || t.area === undefined)) return a;
  const s = a.files.find((t) => t.kind === 'master');
  if (!s) return a;
  try {
    const t = await fetch('./datos/manifest.json', {
      cache: 'no-store',
    });
    if (!t.ok) return a;
    const i = (await t.json()).files.find((o) => o.kind === 'master');
    if (!i) return a;
    const r = await fetch('./datos/' + i.path, {
      cache: 'no-store',
    });
    if (!r.ok) return a;
    const l = await parseMasterFile(new File([await r.blob()], i.name));
    return l.file.hash === s.hash
      ? {
          ...a,
          master: l.rows,
        }
      : a;
  } catch {
    return a;
  }
};
export const loadPreloadedReview = async () => {
  const a = await fetch('./datos/revision-manifest.json', {
    cache: 'no-store',
  });
  if (!a.ok) return null;
  const s = await a.json();
  const t = await fetch(`./datos/${s.file.path}`, {
    cache: 'no-store',
  });
  if (!t.ok) throw new Error(`No fue posible precargar ${s.file.name}.`);
  const n = await t.blob();
  const i = new File([n], s.file.name, {
    type: n.type,
    lastModified: Date.parse(s.generatedAt) || Date.now(),
  });
  const r = await parseReviewFile(i);
  r.file.source = 'PRELOADED';
  return {
    file: r.file,
    rows: r.rows,
    requestedWeekStart: s.requestedWeekStart,
    requestedWeekEnd: s.requestedWeekEnd,
  };
};
export const EMPTY_INPUTS = {
  payroll: [],
  prefactura: [],
  master: [],
  files: [],
};
