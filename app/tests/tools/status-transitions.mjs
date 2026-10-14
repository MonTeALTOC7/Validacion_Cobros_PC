// Resume las transiciones de estado entre el legacy y la versión nueva (salida de compare-legacy --out).
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const group = (list) => {
  const map = new Map();
  for (const f of list) map.set(f.key, [...(map.get(f.key) ?? []), f]);
  return map;
};
const legacy = group(report.legacyFindings);
const next = group(report.nextFindings);
const transitions = {};
const count = (k) => (transitions[k] = (transitions[k] ?? 0) + 1);
for (const [key, list] of legacy) {
  const after = next.get(key);
  if (!after) list.forEach((f) => count(`${f.status} → (agrupado/eliminado)`));
  else if (after.length === list.length)
    list.forEach((f, i) => f.status !== after[i].status && count(`${f.status} → ${after[i].status}`));
  else count(`${list.map((f) => f.status).join('+')} → ${after.map((f) => f.status).join('+')}`);
}
for (const [key, list] of next) if (!legacy.has(key)) list.forEach((f) => count(`(nuevo) → ${f.status}`));
const flags = {};
report.nextFindings.forEach((f) => f.flags.forEach((x) => (flags[x] = (flags[x] ?? 0) + 1)));
console.log(
  JSON.stringify({ legacy: report.legacyFindings.length, next: report.nextFindings.length, transitions, flags }, null, 1),
);
