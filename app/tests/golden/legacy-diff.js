// Diferencias funcionales entre el bundle legacy 8b3-1-1 y v0.8 sobre los mismos datos, y reglas que las justifican.
// compare-legacy.mjs falla si aparece una diferencia que no está en legacy-allowlist.json o si una diferencia
// permitida deja de aparecer. La lista solo se genera con diferencias que cumplen una de estas reglas documentadas.

/** Diferencias justificadas. Cada regla remite a docs/CAMBIOS_v0.8.md. */
export const LEGACY_RULES = [
  {
    id: 'S02_SEMANA_OPERATIVA',
    motivo:
      'La Nómina del 29–31 dic 2025 pertenece a la semana operativa 2026-S02 (columna Periodo); v0.7 la descartaba por fecha. CAMBIOS §2 #2.',
    applies: (d) =>
      d.tipo === 'cambio' &&
      d.clave.split('|')[1] === '2' &&
      ['COBRO_SIN_NOMINA', 'COBRO_EXCESO'].includes(d.antes.status) &&
      d.despues.status === 'CONCILIADO',
  },
  {
    id: 'ETAPA_TPS_INFORMATIVA',
    motivo: 'Etapas de siembra sin paquete TPS: antes se omitían sin aviso; ahora son informativas. CAMBIOS §2 #4.',
    applies: (d) => d.tipo === 'nuevo' && d.despues.status === 'ETAPA_TPS_SIN_PAQUETE',
  },
  {
    id: 'BANDERAS_INFORMATIVAS',
    motivo:
      'Banderas informativas nuevas de v0.8 (tarifa poco frecuente, repeticiones, lote no encontrado); no cambian el estado. CAMBIOS §2 #3, #7 y §7.',
    applies: (d) =>
      d.tipo === 'banderas' &&
      d.quitadas.length === 0 &&
      d.agregadas.every((flag) =>
        [
          'TARIFA_POCO_FRECUENTE',
          'MISMA_CANTIDAD_TARIFA_DISTINTA',
          'REPETICION_RESPALDADA',
          'DUPLICADO_POTENCIAL',
          'COBRO_EN_OTRA_PREFACTURA',
          'LOTE_NO_ENCONTRADO',
          'FECHA_FUERA_DE_SEMANA',
        ].includes(flag),
      ),
  },
];

const value = (f) => ({ status: f.status, payrollUnits: f.payrollUnits, billedUnits: f.billedUnits });

/** Agrupa por clave; las claves repetidas (p. ej. dos exclusiones idénticas) se numeran en orden estable. */
const keyed = (findings) => {
  const groups = new Map();
  findings.forEach((f) => groups.set(f.key, [...(groups.get(f.key) ?? []), f]));
  const out = new Map();
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    sorted.forEach((f, index) => out.set(sorted.length > 1 ? `${key}#${index + 1}` : key, f));
  }
  return out;
};

/** Diferencias entre hallazgos compactos legacy y v0.8 ({ key, status, payrollUnits, billedUnits, flags }). */
export const legacyDifferences = (legacyFindings, nextFindings) => {
  const before = keyed(legacyFindings);
  const after = keyed(nextFindings);
  const diffs = [];
  for (const [clave, a] of before) {
    const b = after.get(clave);
    if (!b) {
      diffs.push({ tipo: 'eliminado', clave, antes: value(a) });
      continue;
    }
    if (JSON.stringify(value(a)) !== JSON.stringify(value(b)))
      diffs.push({ tipo: 'cambio', clave, antes: value(a), despues: value(b) });
    const fa = new Set(a.flags ?? []);
    const fb = new Set(b.flags ?? []);
    const agregadas = [...fb].filter((flag) => !fa.has(flag)).sort();
    const quitadas = [...fa].filter((flag) => !fb.has(flag)).sort();
    if (agregadas.length || quitadas.length) diffs.push({ tipo: 'banderas', clave, agregadas, quitadas });
  }
  for (const [clave, b] of after) if (!before.has(clave)) diffs.push({ tipo: 'nuevo', clave, despues: value(b) });
  return diffs.sort((x, y) => (x.tipo + x.clave).localeCompare(y.tipo + y.clave));
};

const signature = (d) => JSON.stringify({ ...d, regla: undefined, motivo: undefined });

/** Asigna regla a cada diferencia; devuelve también las que ninguna regla justifica. */
export const justify = (diffs) => {
  const justified = [];
  const unjustified = [];
  for (const d of diffs) {
    const rule = LEGACY_RULES.find((r) => r.applies(d));
    if (rule) justified.push({ ...d, regla: rule.id });
    else unjustified.push(d);
  }
  return { justified, unjustified };
};

/** Compara diferencias reales con la lista permitida (exacta en ambos sentidos). */
export const checkAgainstAllowlist = (diffs, allowlist) => {
  const allowed = new Set(allowlist.diferencias.map(signature));
  const actual = new Set(diffs.map(signature));
  return {
    unexpected: diffs.filter((d) => !allowed.has(signature(d))),
    missing: allowlist.diferencias.filter((d) => !actual.has(signature(d))),
  };
};

export const buildAllowlist = (justified) => ({
  descripcion:
    'Diferencias funcionales permitidas entre el bundle legacy 8b3-1-1 y v0.8 con los datos de datos/. ' +
    'Generada por scripts/golden-update.mjs solo a partir de diferencias que cumplen una regla de tests/golden/legacy-diff.js.',
  reglas: Object.fromEntries(LEGACY_RULES.map((rule) => [rule.id, rule.motivo])),
  resumen: Object.fromEntries(LEGACY_RULES.map((rule) => [rule.id, justified.filter((d) => d.regla === rule.id).length])),
  diferencias: justified,
});
