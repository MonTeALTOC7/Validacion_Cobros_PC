import { useState } from 'react';
import { buildTrackingRows } from '../engine/tracking';

export function PublishTrackingPanel({ inputs, startDate }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const TOK = 'casur-gh-publish-token';
  const REPO = 'MonTeALTOC7/Negocios_de_Cana_CASUR_APP';
  const PATH = 'modules/labores/data/seguimiento.json';
  const [hasTok, setHasTok] = useState(() => !!localStorage.getItem(TOK));
  const cfg = () => {
    const v = prompt('Token de GitHub (permiso de contenidos sobre ' + REPO + '). Se guarda solo en este dispositivo.');
    if (v) {
      localStorage.setItem(TOK, v.trim());
      setHasTok(true);
      setMsg('Credencial guardada en este dispositivo.');
    }
  };
  const clr = () => {
    localStorage.removeItem(TOK);
    setHasTok(false);
    setMsg('Credencial eliminada de este dispositivo.');
  };
  const pub = async () => {
    const tok = localStorage.getItem(TOK);
    if (!tok) {
      setMsg('Configura primero la credencial de GitHub.');
      return;
    }
    setBusy(true);
    setMsg('Publicando…');
    try {
      const rows = buildTrackingRows(inputs, startDate).map((r) => ({
        id: r.id,
        source: r.source,
        date: r.date,
        week: r.week,
        year: r.year,
        producer: r.producer,
        hacienda: r.hacienda,
        suerte: r.suerte,
        labor: r.labor,
        service: r.service,
        name: r.name,
        unit: r.unit,
        units: r.units,
        classification: r.classification,
        scope: r.scope,
        ageDays: r.ageDays,
        ageBase: r.ageBase,
      }));
      const maxWeek = rows.reduce((m, r) => Math.max(m, r.week || 0), 0);
      const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        maxWeek,
        count: rows.length,
        rows,
      };
      const body = JSON.stringify(payload);
      const b64 = btoa(unescape(encodeURIComponent(body)));
      const api = 'https://api.github.com/repos/' + REPO + '/contents/' + PATH;
      let sha;
      try {
        const g = await fetch(api, {
          headers: {
            Authorization: 'Bearer ' + tok,
            Accept: 'application/vnd.github+json',
          },
        });
        if (g.ok) {
          const j = await g.json();
          sha = j.sha;
        }
      } catch (e) {}
      const put = await fetch(api, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + tok,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Publicar Seguimiento · semana ' + maxWeek,
          content: b64,
          ...(sha
            ? {
                sha,
              }
            : {}),
        }),
      });
      if (!put.ok) {
        const t = await put.text();
        throw new Error('GitHub ' + put.status + ': ' + t.slice(0, 200));
      }
      setMsg(
        'Seguimiento publicado ✓ Semana máxima: ' +
          maxWeek +
          ' · Actualizado: ' +
          new Date().toLocaleString('es-NI') +
          ' · ' +
          rows.length +
          ' registros',
      );
    } catch (e) {
      setMsg('Error al publicar: ' + ((e && e.message) || e));
    }
    setBusy(false);
  };
  return (
    <section
      className="panel"
      style={{
        marginTop: 16,
      }}
    >
      <h3>Publicar Seguimiento</h3>
      <p>Genera el dataset público sanitizado (sin tarifas, montos ni P.FACT) y lo publica para todos los dispositivos.</p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button className="button secondary" onClick={cfg}>
          {hasTok ? 'Cambiar credencial' : 'Configurar credencial GitHub'}
        </button>
        {hasTok && (
          <button className="button secondary" onClick={clr}>
            Borrar credencial
          </button>
        )}
        <button className="button primary" disabled={busy || !hasTok} onClick={pub}>
          {busy ? 'Publicando…' : 'Publicar Seguimiento'}
        </button>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}
