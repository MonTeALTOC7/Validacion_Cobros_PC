import { useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { ApplicationRulesEditor } from './ApplicationRulesEditor';
import { APPLICATION_STATUS_LABELS, clipEpisodesToRows, ruleKey } from '../../engine/applications';
import { normalizeText } from '../../engine/normalize';
import { laborDisplayName, sumUnits } from '../../engine/tracking';
import { downloadBlob, formatNumber } from '../../lib/format';
export function ApplicationsView({ episodes, rows, settings, onSettings, onOpen }) {
  const [ruleFilter, setRuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedSeries, setSelectedSeries] = useState('');
  const ruleChoices = [...new Map(rows.map((j) => [ruleKey(j), j])).entries()].sort(
    ([, j], [, w]) => j.labor.localeCompare(w.labor) || j.service.localeCompare(w.service),
  );
  const ruleRows = rows.filter((j) => ruleFilter === 'all' || ruleKey(j) === ruleFilter);
  const visibleEpisodes = clipEpisodesToRows(episodes, ruleRows).filter(
    (j) =>
      !search ||
      normalizeText(j.rows[0].producer + ' ' + j.rows[0].hacienda + ' ' + j.rows[0].suerte).includes(normalizeText(search)),
  );
  const matchesStatus = (j, w) =>
    w === 'all' || (w === 'unknown' ? ['SIN_AREA', 'NO_HA', 'REVISAR'].includes(j.status) : j.status === w);
  const seriesKey = (j) =>
    JSON.stringify([j.rows[0].hacienda, j.rows[0].suerte, j.rows[0].labor, j.rows[0].service, j.rows[0].unit, j.rows[0].source]);
  const filteredEpisodes = visibleEpisodes
    .filter((j) => matchesStatus(j, statusFilter) && (!selectedSeries || seriesKey(j) === selectedSeries))
    .sort((j, w) => (selectedSeries ? j.sequence - w.sequence : w.start.localeCompare(j.start)));
  const seriesMap = new Map();
  filteredEpisodes.forEach((j) => {
    const w = seriesKey(j);
    seriesMap.set(w, [...(seriesMap.get(w) ?? []), j]);
  });
  const seriesList = [...seriesMap].sort(
    ([, j], [, w]) =>
      j[0].rows[0].hacienda.localeCompare(w[0].rows[0].hacienda) || j[0].rows[0].suerte.localeCompare(w[0].rows[0].suerte),
  );
  const seriesPages = Math.max(1, Math.ceil(seriesList.length / 12));
  const currentSeriesPage = Math.min(page, seriesPages);
  const episodePages = Math.max(1, Math.ceil(filteredEpisodes.length / 12));
  const currentEpisodePage = Math.min(page, episodePages);
  const countByStatus = (j) => visibleEpisodes.filter((w) => matchesStatus(w, j)).length;
  const exportCsv = () => {
    const j = (z) =>
      '"' +
      String(z ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const w = [
      [
        'Productor',
        'Hacienda',
        'Suerte',
        'Labor',
        'Servicio',
        'Grupo estimado',
        'Desde',
        'Hasta',
        'Área referencia HA',
        'Cantidad grupo completo',
        'Unidad',
        'Equivalentes de área (no aplicaciones)',
        'Estado',
        'Cantidad dentro del filtro',
        'Grupo cortado por filtro',
        'Días separación',
        'Ventana máxima días',
        'Días tras área completa',
        'Tolerancia %',
        'Observaciones',
      ],
      ...filteredEpisodes.map((z) => {
        const B = z.rows[0];
        return [
          B.producer,
          B.hacienda,
          B.suerte,
          B.labor,
          B.service,
          z.sequence,
          z.start,
          z.end,
          z.area ?? '',
          z.quantity,
          B.unit,
          z.equivalent ?? '',
          APPLICATION_STATUS_LABELS[z.status],
          sumUnits(z.visible),
          z.clipped ? 'Sí' : 'No',
          z.rule.gapDays,
          z.rule.maxDays,
          z.rule.repeatDays,
          z.rule.tolerancePct,
          z.notes.join(' '),
        ];
      }),
    ];
    downloadBlob(
      new Blob(
        [
          '\uFEFF' +
            w.map((z) => z.map(j).join(';')).join(`\r
`),
        ],
        {
          type: 'text/csv;charset=utf-8;',
        },
      ),
      'Aplicaciones_estimadas_CASUR.csv',
    );
  };
  return (
    <section className="application-panel">
      <div className="exec-section-label">
        <div>
          <h3>Aplicaciones y avance por suerte</h3>
          <p>Conteo estimado por labor y servicio. Abra un grupo para comprobar las fechas y cantidades.</p>
        </div>
        <button className="button secondary" onClick={exportCsv}>
          <Download size={16} />
          Exportar
        </button>
      </div>
      <div className="application-tools">
        <label>
          Labor / servicio
          <select
            value={ruleFilter}
            onChange={(j) => {
              setRuleFilter(j.target.value);
              setStatusFilter('all');
              setSelectedSeries('');
              setPage(1);
            }}
          >
            <option value="all">Todas las labores</option>
            {ruleChoices.map(([j, w]) => (
              <option key={j} value={j}>
                {w.labor}
                {' · '}
                {w.service}
                {' · '}
                {laborDisplayName(w)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar productor o suerte
          <input
            value={search}
            onChange={(j) => {
              setSearch(j.target.value);
              setSelectedSeries('');
              setPage(1);
            }}
            placeholder="Nombre, hacienda o suerte…"
          />
        </label>
      </div>
      <div className="application-kpis">
        {[
          ['all', 'Grupos con trabajo', 'blue'],
          ['COMPLETA', 'Área completa estimada', 'green'],
          ['PARCIAL', 'Área parcial', 'amber'],
          ['SOBREAREA', 'Superan el área', 'blue'],
          ['unknown', 'Sin evaluación de área', 'neutral'],
        ].map(([j, w, z]) => (
          <button
            key={j}
            className={'application-kpi ' + z}
            aria-pressed={statusFilter === j}
            onClick={() => {
              setStatusFilter(j);
              setSelectedSeries('');
              setPage(1);
            }}
          >
            <strong>{countByStatus(j)}</strong>
            <span>{w}</span>
            <small>Ver detalle →</small>
          </button>
        ))}
      </div>
      <p className="application-caption">
        {new Set(visibleEpisodes.map((j) => j.rows[0].hacienda + '|' + j.rows[0].suerte)).size}
        {
          ' suertes · Los conteos son grupos, no hectáreas ni suertes únicas. “Área completa” compara cantidades; no confirma cobertura física.'
        }
      </p>
      {selectedSeries ? (
        <button
          className="exec-more"
          onClick={() => {
            setSelectedSeries('');
            setPage(1);
          }}
        >
          ← Volver a todas las suertes y labores
        </button>
      ) : (
        <section className="panel application-series">
          <div className="panel-head">
            <div>
              <h3>Número de aplicaciones por suerte</h3>
              <p>Una fila por suerte, labor, servicio y unidad. Seleccione para ver cada aplicación estimada.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Productor / suerte</th>
                  <th>Labor / servicio</th>
                  <th>Grupos</th>
                  <th>Completas estimadas</th>
                  <th>Parciales</th>
                  <th>Sin evaluar / revisar</th>
                </tr>
              </thead>
              <tbody>
                {seriesList.slice((currentSeriesPage - 1) * 12, currentSeriesPage * 12).map(([j, w]) => {
                  const z = w[0].rows[0];
                  return (
                    <tr
                      key={j}
                      tabIndex={0}
                      onClick={() => {
                        setSelectedSeries(j);
                        setPage(1);
                      }}
                      onKeyDown={(B) => {
                        (B.key === 'Enter' || B.key === ' ') && (B.preventDefault(), setSelectedSeries(j), setPage(1));
                      }}
                    >
                      <td>
                        <strong>
                          {z.hacienda}
                          {' · '}
                          {z.suerte}
                        </strong>
                        <small>{z.producer.replace(' · titular sin confirmar', '')}</small>
                      </td>
                      <td>
                        <strong>
                          {z.labor}
                          {' · '}
                          {z.service}
                        </strong>
                        <small>{z.unit}</small>
                      </td>
                      <td>{w.length}</td>
                      <td>{z.unit === 'HA' ? w.filter((B) => B.status === 'COMPLETA').length : 'No aplica'}</td>
                      <td>{z.unit === 'HA' ? w.filter((B) => B.status === 'PARCIAL').length : 'No aplica'}</td>
                      <td>
                        {w.filter((B) => !['COMPLETA', 'PARCIAL'].includes(B.status)).length}
                        {' →'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {seriesPages > 1 && (
            <div className="pagination">
              <button disabled={currentSeriesPage === 1} onClick={() => setPage(currentSeriesPage - 1)}>
                Anterior
              </button>
              <span>
                {currentSeriesPage}
                {' / '}
                {seriesPages}
                {' · '}
                {seriesList.length}
                {' series'}
              </span>
              <button disabled={currentSeriesPage === seriesPages} onClick={() => setPage(currentSeriesPage + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}
      {selectedSeries && (
        <div className="application-list">
          {filteredEpisodes.slice((currentEpisodePage - 1) * 12, currentEpisodePage * 12).map((j) => {
            const w = j.rows[0];
            return (
              <details key={j.id} className="application-lot">
                <summary>
                  <span>
                    <strong>
                      {w.hacienda}
                      {' · '}
                      {w.suerte}
                    </strong>
                    <small>
                      {w.producer.replace(' · titular sin confirmar', '')}
                      {' · '}
                      {w.labor}
                      {' / '}
                      {w.service}
                    </small>
                    <small>
                      {w.unit === 'HA' ? 'Aplicación estimada' : 'Jornada agrupada'}
                      {' #'}
                      {j.sequence}
                      {' · '}
                      {j.start}
                      {' → '}
                      {j.end}
                    </small>
                  </span>
                  <span className={'application-status ' + j.status}>
                    {APPLICATION_STATUS_LABELS[j.status]}
                    {j.clipped && <small>Contexto completo · filtro recortado</small>}
                  </span>
                  <span className="application-quantity">
                    <b>
                      {formatNumber(j.quantity)} {w.unit}
                    </b>
                    <small>
                      {j.area && w.unit === 'HA'
                        ? formatNumber((j.quantity / j.area) * 100, 1) + '% del área de referencia'
                        : 'Sin porcentaje de área'}
                      {' ▾'}
                    </small>
                  </span>
                </summary>
                <div className="application-body">
                  <div className="application-metrics">
                    <span>
                      Área de la suerte<b>{j.area ? formatNumber(j.area) + ' HA' : 'No disponible'}</b>
                    </span>
                    <span>
                      Equivalentes de área
                      <b>{j.equivalent === null ? 'No aplica' : formatNumber(j.equivalent, 2)}</b>
                    </span>
                    <span>
                      {j.equivalent !== null && j.equivalent > 1 ? 'Sobre el área' : 'Falta para el área'}
                      <b>{j.area && w.unit === 'HA' ? formatNumber(Math.abs(j.area - j.quantity)) + ' HA' : 'No aplica'}</b>
                    </span>
                    <span>
                      Grupo dentro de esta serie
                      <b>
                        #{j.sequence}
                        {' · '}
                        {w.labor}
                        {' / '}
                        {w.service}
                      </b>
                    </span>
                  </div>
                  {w.unit === 'HA' && j.area && (
                    <div
                      className="application-progress"
                      aria-label={'Área reportada ' + formatNumber((j.quantity / j.area) * 100, 1) + ' por ciento'}
                    >
                      <i
                        style={{
                          width: Math.max(0, Math.min(100, (j.quantity / j.area) * 100)) + '%',
                        }}
                      />
                    </div>
                  )}
                  {j.clipped && (
                    <p className="application-warning">
                      {'El filtro incluye '}
                      {formatNumber(sumUnits(j.visible))} {w.unit}
                      {' de este grupo. Su estado usa el grupo completo ('}
                      {formatNumber(j.quantity)} {w.unit}) para no confundir un recorte con una aplicación parcial.
                    </p>
                  )}
                  <ul>
                    {j.notes.map((z) => (
                      <li key={z}>{z}</li>
                    ))}
                  </ul>
                  <p className="application-caption">
                    {'Regla: separación > '}
                    {j.rule.gapDays}
                    {' días; ventana de '}
                    {j.rule.maxDays}
                    {' días; nueva aplicación estimada tras '}
                    {j.rule.repeatDays}
                    {' días si se alcanzó el área; tolerancia ±'}
                    {j.rule.tolerancePct}%.
                  </p>
                  <button className="button secondary" onClick={() => onOpen(j.rows)}>
                    {'Ver '}
                    {j.rows.length}
                    {' registros del grupo completo'}
                    <ChevronRight size={15} />
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      )}
      {!filteredEpisodes.length && (
        <p className="exec-empty">No hay grupos para esta selección. Cambie los filtros o seleccione “Grupos con trabajo”.</p>
      )}
      {selectedSeries && episodePages > 1 && (
        <div className="pagination">
          <button disabled={currentEpisodePage === 1} onClick={() => setPage(currentEpisodePage - 1)}>
            Anterior
          </button>
          <span>
            {currentEpisodePage}
            {' / '}
            {episodePages}
            {' · '}
            {filteredEpisodes.length}
            {' grupos'}
          </span>
          <button disabled={currentEpisodePage === episodePages} onClick={() => setPage(currentEpisodePage + 1)}>
            Siguiente
          </button>
        </div>
      )}
      <ApplicationRulesEditor key={JSON.stringify(settings)} settings={settings} choices={ruleChoices} onSettings={onSettings} />
    </section>
  );
}
