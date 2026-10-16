import { useEffect, useState } from 'react';
import { DEFAULT_PARAMETERS } from '../engine/constants';
import { cleanCode, normalizeSuerte, normalizeText } from '../engine/normalize';

/** Normaliza "P.FACT|HACIENDA|SUERTE" igual que el motor (sin tildes, mayúsculas, suerte con 2 dígitos). */
const normalizeException = (line) => {
  const [pFact, hacienda, suerte] = line.split('|');
  return `${cleanCode(pFact)}|${normalizeText(hacienda)}|${normalizeSuerte(suerte)}`;
};

const EXCEPTION_PATTERN = /^[^|]+\|[^|]+\|[^|]+$/;

export function ParametersPanel({ parameters, onSave }) {
  const [draft, setDraft] = useState(parameters);
  const [exceptionsText, setExceptionsText] = useState((parameters.tpsConfirmedExceptions ?? []).join('\n'));
  useEffect(() => {
    setDraft(parameters);
    setExceptionsText((parameters.tpsConfirmedExceptions ?? []).join('\n'));
  }, [parameters]);

  const exceptionLines = exceptionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const invalidExceptions = exceptionLines.filter((line) => !EXCEPTION_PATTERN.test(line));

  const numberField = (name, label, help, step = '0.01') => (
    <label className="field">
      <span>
        {label}
        <small>{help}</small>
      </span>
      <input
        type="number"
        min="0"
        step={step}
        value={String(draft[name])}
        onChange={(event) => setDraft({ ...draft, [name]: Number(event.target.value) })}
      />
    </label>
  );

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>Reglas editables</h2>
          <p>
            Los cambios quedan guardados en este dispositivo, se registran en la auditoría y exigen volver a ejecutar la
            conciliación. Un cambio de parámetros invalida los cierres vigentes.
          </p>
        </div>
      </div>
      <div className="settings-group">
        <h3>Período y alcance</h3>
        <label className="field">
          <span>
            Fecha inicial
            <small>Se ajusta al inicio de su semana operativa SIAGRI para no partir semanas.</small>
          </span>
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
          />
        </label>
        <label className="field">
          <span>
            Alcance de tenencia<small>Productores es el universo principal de cobro.</small>
          </span>
          <select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}>
            <option value="PRODUCERS">Productores</option>
            <option value="INTERNAL">CASUR interno</option>
            <option value="BOTH">Ambos universos</option>
          </select>
        </label>
      </div>
      <div className="settings-group">
        <h3>Ventana de siembra TPS</h3>
        {numberField('tpsWeeksBefore', 'Semanas anteriores', 'Recomendado: 2', '1')}
        {numberField('tpsWeeksAfter', 'Semanas posteriores', 'Recomendado: 1', '1')}
      </div>
      <div className="settings-group">
        <h3>Tolerancias por unidad</h3>
        {numberField('toleranceDH', 'D-H', 'Diferencia máxima aceptada')}
        {numberField('toleranceHA', 'HA', 'Diferencia máxima aceptada')}
        {numberField('toleranceMJO', 'MJO', 'Diferencia máxima aceptada')}
        {numberField('tolerancePAQ', 'PAQ', 'Diferencia máxima aceptada')}
      </div>
      <div className="settings-group">
        <h3>Tarifas</h3>
        {numberField(
          'atypicalTariffPct',
          'Umbral de tarifa poco frecuente (%)',
          'Se marca la tarifa que aparece en menos de este porcentaje de las filas de su servicio y UM. Indicador para revisar.',
          '0.5',
        )}
      </div>
      <div className="settings-group">
        <h3>TPS confirmados por negocio</h3>
        <label className="field field-wide">
          <span>
            Excepciones (una por línea)
            <small>Formato P.FACT|HACIENDA|SUERTE. Se aceptan aunque la evidencia RYA de Nómina esté incompleta.</small>
          </span>
          <textarea rows={5} value={exceptionsText} onChange={(event) => setExceptionsText(event.target.value)} />
        </label>
        {invalidExceptions.length > 0 && <p role="alert">Formato inválido: {invalidExceptions.join(', ')}</p>}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={draft.includeHistoricalInactive}
          onChange={(event) => setDraft({ ...draft, includeHistoricalInactive: event.target.checked })}
        />
        <span />
        <div>
          <strong>Incluir suertes históricas dadas de baja</strong>
          <small>
            Activado: sus cobros se validan por hacienda aunque la suerte no esté en el Maestro actual. Desactivado: se marcan
            “Lote no encontrado” para revisión.
          </small>
        </div>
      </label>
      <div className="settings-actions">
        <button
          className="button ghost"
          onClick={() => {
            setDraft(DEFAULT_PARAMETERS);
            setExceptionsText(DEFAULT_PARAMETERS.tpsConfirmedExceptions.join('\n'));
          }}
        >
          Restaurar recomendados
        </button>
        <button
          className="button primary"
          disabled={invalidExceptions.length > 0}
          onClick={() => onSave({ ...draft, tpsConfirmedExceptions: exceptionLines.map(normalizeException) })}
        >
          Guardar parámetros
        </button>
      </div>
    </section>
  );
}
