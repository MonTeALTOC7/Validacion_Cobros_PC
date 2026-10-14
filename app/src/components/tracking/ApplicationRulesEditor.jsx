import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { isValidRule } from '../../engine/applications';
export function ApplicationRulesEditor({ settings, choices, onSettings }) {
  const [target, setTarget] = useState('base');
  const [draft, setDraft] = useState({
    ...settings.base,
  });
  const selectTarget = (f) => {
    setTarget(f);
    setDraft({
      ...ruleFor(f),
    });
  };
  const ruleFor = (f) => (f === 'base' ? settings.base : (settings.overrides[f] ?? settings.base));
  const fields = [
    ['gapDays', 'Separación máxima sin registros', 'Una pausa mayor inicia otro grupo.'],
    ['maxDays', 'Ventana máxima del grupo', 'Evita unir trabajos durante meses.'],
    ['repeatDays', 'Pausa tras completar el área', 'Con el área alcanzada, inicia otro grupo tras estos días.'],
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
          Estos son criterios de agrupación editables, no recomendaciones agronómicas. Cambiar una regla recalcula la estimación;
          no altera Nómina, cantidades ni cobros.
        </p>
        <label>
          Aplicar regla a
          <select value={target} onChange={(f) => selectTarget(f.target.value)}>
            <option value="base">Regla general</option>
            {choices.map(([f, S]) => (
              <option key={f} value={f}>
                {S.labor}
                {' / '}
                {S.service}
                {settings.overrides[f] ? ' · personalizada' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="application-tools">
          {fields.map(([f, S, A]) => (
            <label key={f}>
              {S}
              <input
                type="number"
                min={f === 'tolerancePct' ? 0 : 1}
                max={f === 'tolerancePct' ? 20 : f === 'maxDays' ? 180 : 90}
                step={f === 'tolerancePct' ? 0.1 : 1}
                value={draft[f]}
                onChange={(E) =>
                  setDraft({
                    ...draft,
                    [f]: Number(E.target.value),
                  })
                }
              />
              <small>{A}</small>
            </label>
          ))}
        </div>
        {!isValidRule(draft) && (
          <p role="alert">
            Revise los valores: separación 1–90 días, ventana entre la separación y 180 días, pausa 1–ventana, tolerancia 0–20%.
          </p>
        )}
        <button
          className="button primary"
          disabled={!isValidRule(draft)}
          onClick={() =>
            onSettings(
              target === 'base'
                ? {
                    ...settings,
                    base: draft,
                  }
                : {
                    ...settings,
                    overrides: {
                      ...settings.overrides,
                      [target]: draft,
                    },
                  },
            )
          }
        >
          Guardar y recalcular
        </button>
        {target !== 'base' && settings.overrides[target] && (
          <button
            className="button secondary"
            onClick={() => {
              const f = {
                ...settings.overrides,
              };
              delete f[target];
              onSettings({
                ...settings,
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
