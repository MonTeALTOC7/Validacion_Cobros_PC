import { useState, useEffect } from 'react';
import { DEFAULT_PARAMETERS } from '../engine/constants';

export function ParametersPanel({ parameters: a, setParameters: s, onSave: t }) {
  const [n, i] = useState(a);
  useEffect(() => i(a), [a]);
  const r = (l, o, x) => (
    <label className="field">
      <span>
        {o}
        <small>{x}</small>
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={String(n[l])}
        onChange={(m) =>
          i({
            ...n,
            [l]: Number(m.target.value),
          })
        }
      />
    </label>
  );
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>Reglas editables</h2>
          <p>Los cambios quedan guardados en este dispositivo y exigen volver a ejecutar la conciliación.</p>
        </div>
      </div>
      <div className="settings-group">
        <h3>Período y alcance</h3>
        <label className="field">
          <span>
            Fecha inicial<small>Diciembre de 2025 podrá cargarse después.</small>
          </span>
          <input
            type="date"
            value={n.startDate}
            onChange={(l) =>
              i({
                ...n,
                startDate: l.target.value,
              })
            }
          />
        </label>
        <label className="field">
          <span>
            Alcance de tenencia<small>Productores es el universo principal de cobro.</small>
          </span>
          <select
            value={n.scope}
            onChange={(l) =>
              i({
                ...n,
                scope: l.target.value,
              })
            }
          >
            <option value="PRODUCERS">Productores</option>
            <option value="INTERNAL">CASUR interno</option>
            <option value="BOTH">Ambos universos</option>
          </select>
        </label>
      </div>
      <div className="settings-group">
        <h3>Ventana de siembra TPS</h3>
        {r('tpsWeeksBefore', 'Semanas anteriores', 'Recomendado: 2')}
        {r('tpsWeeksAfter', 'Semanas posteriores', 'Recomendado: 1')}
      </div>
      <div className="settings-group">
        <h3>Tolerancias por unidad</h3>
        {r('toleranceDH', 'D-H', 'Diferencia máxima aceptada')}
        {r('toleranceHA', 'HA', 'Diferencia máxima aceptada')}
        {r('toleranceMJO', 'MJO', 'Diferencia máxima aceptada')}
        {r('tolerancePAQ', 'PAQ', 'Diferencia máxima aceptada')}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={n.includeHistoricalInactive}
          onChange={(l) =>
            i({
              ...n,
              includeHistoricalInactive: l.target.checked,
            })
          }
        />
        <span />
        <div>
          <strong>Incluir suertes históricas dadas de baja</strong>
          <small>Sus cobros continúan siendo válidos aunque no aparezcan en el Maestro actual.</small>
        </div>
      </label>
      <div className="settings-actions">
        <button
          className="button ghost"
          onClick={() => {
            i(DEFAULT_PARAMETERS);
            s(DEFAULT_PARAMETERS);
          }}
        >
          Restaurar recomendados
        </button>
        <button className="button primary" onClick={() => t(n)}>
          Guardar parámetros
        </button>
      </div>
    </section>
  );
}
