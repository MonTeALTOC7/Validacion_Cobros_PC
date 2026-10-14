// Estado y acciones de la aplicación: carga inicial, importaciones, conciliación, Maestro Central,
// datos publicados, parámetros, respaldo y auditoría. Los componentes solo presentan.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_INPUTS, loadPreloadedInputs, loadPreloadedReview, refreshMasterFromPreload } from '../data/preload';
import { fetchRemoteMaster, isRemoteMasterFile, remoteMasterFile } from '../data/remoteMaster';
import { APP_VERSION, DEFAULT_PARAMETERS } from '../engine/constants';
import {
  diffRows,
  parseExampleFile,
  parseMasterFile,
  parsePayrollFile,
  parsePrefacturaFile,
  upgradeInputs,
} from '../engine/importers';
import { isBlockingPending } from '../engine/indicators';
import { hashId } from '../engine/normalize';
import { assessDataQuality } from '../engine/quality';
import { runReconciliation } from '../engine/reconciliation';
import { downloadJson } from '../lib/sheet';
import {
  appendAudit,
  clearLocalData,
  db,
  exportBackupData,
  loadAnalysis,
  loadInputs,
  loadLastUpdate,
  loadMasterSource,
  loadParameters,
  loadPreloadVersion,
  loadReviewWorkspace,
  restoreBackupData,
  saveAnalysis,
  saveInputs,
  saveMasterSource,
  saveParameters,
  savePreloadVersion,
  saveReviewWorkspace,
  validateBackup,
} from '../storage/db';

const PARSERS = {
  payroll: parsePayrollFile,
  prefactura: parsePrefacturaFile,
  master: parseMasterFile,
  example: parseExampleFile,
};
const REQUIRED_KINDS = ['payroll', 'prefactura', 'master'];
const KIND_LABELS = { payroll: 'Nómina', prefactura: 'Prefactura', master: 'Maestro', example: 'Ejemplo' };

const hasRequiredFiles = (inputs) => REQUIRED_KINDS.every((kind) => inputs.files.some((file) => file.kind === kind));
const pendingKey = (finding) =>
  [finding.year, finding.week, finding.hacienda, finding.suerte, finding.labor, finding.service, finding.unit].join('|');
const today = () => new Date().toISOString().slice(0, 10);

