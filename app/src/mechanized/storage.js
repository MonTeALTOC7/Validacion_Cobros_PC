import Dexie from 'dexie';
// Separate database: legacy resets, backups and upgrades cannot overwrite this workspace.
const db = new Dexie('casur-mechanized-stage-a');
db.version(1).stores({ sources: '&kind' });
export const loadSources = async () => Object.fromEntries((await db.sources.toArray()).map(({ kind, data }) => [kind, data]));
export const saveSource = (kind, data) => db.sources.put({ kind, data });
