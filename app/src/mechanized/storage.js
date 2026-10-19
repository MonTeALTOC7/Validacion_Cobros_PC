import Dexie from 'dexie';
import { stable } from './reconciliation';
// Separate database: legacy resets, backups and upgrades cannot overwrite this workspace.
export function createMechanizedDB(name = 'casur-mechanized-stage-a') {
  const db = new Dexie(name);
  db.version(1).stores({ sources: '&kind' });
  db.version(2).stores({ sources: '&kind', reviews: '&caseId', cases: '&id', evidence: '&id', settings: '&key' });
  return db;
}
export const db = createMechanizedDB();
export const loadSources = async () => Object.fromEntries((await db.sources.toArray()).map(({ kind, data }) => [kind, data]));
export const saveSource = (kind, data) => db.sources.put({ kind, data });
export const loadReviews = () => db.reviews.toArray();
export const saveReview = (review) =>
  db.transaction('rw', db.reviews, async () => {
    const current = await db.reviews.get(review.caseId);
    if ((current?.id || null) !== (review.history.at(-2)?.id || null))
      throw new Error('Otra pestaña modificó esta decisión. Recargue antes de guardar para conservar todo el historial.');
    await db.reviews.put(review);
  });
export const loadRules = async () => (await db.settings.get('rules'))?.value;
export const saveRules = (value) => db.settings.put({ key: 'rules', value });
export const saveEvaluation = (result) =>
  db.transaction('rw', db.cases, db.evidence, async () => {
    await db.cases.clear();
    await db.evidence.clear();
    await db.cases.bulkPut(result.cases);
    await db.evidence.bulkPut(result.evidence);
  });

const decisionStates = new Set(['confirmed', 'pending', 'without', 'discarded', 'reopened']);
const object = (x) => x && typeof x === 'object' && !Array.isArray(x);
function validEntry(e) {
  return (
    object(e) &&
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.at === 'string' &&
    Number.isFinite(Date.parse(e.at)) &&
    decisionStates.has(e.state) &&
    typeof e.notes === 'string' &&
    typeof e.signature === 'string' &&
    Array.isArray(e.links) &&
    e.links.length > 0 &&
    new Set(e.links).size === e.links.length &&
    object(e.snapshots) &&
    e.links.every(
      (id) =>
        typeof id === 'string' &&
        Object.hasOwn(e.snapshots, id) &&
        ['hm', 'pf', 'program'].includes(e.snapshots[id]?.source) &&
        typeof e.snapshots[id]?.fingerprint === 'string' &&
        Array.isArray(e.snapshots[id]?.lines),
    )
  );
}
export function validateBackup(data) {
  if (!object(data) || data.format !== 'casur-mechanized-decisions' || data.version !== 1 || !Array.isArray(data.reviews))
    throw new Error('Respaldo de mecanizadas inválido o versión no compatible.');
  const keys = new Set(),
    events = new Set();
  for (const review of data.reviews) {
    if (
      !validEntry(review) ||
      typeof review.caseId !== 'string' ||
      keys.has(review.caseId) ||
      !review.links.includes(review.caseId) ||
      !Array.isArray(review.history) ||
      !review.history.length ||
      review.history.some((h) => !validEntry(h) || events.has(h.id) || !events.add(h.id))
    )
      throw new Error('Respaldo con decisiones, historial o identidades duplicadas/inválidas.');
    const last = review.history.at(-1);
    if (
      ['id', 'at', 'state', 'notes', 'signature', 'links', 'snapshots'].some(
        (k) => JSON.stringify(review[k]) !== JSON.stringify(last[k]),
      )
    )
      throw new Error('La última revisión no coincide con su historial.');
    keys.add(review.caseId);
  }
  return data;
}
export const exportDecisions = async () => ({
  format: 'casur-mechanized-decisions',
  version: 1,
  exportedAt: new Date().toISOString(),
  reviews: await loadReviews(),
});
export async function restoreDecisions(data) {
  validateBackup(data);
  return db.transaction('rw', db.reviews, async () => {
    let added = 0;
    const eventOwners = new Map((await db.reviews.toArray()).flatMap((r) => r.history.map((h) => [h.id, r.caseId])));
    for (const review of data.reviews) {
      if (review.history.some((h) => eventOwners.has(h.id) && eventOwners.get(h.id) !== review.caseId))
        throw new Error('Identificador de historial ya utilizado por otro caso. No se restauró ninguna decisión.');
      const current = await db.reviews.get(review.caseId);
      if (current && stable(current) !== stable(review))
        throw new Error('Conflicto con una decisión local: no se sobrescribió ninguna revisión.');
      if (!current) {
        await db.reviews.add(review);
        added++;
      }
    }
    return added;
  });
}
