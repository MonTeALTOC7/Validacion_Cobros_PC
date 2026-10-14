// Etiquetas de presentación compartidas.
import { parsePeriodKey } from '../engine/periods';
import { formatNumber } from './format';

/** "2026-S35" → "S35" (o "2026 · S35" si hay varios años). Acepta claves v0.7 ("S35"). */
export const periodText = (period, multiYear = false) => {
  const parsed = parsePeriodKey(period);
  if (!parsed) return String(period ?? '');
  return multiYear ? `${parsed.year} · S${parsed.week}` : `S${parsed.week}`;
};

/** Semana larga para títulos: "Semana 35" o "Semana 35 · 2026". */
export const periodLongText = (period, multiYear = false) => {
  const parsed = parsePeriodKey(period);
  if (!parsed) return `Semana ${String(period ?? '').replace(/^S/, '')}`;
  return multiYear ? `Semana ${parsed.week} · ${parsed.year}` : `Semana ${parsed.week}`;
};

/** Tarifas cobradas de un hallazgo: "381,73" o "368,21 / 724,85"; "—" si no hay cobro. */
export const tariffText = (finding) => {
  const tariffs = finding.tariffs ?? (finding.billedUnits > 0 && finding.tariff ? [finding.tariff] : []);
  return tariffs.length ? tariffs.map((tariff) => formatNumber(tariff)).join(' / ') : '—';
};

export const percentText = (value, decimals = 1) => `${formatNumber(value, decimals)} %`;
