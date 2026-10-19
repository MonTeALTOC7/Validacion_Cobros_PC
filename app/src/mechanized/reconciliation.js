import { financeClass } from '../engine/finance';
import { programmingEvents } from './model';

export const STATES = {
  strong: 'Coincidencia documental fuerte',
  candidate: 'Coincidencia candidata',
  missing: 'Sin Prefactura localizada',
  pfOnly: 'Prefactura sin HM',
  notExecuted: 'Programada no ejecutada',
  duplicate: 'Posible duplicidad',
  inconsistent: 'Inconsistencia documental',
  coverage: 'Cobertura insuficiente',
  excluded: 'Prefactura excluida por clasificación',
};
export const DECISIONS = {
  confirmed: 'Prefacturado confirmado',
  pending: 'Pendiente de revisión',
  without: 'Sin Prefactura localizada después de revisión',
  discarded: 'Sugerencia descartada',
  reopened: 'Reabierto',
};
export const DEFAULT_RULES = { tolerance: 14, alternatives: [], coverage: { start: '', end: '', zones: '', note: '' } };
const norm = (x) =>
  String(x ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
export const code = (x) =>
  norm(x)
    .replace(/\.0$/, '')
    .replace(/^0+(?=\d)/, '');
export const stable = (value) =>
  JSON.stringify(value, function (key, v) {
    return v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v;
  });
const clean = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([k]) => !['id', 'sourceFile', 'sourceSheet', 'sourceRow', 'inventoryKey', 'original'].includes(k),
    ),
  );
export function classifyPrefactura(row) {
  const financial = financeClass(row);
  if (['MANUAL', 'TPS', 'TPS_EXTERNO', 'AEREA', 'CS2661'].includes(financial))
    return {
      eligible: false,
      financial,
      reason: `Excluida: clasificación financiera ${financial}; SAP ${row.service || 'ausente'}, contratista ${row.contractorCode || 'ausente'}.`,
    };
  const eligible = financial === 'MECANIZADA' && ['HA', 'HR', 'KM'].includes(norm(row.unit)) && !!row.pFact;
  return {
    eligible: true,
    certain: eligible,
    financial,
    reason: eligible
      ? `Candidata mecanizada: SAP ${row.service}, UM ${row.unit}, contratista ${row.contractorCode}, P.FACT ${row.pFact}; clasificación ${financial}.`
      : `Clasificación por revisar: SAP ${row.service || 'ausente'}, UM ${row.unit || 'ausente'}, contratista ${row.contractorCode || 'ausente'}, P.FACT ${row.pFact || 'ausente'}, clase ${financial}. El código ${row.labor || 'ausente'} por sí solo no acredita mecanización.`,
  };
}

