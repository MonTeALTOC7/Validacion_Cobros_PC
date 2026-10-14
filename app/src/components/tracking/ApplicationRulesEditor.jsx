import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { isValidRule } from '../../engine/applications';

export function ApplicationRulesEditor({ settings: a, choices: s, onSettings: t }) {
  const [n, i] = useState('base');
  const [r, l] = useState({
    ...a.base,
  });
  const o = (f) => {
    i(f);
    l({
      ...x(f),
    });
  };
  const x = (f) => (f === 'base' ? a.base : (a.overrides[f] ?? a.base));
  const m = [
    ['gapDays', 'Separación máxima sin registros', 'Una pausa mayor inicia otro grupo.'],
    ['maxDays', 'Ventana máxima del grupo', 'Evita unir trabajos durante meses.'],
    [
      'repeatDays',
      'Pausa tras completar el área',
      'Con el área alcanzada, inicia otro grupo tras estos días.',
    ],
    ['tolerancePct', 'Tolerancia de área (%)', 'Margen alrededor del área para clasificarla como completa.'],
  ];
  return (
    <details className="application-rules">
      <summary>
        <SlidersHorizontal size={16} />
        Ajustar cómo se estiman las aplicaciones
      </summary>
      <div className="application-body">
        <p>
          Estos son criterios de agrupación editables, no recomendaciones agronómicas. Cambiar una regla
          recalcula la estimación; no altera Nómina, cantidades ni cobros.
        </p>
        <label>
          Aplicar regla a
          <select value={n} onChange={(f) => o(f.target.value)}>
            <option value="base">Regla general</option>
            {s.map(([f, S]) => (
              <option key={f} value={f}>
                {S.labor}
                {' / '}
                {S.service}
                {a.overrides[f] ? ' · personalizada' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="application-tools">
          {m.map(([f, S, A]) => (
            <label key={f}>
              {S}
              <input
                type="number"
                min={f === 'tolerancePct' ? 0 : 1}
                max={f === 'tolerancePct' ? 20 : f === 'maxDays' ? 180 : 90}
                step={f === 'tolerancePct' ? 0.1 : 1}
                value={r[f]}
                onChange={(E) =>
                  l({
                    ...r,
                    [f]: Number(E.target.value),
                  })
                }
              />
              <small>{A}</small>
            </label>
          ))}
        </div>
        {!isValidRule(r) && (
          <p role="alert">
            Revise los valores: separación 1–90 días, ventana entre la separación y 180 días, pausa 1–ventana,
            tolerancia 0–20%.
          </p>
        )}
        <button
          className="button primary"
          disabled={!isValidRule(r)}
          onClick={() =>
            t(
              n === 'base'
                ? {
                    ...a,
                    base: r,
                  }
                : {
                    ...a,
                    overrides: {
                      ...a.overrides,
                      [n]: r,
                    },
                  },
            )
          }
        >
          Guardar y recalcular
        </button>
        {n !== 'base' && a.overrides[n] && (
          <button
            className="button secondary"
            onClick={() => {
              const f = {
                ...a.overrides,
              };
              delete f[n];
              t({
                ...a,
                overrides: f,
              });
            }}
          >
            Usar regla general
          </button>
        )}
        <small className="application-caption">
          Preferencias de este dispositivo. Las reglas por servicio prevalecen sobre la general.
        </small>
      </div>
    </details>
  );
}
