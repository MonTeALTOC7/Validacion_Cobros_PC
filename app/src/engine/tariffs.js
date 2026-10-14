// Tarifas cobradas en Prefactura.
//
// No existe en los reportes una tabla oficial de tarifas. Este módulo describe las tarifas observadas
// por servicio y UM (frecuencia, períodos en que aparecen) y marca como "poco frecuente" una tarifa que
// representa menos del umbral (por defecto 5 %) de las filas de ese servicio/UM. Es un indicador para
// revisar, no una afirmación de que la tarifa sea incorrecta.
import { comparePeriods, periodKey } from './periods';

export const DEFAULT_ATYPICAL_TARIFF_PCT = 5;

export const tariffKey = (row) => `${row.service}|${row.unit}`;
export const tariffValueKey = (tariff) => (Number.isFinite(tariff) ? tariff.toFixed(2) : '—');

/**
 * Perfil de tarifas por servicio/UM.
 * @returns Map<"servicio|UM", {service, unit, serviceName, rows, values: [{tariff, rows, units, amount, share, firstPeriod, lastPeriod, atypical}]}>
 */
export const buildTariffProfile = (prefactura, atypicalPct = DEFAULT_ATYPICAL_TARIFF_PCT) => {
  const profiles = new Map();
  for (const row of prefactura) {
    const key = tariffKey(row);
    let profile = profiles.get(key);
    if (!profile) {
      profile = {
        key,
        service: row.service,
        unit: row.unit,
        serviceName: row.serviceName,
        labor: row.labor,
        rows: 0,
        values: new Map(),
      };
      profiles.set(key, profile);
    }
    profile.rows += 1;
    const valueKey = tariffValueKey(row.tariff);
    let value = profile.values.get(valueKey);
    if (!value) {
      value = { tariff: row.tariff, rows: 0, units: 0, amount: 0, firstPeriod: null, lastPeriod: null };
      profile.values.set(valueKey, value);
    }
    value.rows += 1;
    value.units += row.units;
    value.amount += row.total;
    if (row.year != null) {
      const period = { year: row.year, week: row.week };
      if (!value.firstPeriod || comparePeriods(period, value.firstPeriod) < 0) value.firstPeriod = period;
      if (!value.lastPeriod || comparePeriods(period, value.lastPeriod) > 0) value.lastPeriod = period;
    }
  }
  for (const profile of profiles.values()) {
    const values = [...profile.values.values()].map((value) => {
      const share = (value.rows / profile.rows) * 100;
      return {
        ...value,
        share,
        atypical: profile.values.size > 1 && share < atypicalPct,
        firstPeriodKey: value.firstPeriod ? periodKey(value.firstPeriod.year, value.firstPeriod.week) : '',
        lastPeriodKey: value.lastPeriod ? periodKey(value.lastPeriod.year, value.lastPeriod.week) : '',
      };
    });
    values.sort((a, b) => b.rows - a.rows || a.tariff - b.tariff);
    profile.values = values;
    profile.mostFrequent = values[0]?.tariff ?? null;
    profile.atypicalRows = values.filter((value) => value.atypical).reduce((total, value) => total + value.rows, 0);
  }
  return profiles;
};

/** ¿La tarifa de esta fila es poco frecuente dentro de su servicio/UM? */
export const isAtypicalTariff = (profiles, row) =>
  !!profiles.get(tariffKey(row))?.values.find((value) => tariffValueKey(value.tariff) === tariffValueKey(row.tariff))?.atypical;

/** Tarifas distintas de un conjunto de filas, ordenadas. */
export const distinctTariffs = (rows) =>
  [...new Set(rows.map((row) => row.tariff).filter((tariff) => Number.isFinite(tariff)))].sort((a, b) => a - b);