// Full canonical keys avoid hash collisions. Row position and import filename are never identities.
export function evidenceRows(rows, source) {
  const groups = new Map();
  for (const row of rows) {
    const doc = source === 'pf' ? row.pFact : row.document;
    const identity = [
      source,
      norm(doc),
      code(row.haciendaCode) || norm(row.hacienda),
      code(row.suerte),
      norm(row.labor),
      row.year ?? '',
      row.executionDate || row.date || row.startDate || row.periodStart || '',
      source === 'pf' ? [row.service, row.contractorCode, row.producerCode] : row.machine,
      source === 'program' ? [row.product, row.warehouse] : '',
    ];
    const key = stable(doc ? identity : [source, 'sin-documento', clean(row)]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups]
    .map(([id, lines]) => ({
      id,
      source,
      row: lines[0],
      lines,
      fingerprint: stable(lines.map(clean).sort((a, b) => stable(a).localeCompare(stable(b)))),
      ambiguous: lines.length > 1,
      classification: source === 'pf' ? classifyPrefactura(lines[0]) : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export const evidenceDate = (e) => e.row.executionDate || e.row.date || e.row.startDate || e.row.periodStart || '';
const dateValue = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s)) ? Date.parse(s) / 86400000 : null;
const interval = (e) => {
  const start = dateValue(evidenceDate(e));
  const end = e.row.executionDate || e.row.date ? start : (dateValue(e.row.endDate || e.row.periodEnd) ?? start);
  return [start, end];
};
export function compareEvidence(a, b, rules = DEFAULT_RULES) {
  const x = a.row,
    y = b.row;
  const hx = code(x.haciendaCode),
    hy = code(y.haciendaCode);
  const sameHacienda = hx && hy ? hx === hy : !!norm(x.hacienda) && norm(x.hacienda) === norm(y.hacienda);
  if (!sameHacienda || !code(x.suerte) || code(x.suerte) !== code(y.suerte)) return null;
  const sameLabor = !!norm(x.labor) && norm(x.labor) === norm(y.labor);
  const alternative = rules.alternatives.some(
    ([from, to]) =>
      (norm(x.labor) === norm(from) && norm(y.labor) === norm(to)) ||
      (norm(y.labor) === norm(from) && norm(x.labor) === norm(to)),
  );
  if (!sameLabor && !alternative) return null;
  const [as, ae] = interval(a),
    [bs, be] = interval(b);
  const delta = as == null || bs == null ? null : bs > ae ? bs - ae : as > be ? be - as : 0;
  if (delta != null && Math.abs(delta) > rules.tolerance) return null;
  const zoneConflict = x.zone && y.zone && code(x.zone) !== code(y.zone);
  const stateConflict = [a, b].some(
    (e) => e.source === 'program' && (norm(e.row.executed) !== 'SI' || ['1', 'SI'].includes(norm(e.row.suspended))),
  );
  const documents = (x.document || x.pFact) && (y.document || y.pFact);
  const certain = [a, b].every((e) => e.source !== 'pf' || e.classification?.certain);
  const strong =
    sameLabor &&
    delta === 0 &&
    as === ae &&
    bs === be &&
    documents &&
    certain &&
    !zoneConflict &&
    !stateConflict &&
    !a.ambiguous &&
    !b.ambiguous;
  return {
    id: b.id,
    strong: !!strong,
    conflict: !!(zoneConflict || stateConflict),
    delta,
    reason: `${sameLabor ? 'Misma labor' : `Alternativa ${x.labor}/${y.labor}: requiere revisión humana`}; hacienda y suerte compatibles; ${delta == null ? 'fecha insuficiente' : `diferencia ${delta} días`}; ${documents ? 'documentos disponibles (numeraciones de fuentes independientes)' : 'documento ausente'}${zoneConflict ? '; zonas contradictorias' : !x.zone || !y.zone ? '; zona no informada en alguna fuente' : '; misma zona'}${stateConflict ? '; ejecución/suspensión por aclarar' : ''}${!certain ? '; clasificación de Prefactura por revisar' : ''}.`,
  };
}
function covered(anchor, pf, rules) {
  const c = rules.coverage,
    [start, end] = interval(anchor);
  const zones = c.zones.split(',').map(code);
  return !!(
    pf.length &&
    c.note.trim() &&
    start != null &&
    dateValue(c.start) != null &&
    dateValue(c.end) != null &&
    dateValue(c.start) <= start - rules.tolerance &&
    dateValue(c.end) >= end + rules.tolerance &&
    (c.zones.trim() === '*' || (anchor.row.zone && zones.includes(code(anchor.row.zone))))
  );
}
export function reconcile({ hm = [], prefactura = [], program = [] }, overrides = {}) {
  const rules = { ...DEFAULT_RULES, ...overrides, coverage: { ...DEFAULT_RULES.coverage, ...overrides.coverage } };
  if (!Number.isFinite(rules.tolerance) || rules.tolerance < 0 || rules.tolerance > 366)
    throw new Error('Tolerancia inválida (0–366 días).');
  const hmRows = evidenceRows(hm, 'hm'),
    pfRows = evidenceRows(prefactura, 'pf');
  const products = evidenceRows(program, 'program');
  const events = programmingEvents(program).map((event) => {
    const members = products.filter((p) => p.lines.some((r) => event.lines.includes(r)));
    const id = stable(['evento', members.map((p) => p.id).sort()]);
    return {
      id,
      source: 'program',
      row: event.lines[0],
      lines: event.lines,
      members: members.map((p) => p.id),
      fingerprint: stable(members.map((p) => [p.id, p.fingerprint]).sort()),
      ambiguous: event.workQuantity == null || members.some((p) => p.ambiguous) || !event.lines[0].document,
      workQuantity: event.workQuantity,
      reviewRequired: event.reviewRequired,
    };
  });
  // Identical ambiguous groups share a single case; every original line remains available.
  const eventMap = new Map();
  for (const event of events) {
    const previous = eventMap.get(event.id);
    if (previous) {
      previous.lines.push(...event.lines);
      previous.ambiguous = true;
      previous.workQuantity = null;
      previous.fingerprint = stable(previous.lines.map(clean));
    } else eventMap.set(event.id, { ...event, lines: [...event.lines] });
  }
  const uniqueEvents = [...eventMap.values()];
  const billingSignatures = new Map();
  for (const e of pfRows) {
    const r = e.row;
    const key = stable([
      code(r.haciendaCode) || norm(r.hacienda),
      code(r.suerte),
      r.date,
      r.labor,
      r.service,
      r.contractorCode,
      r.unit,
      r.units,
      r.total,
    ]);
    if (!billingSignatures.has(key)) billingSignatures.set(key, []);
    billingSignatures.get(key).push(e);
  }
  for (const group of billingSignatures.values())
    if (group.length > 1)
      group.forEach((e) => {
        e.possibleDuplicate = true;
      });
  const evidence = [...hmRows, ...pfRows, ...uniqueEvents];
  const usable = evidence.filter((e) => e.classification?.eligible !== false);
  const relations = new Map(
    usable.map((a) => [
      a.id,
      usable
        .filter((b) => a.source !== b.source)
        .map((b) => compareEvidence(a, b, rules))
        .filter(Boolean),
    ]),
  );
  // One anchor per movement, then unrepresented events and PF. Never merge passes through a transitive graph.
  const anchors = [...hmRows];
  const represented = new Set();
  const represent = (e) => {
    represented.add(e.id);
    (relations.get(e.id) || []).forEach((r) => represented.add(r.id));
  };
  anchors.forEach(represent);
  for (const event of uniqueEvents) {
    if (!represented.has(event.id) || (relations.get(event.id) || []).some((r) => !represented.has(r.id))) {
      anchors.push(event);
      represent(event);
    }
  }
  for (const pf of pfRows)
    if (!represented.has(pf.id)) {
      anchors.push(pf);
      represent(pf);
    }
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const cases = anchors.map((anchor) => {
    const matches = (relations.get(anchor.id) || []).map((match) => {
      const other = byId.get(match.id);
      const competing = relations.get(other.id)?.filter((r) => byId.get(r.id)?.source === anchor.source).length > 1;
      return {
        ...match,
        strong: match.strong && !competing,
        reason: match.reason + (competing ? ' Varios trabajos compatibles: selección manual obligatoria.' : ''),
      };
    });
    const related = [anchor, ...matches.map((m) => byId.get(m.id))];
    const pf = related.filter((e) => e.source === 'pf'),
      hms = related.filter((e) => e.source === 'hm');
    const notExecuted = related.some(
      (e) => e.source === 'program' && (norm(e.row.executed) === 'NO' || ['1', 'SI'].includes(norm(e.row.suspended))),
    );
    const executed = related.some(
      (e) =>
        e.source === 'hm' ||
        (e.source === 'program' && norm(e.row.executed) === 'SI' && !['1', 'SI'].includes(norm(e.row.suspended))),
    );
    const duplicate = related.some((e) => e.ambiguous || e.possibleDuplicate);
    const contradictory = matches.some((m) => m.conflict) || (notExecuted && !!(hms.length || pf.length));
    let state = 'coverage';
    if (anchor.classification?.eligible === false) state = 'excluded';
    else if (duplicate) state = 'duplicate';
    else if (contradictory) state = 'inconsistent';
    else if (notExecuted) state = 'notExecuted';
    else if (pf.length && !hms.length) state = 'pfOnly';
    else if (pf.length)
      state = matches.some((m) => byId.get(m.id).source === 'pf' && m.strong) && pf.length === 1 ? 'strong' : 'candidate';
    else if (executed && covered(anchor, pfRows, rules)) state = 'missing';
    const warnings = [];
    if (duplicate)
      warnings.push(
        'Posible repetición de facturación, identidad o superficie ambigua: revisar cada línea original. Las identidades ambiguas bloquean la confirmación.',
      );
    if (!covered(anchor, pfRows, rules))
      warnings.push('Cobertura no acreditada para todo el intervalo y zona. Sin coincidencia no significa sin cobro.');
    if (related.some((e) => e.source === 'program' && e.reviewRequired))
      warnings.push('Agrupación de productos candidata: validar evento; superficie contada una sola vez.');
    if (pf.length > 1) warnings.push('Varias líneas de Prefactura compatibles: seleccionar respaldos exactos.');
    const signature = stable({ rules, evidence: related.map((e) => [e.id, e.fingerprint]).sort() });
    return { id: anchor.id, anchor, matches, related, state, warnings, signature, executed };
  });
  return {
    cases,
    evidence,
    rules,
    counts: { movements: hm.length, events: uniqueEvents.length, pfLines: prefactura.length },
    pfAmount: prefactura.reduce((sum, r) => sum + (Number.isFinite(r.total) ? r.total : 0), 0),
  };
}

export function reviewStatus(review, item, evidence) {
  if (!review) return { stale: false, confirmed: false };
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const stale =
    !item ||
    item.signature !== review.signature ||
    review.links.some((id) => {
      const e = byId.get(id);
      return !e || e.ambiguous || e.fingerprint !== review.snapshots[id]?.fingerprint;
    });
  return { stale, confirmed: review.state === 'confirmed' && !stale };
}
export function makeReview(item, evidence, { state, links, notes }, previous, now = new Date().toISOString()) {
  if (!DECISIONS[state]) throw new Error('Decisión inválida.');
  const ids = [...new Set([item.anchor.id, ...links])].sort();
  const selected = ids.map((id) => evidence.find((e) => e.id === id));
  if (selected.some((e) => !e)) throw new Error('La evidencia cambió; vuelva a abrir el caso.');
  if (state === 'discarded' && ids.length < 2)
    throw new Error('Seleccione la sugerencia exacta que desea descartar. El caso permanece pendiente.');
  if (
    state === 'confirmed' &&
    (selected.some((e) => e.ambiguous || e.classification?.eligible === false) ||
      !selected.some((e) => e.source === 'pf') ||
      !selected.some((e) => e.source !== 'pf'))
  )
    throw new Error('Seleccione Prefactura y HM/Programación sin identidades ambiguas ni líneas excluidas.');
  if (state === 'without' && selected.some((e) => e.source === 'pf'))
    throw new Error('Desvincule Prefactura antes de registrar ausencia revisada.');
  if (!notes.trim()) throw new Error('Registre una observación para conservar el motivo de la decisión.');
  const snapshots = Object.fromEntries(
    selected.map((e) => [e.id, { source: e.source, fingerprint: e.fingerprint, lines: e.lines }]),
  );
  const entry = {
    id: crypto.randomUUID(),
    at: now,
    state,
    notes: notes.trim(),
    links: ids,
    snapshots,
    signature: item.signature,
  };
  return { caseId: item.id, ...entry, history: [...(previous?.history || []), entry] };
}

export function selectedAmount(reviews, result) {
  const ids = new Set();
  for (const review of reviews) {
    if (
      reviewStatus(
        review,
        result.cases.find((c) => c.id === review.caseId),
        result.evidence,
      ).confirmed
    )
      review.links.forEach((id) => ids.add(id));
  }
  return result.evidence
    .filter((e) => e.source === 'pf' && ids.has(e.id))
    .reduce((sum, e) => sum + (Number(e.row.total) || 0), 0);
}
