// Catálogos y parámetros del motor de conciliación.
// Las listas de servicios provienen del build v0.7 publicado (no existe especificación formal);
// cualquier cambio debe documentarse y validarse con datos reales antes de publicarse.

// eslint-disable-next-line no-undef
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
// eslint-disable-next-line no-undef
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

export const DEFAULT_PARAMETERS = {
  startDate: '2026-01-01',
  scope: 'PRODUCERS',
  tpsWeeksBefore: 2,
  tpsWeeksAfter: 1,
  toleranceDH: 0.01,
  toleranceHA: 0.01,
  toleranceMJO: 0.01,
  tolerancePAQ: 0.01,
  includeHistoricalInactive: true,
};

/** Servicios manuales que se concilian uno a uno: Nómina (base) contra Prefactura CS9999. */
export const DIRECT_SERVICES = new Set([
  '10005', '10007', '12001', '12005', '12007', '13001', '16013', '17009', '19014', '19020',
  '19035', '19036', '19071', '19073', '19074', '21018', '21022', '21039', '21076', '21079',
  '21080', '24001', '30017', '30038', '30059', '30062', '32019',
]);

/** Etapas de siembra que respaldan el paquete TPS (servicio SIE_INV en Prefactura). */
export const TPS_RYA_SERVICES = new Set(['19084', '19085']); // Regada, acomodada y tapada: cantidad principal
export const TPS_CUT_SERVICES = new Set(['19013']); // Corte de semilla: corrobora
export const TPS_UNLOAD_SERVICES = new Set(['19009', '19010', '32017']); // Descargue: corrobora
export const TPS_OTHER_STAGE_SERVICES = new Set(['19022', '19102']); // Otras etapas de siembra (no se comparan)
export const TPS_STAGE_SERVICES = new Set([
  ...TPS_RYA_SERVICES,
  ...TPS_CUT_SERVICES,
  ...TPS_UNLOAD_SERVICES,
  ...TPS_OTHER_STAGE_SERVICES,
]);
export const TPS_BILLED_SERVICE = 'SIE_INV';

/** Servicios mecanizados (Prefactura). No tienen base en Nómina. */
export const MECHANIZED_SERVICES = new Set([
  '102207SL', '102208SL', '102209SL', '102211SL', '102211SP', '102217SL', '102217SP', '122212SL',
  '122212SP', '187011SL', '187011SP', '187054SP', 'CF-100L', 'EBCM', 'EBLB', 'EBSL', 'PROPIO',
  'SECCIONADO', 'TAPADO',
]);

/** Contratista CASUR cuyas prefacturas se concilian contra Nómina. */
export const CASUR_CONTRACTOR = 'CS9999';

/**
 * TPS confirmados por negocio aunque la evidencia RYA de Nómina esté incompleta.
 * Formato: "P.FACT|HACIENDA|SUERTE" (heredado del build v0.7).
 */
export const TPS_CONFIRMED_EXCEPTIONS = new Set([
  '16255|SALVADOR MARENCO CASTILLO|02',
  '16254|JOSE ANDRES PEREZ ALEMAN|10',
  '16257|CARLOS SIEZAR MORALES|02',
  '16381|PANSACO|25',
]);

export const STATUS_LABELS = {
  CONCILIADO: 'Conciliado',
  NOMINA_SIN_COBRO: 'Nómina sin cobro',
  PREFACTURA_SIN_NUMERO: 'Falta número P.FACT',
  COBRO_PARCIAL: 'Cobro parcial',
  COBRO_EXCESO: 'Cobrado · exceso',
  COBRO_SIN_NOMINA: 'Cobro sin Nómina',
  REPETICION_RESPALDADA: 'Repetición respaldada',
  DUPLICADO_POTENCIAL: 'Duplicado potencial',
  PAQUETE_TPS_VALIDADO_RYA: 'TPS validado por RYA',
  PAQUETE_TPS_VALIDADO_RYA_CORROBORADO: 'TPS validado y corroborado',
  PAQUETE_TPS_VALIDADO_UNA_ETAPA_CON_ADVERTENCIA: 'TPS validado con advertencia',
  PAQUETE_TPS_DESFASADO: 'TPS con desfase semanal',
  PAQUETE_TPS_REQUIERE_REVISION: 'TPS cobrado · revisar cantidad',
  TPS_COBRADO_CON_DIFERENCIA_NOMINA: 'TPS cobrado con diferencia en Nómina',
  TPS_EXTERNO_VALIDO: 'TPS externo válido',
  SERVICIO_SIN_CLASIFICAR: 'Servicio sin clasificar',
  LOTE_NO_ENCONTRADO: 'Lote no encontrado',
  SUERTE_HISTORICA_DADA_DE_BAJA: 'Suerte histórica dada de baja',
  EXCLUIDO_AAM: 'AAM excluida',
  SEPARADO_CS2661: 'CS2661 separado',
  EXCEPCION_CAP_VALIDADA: 'CAP/Vuelos Verdes',
  FUERA_DE_ALCANCE: 'Fuera de alcance',
};
