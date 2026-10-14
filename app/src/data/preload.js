// Precarga de los Excel publicados en datos/ (solo cuando el dispositivo no tiene datos guardados).
import { parseExampleFile, parseMasterFile, parsePayrollFile, parsePrefacturaFile, parseReviewFile } from '../engine/importers';

export const EMPTY_INPUTS = { payroll: [], prefactura: [], master: [], files: [] };

const PARSERS = {
  payroll: parsePayrollFile,
  prefactura: parsePrefacturaFile,
  master: parseMasterFile,
  example: parseExampleFile,
};

const fetchJson = async (path) => {
  const response = await fetch(path, { cache: 'no-store' });
  return response.ok ? response.json() : null;
};

const fetchFile = async (path, name, lastModified) => {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No fue posible precargar ${name}.`);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type, lastModified });
};

/** Lee datos/manifest.json y procesa cada archivo con su importador. Devuelve { inputs, version } o null. */
export const loadPreloadedInputs = async () => {
  const manifest = await fetchJson('./datos/manifest.json');
  if (!manifest) return null;
  const inputs = { payroll: [], prefactura: [], master: [], files: [] };
  for (const entry of manifest.files) {
    const file = await fetchFile(`./datos/${entry.path}`, entry.name, Date.parse(manifest.generatedAt) || Date.now());
    const parsed = await (PARSERS[entry.kind] ?? parseExampleFile)(file);
    if (entry.kind in inputs && entry.kind !== 'files') inputs[entry.kind] = parsed.rows;
    parsed.file.source = 'PRELOADED';
    inputs.files.push(parsed.file);
  }
  return { inputs, version: manifest.version ?? '' };
};

/**
 * Compatibilidad: maestros guardados por versiones anteriores sin fechas/área.
 * Si el maestro guardado es el mismo archivo publicado (mismo hash), se vuelve a leer completo.
 */
export const refreshMasterFromPreload = async (inputs) => {
  if (!inputs.master.some((row) => row.plantingDate === undefined || row.area === undefined)) return inputs;
  const stored = inputs.files.find((file) => file.kind === 'master');
  if (!stored) return inputs;
  try {
    const manifest = await fetchJson('./datos/manifest.json');
    const entry = manifest?.files.find((file) => file.kind === 'master');
    if (!entry) return inputs;
    const response = await fetch('./datos/' + entry.path, { cache: 'no-store' });
    if (!response.ok) return inputs;
    const parsed = await parseMasterFile(new File([await response.blob()], entry.name));
    return parsed.file.hash === stored.hash ? { ...inputs, master: parsed.rows } : inputs;
  } catch {
    return inputs;
  }
};

/** Archivo de ejemplo para Revisión por Correo (datos/revision-manifest.json). */
export const loadPreloadedReview = async () => {
  const manifest = await fetchJson('./datos/revision-manifest.json');
  if (!manifest) return null;
  const file = await fetchFile(
    `./datos/${manifest.file.path}`,
    manifest.file.name,
    Date.parse(manifest.generatedAt) || Date.now(),
  );
  const parsed = await parseReviewFile(file);
  parsed.file.source = 'PRELOADED';
  return {
    file: parsed.file,
    rows: parsed.rows,
    requestedWeekStart: manifest.requestedWeekStart,
    requestedWeekEnd: manifest.requestedWeekEnd,
  };
};