export function useConciliador() {
  const [hydrated, setHydrated] = useState(false);
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [analysis, setAnalysis] = useState(null);
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS);
  const [reviewWorkspace, setReviewWorkspace] = useState(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [notice, setNotice] = useState(null);
  const [busyKind, setBusyKind] = useState(null);
  const [working, setWorking] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [masterSource, setMasterSource] = useState('REMOTE');
  const [remoteMaster, setRemoteMaster] = useState(null);
  const [published, setPublished] = useState(null);

  // Referencias para que las acciones encadenadas usen siempre el estado más reciente.
  const inputsRef = useRef(inputs);
  const analysisRef = useRef(analysis);
  const parametersRef = useRef(parameters);
  inputsRef.current = inputs;
  analysisRef.current = analysis;
  parametersRef.current = parameters;

  const audit = useCallback(
    (action, detail) => appendAudit({ id: hashId(action, Date.now(), detail), at: new Date().toISOString(), action, detail }),
    [],
  );

  /** Guarda entradas y, si están completas, recalcula y guarda el análisis. */
  const commitInputs = useCallback(async (next, params = parametersRef.current) => {
    const nextAnalysis = hasRequiredFiles(next) ? runReconciliation(next, params) : null;
    await db.transaction('rw', db.values, async () => {
      await saveInputs(next);
      if (nextAnalysis) await saveAnalysis(nextAnalysis);
      else await db.values.delete('analysis');
    });
    setInputs(next);
    setAnalysis(nextAnalysis);
    return nextAnalysis;
  }, []);

  // ------------------------------------------------------------------------------------------
  // Carga inicial

  useEffect(() => {
    (async () => {
      const [storedInputs, storedAnalysis, storedParameters, storedReview, storedLastUpdate, storedMasterSource] =
        await Promise.all([
          loadInputs(),
          loadAnalysis(),
          loadParameters(),
          loadReviewWorkspace(),
          loadLastUpdate(),
          loadMasterSource(),
        ]);
      const params = { ...DEFAULT_PARAMETERS, ...storedParameters };
      setParameters(params);
      setMasterSource(storedMasterSource);
      if (storedLastUpdate) setLastUpdate(String(storedLastUpdate));
      if (storedReview) setReviewWorkspace(storedReview);
      else {
        try {
          const preloadedReview = await loadPreloadedReview();
          if (preloadedReview) {
            setReviewWorkspace(preloadedReview);
            await saveReviewWorkspace(preloadedReview);
          }
        } catch {
          /* la revisión de ejemplo es opcional */
        }
      }
      if (storedInputs) {
        const refreshed = upgradeInputs(await refreshMasterFromPreload(storedInputs));
        setInputs(refreshed);
        if (refreshed !== storedInputs) await saveInputs(refreshed);
        if (storedAnalysis && hasRequiredFiles(refreshed)) {
          const recalculated = runReconciliation(refreshed, params);
          setAnalysis(recalculated);
          await saveAnalysis(recalculated);
        }
        return;
      }
      try {
        const loaded = await loadPreloadedInputs();
        if (!loaded) return;
        const preloaded = loaded.inputs;
        setInputs(preloaded);
        await saveInputs(preloaded);
        const preloadedAnalysis = runReconciliation(preloaded, params);
        setAnalysis(preloadedAnalysis);
        await saveAnalysis(preloadedAnalysis);
        if (loaded.version) await savePreloadVersion(loaded.version);
        await audit('DATOS_PRECARGADOS', `${preloaded.files.length} archivos reconocidos y conciliados automáticamente.`);
        setNotice({ kind: 'ok', text: 'Datos iniciales precargados, reconocidos y conciliados correctamente.' });
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No fue posible cargar los datos iniciales.' });
      }
    })().finally(() => setHydrated(true));
  }, [audit]);

  // ------------------------------------------------------------------------------------------
  // Maestro Central (después de la carga inicial)

  const applyRemoteMaster = useCallback(
    async (master, { force = false } = {}) => {
      const current = inputsRef.current;
      const currentFile = current.files.find((file) => file.kind === 'master');
      if (!force && currentFile?.hash === remoteMasterFile(master).hash) return false;
      const next = {
        ...current,
        master: master.rows,
        files: [...current.files.filter((file) => file.kind !== 'master'), remoteMasterFile(master)],
      };
      const nextAnalysis = await commitInputs(next);
      await audit(
        'MAESTRO_CENTRAL_APLICADO',
        `Maestro Central ${master.version} (${master.origin === 'CACHE' ? 'respaldo local' : 'publicado'}), ${master.rows.length} suertes. ` +
          (nextAnalysis ? 'Conciliación recalculada.' : 'Faltan archivos para conciliar.'),
      );
      return true;
    },
    [audit, commitInputs],
  );

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      const master = await fetchRemoteMaster();
      setRemoteMaster(master);
      if (!master || masterSource !== 'REMOTE') return;
      const applied = await applyRemoteMaster(master);
      if (applied) setNotice({ kind: 'ok', text: `Maestro Central ${master.version} aplicado y conciliación recalculada.` });
    })();
    // Solo una vez tras la carga inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Datos publicados en datos/ más recientes que los de este dispositivo
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const response = await fetch('./datos/manifest.json', { cache: 'no-store' });
        if (!response.ok) return;
        const manifest = await response.json();
        const stored = await loadPreloadVersion();
        const hasData = inputsRef.current.files.length > 0;
        setPublished({ version: manifest.version, stored: stored ?? '', differs: hasData && manifest.version !== stored });
      } catch {
        /* sin red */
      }
    })();
  }, [hydrated]);

  // ------------------------------------------------------------------------------------------
  // Importación con comprobación previa (uno o varios archivos en cola)

  const stageImport = useCallback((kind, parsed, queue = [], meta = {}) => {
    const current = inputsRef.current;
    setPendingImport({
      kind,
      parsed,
      metadata: parsed.file,
      previous: kind === 'example' ? [] : current[kind],
      incoming: kind === 'example' ? [] : parsed.rows,
      sameFile:
        current.files.some((file) => file.kind === kind && file.hash === parsed.file.hash) &&
        (() => {
          const diff = diffRows(kind === 'example' ? [] : current[kind], kind === 'example' ? [] : parsed.rows);
          return diff.added === 0 && diff.removed === 0;
        })(),
      queue,
      ...meta,
    });
  }, []);

  const importFile = useCallback(
    async (kind, file) => {
      setBusyKind(kind);
      setNotice(null);
      try {
        stageImport(kind, await PARSERS[kind](file));
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No fue posible leer el archivo.' });
      } finally {
        setBusyKind(null);
      }
    },
    [stageImport],
  );

  const confirmImport = useCallback(async () => {
    if (!pendingImport) return;
    const { kind, parsed, metadata, previous, incoming, queue, manifestVersion } = pendingImport;
    const current = inputsRef.current;
    const next = { ...current, files: [...current.files.filter((file) => file.kind !== kind), metadata] };
    if (kind !== 'example') next[kind] = parsed.rows;
    const diff = diffRows(previous, incoming);
    const previousPending = new Set((analysisRef.current?.findings ?? []).filter(isBlockingPending).map(pendingKey));
    const nextAnalysis = await commitInputs(next);
    const nextPending = new Set((nextAnalysis?.findings ?? []).filter(isBlockingPending).map(pendingKey));
    const resolved = [...previousPending].filter((key) => !nextPending.has(key)).length;
    const added = [...nextPending].filter((key) => !previousPending.has(key)).length;
    const summary =
      `${metadata.name}: ${metadata.rows} filas reconocidas; ${diff.added} agregadas/modificadas, ${diff.removed} retiradas/modificadas, ` +
      `${diff.unchanged} sin cambios; ${metadata.skippedRows ?? 0} no utilizables. ` +
      (nextAnalysis
        ? `Conciliación actualizada: ${nextAnalysis.findings.filter(isBlockingPending).length} pendientes bloqueantes. ${resolved} casos dejan de ser pendientes (por conciliación o retiro de registros); ${added} pendientes nuevos.`
        : 'Faltan archivos para conciliar.');
    await db.values.put({ key: 'last-update', value: summary, updatedAt: new Date().toISOString() });
    setLastUpdate(summary);
    await audit('ACTUALIZACION_CONFIRMADA', summary);
    if (kind === 'master' && metadata.source !== 'REMOTE') {
      await saveMasterSource('FILE');
      setMasterSource('FILE');
      await audit('FUENTE_MAESTRO', `Se usará el Maestro importado ${metadata.name} en lugar del Maestro Central.`);
    }
    if (queue.length) {
      const [nextItem, ...rest] = queue;
      stageImport(nextItem.kind, nextItem.parsed, rest, { manifestVersion, queueLabel: nextItem.queueLabel });
    } else {
      setPendingImport(null);
      if (manifestVersion) {
        await savePreloadVersion(manifestVersion);
        setPublished((value) => (value ? { ...value, stored: manifestVersion, differs: false } : value));
      }
    }
    setNotice({ kind: 'ok', text: summary });
  }, [audit, commitInputs, pendingImport, stageImport]);

  const cancelImport = useCallback(() => setPendingImport(null), []);

  /** Carga los Excel publicados en datos/ (Nómina y Prefactura; Maestro solo si la fuente es archivo). */
  const loadPublished = useCallback(async () => {
    setBusyKind('published');
    setNotice(null);
    try {
      const response = await fetch('./datos/manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se encontró datos/manifest.json.');
      const manifest = await response.json();
      const kinds = ['payroll', 'prefactura', ...(masterSource === 'FILE' ? ['master'] : [])];
      const entries = manifest.files.filter((entry) => kinds.includes(entry.kind));
      const parsedList = [];
      for (const [index, entry] of entries.entries()) {
        const fileResponse = await fetch(`./datos/${entry.path}`, { cache: 'no-store' });
        if (!fileResponse.ok) throw new Error(`No fue posible descargar ${entry.name}.`);
        const blob = await fileResponse.blob();
        const parsed = await PARSERS[entry.kind](
          new File([blob], entry.name, { lastModified: Date.parse(manifest.generatedAt) || Date.now() }),
        );
        parsed.file.source = 'PRELOADED';
        parsedList.push({
          kind: entry.kind,
          parsed,
          queueLabel: `${KIND_LABELS[entry.kind]} · ${index + 1} de ${entries.length}`,
        });
      }
      if (!parsedList.length) throw new Error('El manifiesto no contiene archivos para actualizar.');
      const [first, ...rest] = parsedList;
      stageImport(first.kind, first.parsed, rest, { manifestVersion: manifest.version, queueLabel: first.queueLabel });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No fue posible cargar los datos publicados.' });
    } finally {
      setBusyKind(null);
    }
  }, [masterSource, stageImport]);

  const switchToRemoteMaster = useCallback(async () => {
    await saveMasterSource('REMOTE');
    setMasterSource('REMOTE');
    await audit('FUENTE_MAESTRO', 'Se vuelve a usar el Maestro Central de la App Maestra.');
    const master = remoteMaster ?? (await fetchRemoteMaster());
    if (!master) {
      setNotice({ kind: 'error', text: 'El Maestro Central no está disponible (sin red ni copia local).' });
      return;
    }
    await applyRemoteMaster(master, { force: true });
    setNotice({ kind: 'ok', text: `Maestro Central ${master.version} aplicado y conciliación recalculada.` });
  }, [applyRemoteMaster, audit, remoteMaster]);

  // ------------------------------------------------------------------------------------------
  // Conciliación, parámetros, respaldo

  const analyze = useCallback(async () => {
    if (!hasRequiredFiles(inputsRef.current)) return;
    setWorking(true);
    setNotice(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const result = runReconciliation(inputsRef.current, parametersRef.current);
      setAnalysis(result);
      await saveAnalysis(result);
      await audit(
        'CONCILIACION_EJECUTADA',
        `${result.findings.length} resultados; semanas ${result.coverage.startPeriod || result.coverage.startWeek}–${result.coverage.endPeriod || result.coverage.endWeek}.`,
      );
      setNotice({ kind: 'ok', text: 'Conciliación terminada y guardada en este dispositivo.' });
      return true;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Ocurrió un error durante la conciliación.' });
      return false;
    } finally {
      setWorking(false);
    }
  }, [audit]);

  const updateParameters = useCallback(
    async (next) => {
      await saveParameters(next);
      setParameters(next);
      setAnalysis(null);
      await audit('PARAMETROS_ACTUALIZADOS', JSON.stringify(next));
      setNotice({ kind: 'ok', text: 'Parámetros guardados. Ejecute nuevamente la conciliación.' });
    },
    [audit],
  );

  const saveReview = useCallback(async (workspace) => {
    setReviewWorkspace(workspace);
    await saveReviewWorkspace(workspace);
  }, []);

  const downloadBackup = useCallback(
    async (reason = 'manual') => {
      const data = await exportBackupData(APP_VERSION);
      downloadJson(data, `respaldo_conciliador_${today()}${reason === 'manual' ? '' : '_' + reason}.json`);
      if (reason === 'manual')
        await audit(
          'RESPALDO_DESCARGADO',
          `Respaldo de ${data.values.length} valores, ${data.audit.length} registros y ${data.closures.length} cierres.`,
        );
    },
    [audit],
  );

  const restoreBackup = useCallback(
    async (file) => {
      try {
        const data = validateBackup(JSON.parse(await file.text()));
        const ok = window.confirm(
          `¿Restaurar el respaldo del ${new Date(data.exportedAt).toLocaleString('es-NI')} (v${data.appVersion ?? '¿?'})?\n` +
            'Se descargará primero un respaldo del estado actual y luego se reemplazarán los datos de este dispositivo.',
        );
        if (!ok) return;
        await downloadBackup('antes_de_restaurar');
        await restoreBackupData(data, APP_VERSION);
        window.location.reload();
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo restaurar el respaldo.' });
      }
    },
    [downloadBackup],
  );

  const resetLocal = useCallback(async () => {
    if (
      !window.confirm(
        '¿Borrar archivos, resultados, cierres y auditoría guardados en este dispositivo?\nSe descargará antes un respaldo automático.',
      )
    ) {
      return false;
    }
    await downloadBackup('antes_de_limpiar');
    await clearLocalData();
    setInputs(EMPTY_INPUTS);
    setAnalysis(null);
    setReviewWorkspace(null);
    setParameters(DEFAULT_PARAMETERS);
    setMasterSource('REMOTE');
    setNotice({ kind: 'ok', text: 'Espacio local limpiado. Se descargó un respaldo previo.' });
    return true;
  }, [downloadBackup]);

  const quality = useMemo(() => (inputs.files.length ? assessDataQuality(inputs, parameters) : []), [inputs, parameters]);

  return {
    hydrated,
    inputs,
    analysis,
    parameters,
    reviewWorkspace,
    lastUpdate,
    notice,
    setNotice,
    busyKind,
    working,
    pendingImport,
    masterSource,
    remoteMaster,
    published,
    quality,
    ready: hasRequiredFiles(inputs),
    multiYear: !!analysis?.coverage?.multiYear,
    masterIsRemote: isRemoteMasterFile(inputs.files.find((file) => file.kind === 'master')),
    audit,
    importFile,
    confirmImport,
    cancelImport,
    loadPublished,
    switchToRemoteMaster,
    analyze,
    updateParameters,
    saveReview,
    downloadBackup,
    restoreBackup,
    resetLocal,
  };
}
