/* ============================================================
   app.js — Orquestador del shell "Negocios de Caña CASUR".
   Renderiza las vistas y coordina router, registro, gate,
   estado y Service Worker. Carga cada módulo en un <iframe>
   aislado (no ejecuta su Service Worker; solo el SW raíz).
   ============================================================ */

import * as router from './core/navigation/router.js';
import * as registry from './core/module-registry/registry.js';
import * as gate from './core/permissions/gate.js';
import * as status from './core/sync/status.js';
import { APP_VERSION, APP_CHANNEL, moduleVersion } from './core/versions/versions.js';
import { icon } from './shared/components/icons.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const app = $('#app');
const viewEl = $('#view');
const navEl = $('#nav');

/* ---------------- Header ---------------- */
function renderHeader() {
  $('#appVersion').textContent = 'v' + APP_VERSION;
  updateConn(status.isOnline());
}
function updateConn(online) {
  const c = $('#conn');
  c.classList.toggle('is-offline', !online);
  c.querySelector('.conn__label').textContent = online ? 'En línea' : 'Sin conexión';
  c.querySelector('.conn__ic').innerHTML = icon(online ? 'wifi' : 'wifiOff');
}
status.onConnectivityChange(updateConn);

/* ---------------- Bottom nav ---------------- */
function renderNav(active) {
  // El acceso al área privada NO aparece en la navegación normal:
  // se entra desde Centro Maestro, para que otros usuarios ni lo vean.
  const items = [
    { key: 'home', label: 'Inicio', icon: 'home', path: '/' },
    { key: 'centro-maestro', label: 'Centro Maestro', icon: 'master', path: '/centro-maestro' },
  ];
  navEl.innerHTML = '';
  items.forEach((it) => {
    const b = el(`<button class="nav__item ${active === it.key ? 'is-active' : ''}" type="button">
        ${icon(it.icon)}<span>${it.label}</span></button>`);
    b.addEventListener('click', () => router.go(it.path));
    navEl.appendChild(b);
  });
}

/* ---------------- Vista: HOME ---------------- */
function viewHome() {
  const mods = registry.homeModules();
  const view = el(`<div class="view">
    <header class="masthead">
      <div class="masthead__brandrow">
        <img class="masthead__logo" src="shared/assets/brand/casur-logo.png"
             alt="CASUR · Compañía Azucarera del Sur, S.A." width="220" height="84">
        <span class="emct" title="Estado Mayor · Central Tezoatega">
          <span class="emct__dot"></span>EM-CT</span>
      </div>
      <p class="masthead__eyebrow">CASUR · Compañía Azucarera del Sur, S.A.</p>
      <h1 class="masthead__title">Negocios de Caña CASUR</h1>
      <p class="masthead__desc">Todos los sistemas de campo en una sola app. Elige un módulo para comenzar.</p>
    </header>
    <div class="modules" id="mods"></div>
  </div>`);
  const grid = $('#mods', view);

  mods.forEach((m) => {
    const online = status.isOnline();
    let chip;
    if (m.usesSupabase) {
      chip = online
        ? `<span class="chip is-online"><span class="chip__dot"></span>Requiere conexión</span>`
        : `<span class="chip is-offline"><span class="chip__dot"></span>Sin conexión</span>`;
    } else {
      chip = `<span class="chip is-local"><span class="chip__dot"></span>Local · offline</span>`;
    }
    const card = el(`<button class="mod-card" type="button" style="--accent:${m.accent}">
        <span class="mod-card__tile">${icon(m.icon)}</span>
        <span class="mod-card__body">
          <span class="mod-card__name">${m.name}</span>
          <span class="mod-card__meta">
            <span>${m.desc}</span>
            ${chip}
            <span class="chip"><span class="chip__dot"></span>${m.version}</span>
          </span>
        </span>
        <span class="mod-card__go">${icon('chevron')}</span>
      </button>`);
    card.addEventListener('click', () => router.go('/modulo/' + m.moduleId));
    grid.appendChild(card);
  });

  swap(view);
  renderNav('home');
}

/* ---------------- Vista: MÓDULO (iframe) ---------------- */
function viewModule(id) {
  const m = registry.byId(id);
  if (!m) { router.home(); return; }

  // Guardas: privado requiere desbloqueo; desactivado no entra.
  if (m.privacy === 'private' && !gate.isUnlocked()) { router.go('/privado/' + id); return; }
  if (!m.enabled) { router.home(); return; }

  const host = el(`<div class="module-host view">
      <div class="module-host__bar">
        <button class="icon-btn" id="mBack" type="button" aria-label="Volver">${icon('back')}</button>
        <span class="module-host__title">${m.name}</span>
        <span class="module-host__spacer"></span>
        <button class="icon-btn" id="mReload" type="button" aria-label="Recargar módulo">${icon('refresh')}</button>
      </div>
      <iframe class="module-host__frame" id="mFrame"
              src="${m.route}"
              title="${m.name}"
              allow="camera; geolocation; clipboard-read; clipboard-write"
              referrerpolicy="no-referrer"></iframe>
    </div>`);

  // Ocultamos header/nav del shell mientras un módulo ocupa toda la pantalla.
  document.body.classList.add('in-module');
  viewEl.innerHTML = '';
  viewEl.appendChild(host);

  $('#mBack', host).addEventListener('click', () => router.home());
  $('#mReload', host).addEventListener('click', () => {
    const f = $('#mFrame', host); f.src = f.src;
  });
}

/* ---------------- Vista: CENTRO MAESTRO ---------------- */
async function viewCentroMaestro() {
  const mods = registry.all();
  const view = el(`<div class="view panel">
      <div class="panel__top">
        <div>
          <h1 class="panel__title">Centro Maestro</h1>
          <p class="panel__note">Administración de módulos, estado del sistema y datos.</p>
        </div>
        <button class="btn" id="centroLock" type="button">${icon('lock')} Bloquear</button>
      </div>

      <section class="card">
        <div class="card__head"><span class="card__title">Módulos</span>
          <span class="chip"><span class="chip__dot"></span>${mods.length} registrados</span></div>
        <div id="mrows"></div>
      </section>

      <section class="card">
        <div class="card__head"><span class="card__title">Estado</span></div>
        <div class="stat-grid" id="stats"></div>
      </section>

      <section class="card">
        <div class="card__head"><span class="card__title">Gestión de datos</span></div>
        <p class="panel__note">Cada módulo conserva su propia forma de importar y actualizar datos
        (principio: <strong>primero preservar, después centralizar</strong>). El Convertidor SIAGRI
        se administra desde aquí.</p>
        <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap">
          <button class="btn" id="openConv" type="button">${icon('siagri')} Administrador SIAGRI</button>
          <button class="btn" id="openPriv" type="button">${icon('lock')} Área privada</button>
        </div>
      </section>

      <section class="card" id="pinCard"></section>

      <section class="card">
        <div class="card__head"><span class="card__title">Versiones</span></div>
        <div class="stat-grid" id="vers"></div>
      </section>
    </div>`);

  // --- Filas de módulos con interruptor y visibilidad ---
  const rows = $('#mrows', view);
  mods.forEach((m) => {
    const row = el(`<div class="mrow" style="--accent:${m.accent}">
        <span class="mrow__tile">${icon(m.icon)}</span>
        <span class="mrow__body">
          <span class="mrow__name">${m.name}</span>
          <span class="mrow__meta">${m.privacy} · ${m.version} · ${m.requiresOnline ? 'requiere red' : 'offline'}${m.usesSupabase ? ' · Supabase' : ''}</span>
        </span>
        <label class="switch" title="Activar módulo">
          <input type="checkbox" ${m.enabled ? 'checked' : ''}>
          <span class="switch__track"></span><span class="switch__thumb"></span>
        </label>
      </div>`);
    $('input', row).addEventListener('change', (e) => {
      registry.setOverride(m.moduleId, { enabled: e.target.checked });
    });
    rows.appendChild(row);
  });

  // --- Estado ---
  const est = await status.storageEstimate();
  const caches = await status.listCaches();
  $('#stats', view).innerHTML = `
    <div class="stat"><div class="stat__label">App Maestra</div><div class="stat__value">v${APP_VERSION}</div></div>
    <div class="stat"><div class="stat__label">Canal</div><div class="stat__value">${APP_CHANNEL}</div></div>
    <div class="stat"><div class="stat__label">Conectividad</div><div class="stat__value">${status.isOnline() ? 'En línea' : 'Offline'}</div></div>
    <div class="stat"><div class="stat__label">Almacenamiento</div><div class="stat__value">${est ? est.usageMB + ' MB' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Cuota</div><div class="stat__value">${est ? est.quotaMB + ' MB' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Uso</div><div class="stat__value">${est ? est.pct + ' %' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Cachés</div><div class="stat__value">${caches.length}</div></div>
    <div class="stat"><div class="stat__label">Service Worker</div><div class="stat__value">${'serviceWorker' in navigator ? 'Activo' : 'N/D'}</div></div>`;

  // --- Versiones ---
  $('#vers', view).innerHTML = registry.all().map((m) =>
    `<div class="stat"><div class="stat__label">${m.name}</div><div class="stat__value">${m.version}</div></div>`
  ).join('');

  // --- Acciones ---
  $('#centroLock', view).addEventListener('click', () => { gate.centroLock(); router.home(); });
  $('#openConv', view).addEventListener('click', () => router.go('/modulo/convertidor'));
  $('#openPriv', view).addEventListener('click', () => router.go('/privado'));

  // Tarjeta de PIN: SOLO permite cambiarlo si el área privada ya está
  // desbloqueada en esta sesión. Si está bloqueada, ofrece desbloquear.
  (function renderPinCard() {
    const card = $('#pinCard', view);
    if (gate.isUnlocked()) {
      card.innerHTML = `
        <div class="card__head"><span class="card__title">Seguridad del área privada</span>
          <span class="chip is-ok"><span class="chip__dot"></span>Desbloqueada</span></div>
        <p class="panel__note">Cambia el PIN de desbloqueo. Es solo una barrera de interfaz para
        evitar accesos accidentales de otros usuarios; el repositorio es público y el PIN no cifra datos.</p>
        <div class="dialog__row" style="margin-top:12px">
          <div class="field" style="flex:1">
            <label for="newPin">Nuevo PIN</label>
            <input id="newPin" inputmode="numeric" autocomplete="off" placeholder="••••">
          </div>
          <button class="btn btn--primary" id="savePin" type="button" style="align-self:end">Guardar</button>
        </div>`;
      $('#savePin', card).addEventListener('click', () => {
        const v = $('#newPin', card).value.trim();
        if (v.length >= 3) { gate.setPin(v); $('#newPin', card).value = ''; toast('PIN actualizado'); }
        else toast('El PIN debe tener al menos 3 dígitos');
      });
    } else {
      card.innerHTML = `
        <div class="card__head"><span class="card__title">Seguridad del área privada</span>
          <span class="chip is-offline"><span class="chip__dot"></span>Bloqueada</span></div>
        <p class="panel__note">Para cambiar el PIN primero debes desbloquear el área privada.</p>
        <button class="btn" id="unlockForPin" type="button" style="margin-top:12px">${icon('lock')} Desbloquear área privada</button>`;
      $('#unlockForPin', card).addEventListener('click', () => router.go('/privado'));
    }
  })();

  swap(view);
  renderNav('centro-maestro');
}

/* ---------------- Vista: PRIVADO (gate) ---------------- */
function viewPrivado(pendingModuleId) {
  if (!gate.isUnlocked()) { renderGate(pendingModuleId); return; }

  const privateMods = registry.all().filter((m) => m.privacy === 'private');
  const view = el(`<div class="view panel">
      <div>
        <h1 class="panel__title">Área privada</h1>
        <p class="panel__note">Datos económicos de conciliación. Visible solo para el propietario.</p>
      </div>
      <section class="card"><div id="privRows"></div></section>
      <button class="btn btn--block" id="lockBtn" type="button">${icon('lock')} Bloquear área privada</button>
    </div>`);

  const rows = $('#privRows', view);
  privateMods.forEach((m) => {
    const row = el(`<div class="mrow" style="--accent:${m.accent}">
        <span class="mrow__tile">${icon(m.icon)}</span>
        <span class="mrow__body"><span class="mrow__name">${m.name}</span>
          <span class="mrow__meta">${m.desc} · ${m.version}</span></span>
        <span class="mod-card__go">${icon('chevron')}</span>
      </div>`);
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => router.go('/modulo/' + m.moduleId));
    rows.appendChild(row);
  });

  $('#lockBtn', view).addEventListener('click', () => { gate.lock(); router.home(); });

  swap(view);
  renderNav('centro-maestro');
}

function renderGate(pendingModuleId) {
  const view = el(`<div class="view panel"><div>
      <h1 class="panel__title">Área privada</h1>
      <p class="panel__note">Introduce el PIN para desbloquear.</p></div></div>`);
  swap(view);
  renderNav('centro-maestro');

  const overlay = el(`<div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="gTitle">
        <h2 class="dialog__title" id="gTitle">Desbloquear</h2>
        <p class="dialog__note">Este acceso es solo para el propietario (Carlos).</p>
        <div class="field">
          <label for="pin">PIN</label>
          <input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••">
        </div>
        <p class="dialog__err" id="gErr"></p>
        <div class="dialog__row">
          <button class="btn btn--block" id="gCancel" type="button">Cancelar</button>
          <button class="btn btn--primary btn--block" id="gOk" type="button">Entrar</button>
        </div>
      </div></div>`);
  document.body.appendChild(overlay);
  const input = $('#pin', overlay);
  input.focus();

  const close = () => overlay.remove();
  const attempt = () => {
    if (gate.unlock(input.value)) {
      close();
      renderNav('centro-maestro');
      if (pendingModuleId) router.go('/modulo/' + pendingModuleId);
      else viewPrivado();
    } else {
      $('#gErr', overlay).textContent = 'PIN incorrecto.';
      input.select();
    }
  };
  $('#gOk', overlay).addEventListener('click', attempt);
  $('#gCancel', overlay).addEventListener('click', () => { close(); router.home(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

/* ---------------- Utilidades de vista ---------------- */
function swap(view) {
  document.body.classList.remove('in-module');
  viewEl.innerHTML = '';
  viewEl.appendChild(view);
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(msg, action) {
  const old = $('#toast'); if (old) old.remove();
  const t = el(`<div class="toast" id="toast"><span>${msg}</span></div>`);
  if (action) {
    const b = el(`<button class="btn btn--primary" type="button">${action.label}</button>`);
    b.addEventListener('click', action.onClick);
    t.appendChild(b);
  }
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => t.remove(), 2600);
}

/* ---------------- Gate de Centro Maestro ---------------- */
function renderCentroGate() {
  const view = el(`<div class="view panel"><div>
      <h1 class="panel__title">Centro Maestro</h1>
      <p class="panel__note">Introduce la contraseña para acceder a la administración.</p></div></div>`);
  swap(view);
  renderNav('centro-maestro');

  const overlay = el(`<div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cTitle">
        <h2 class="dialog__title" id="cTitle">Acceso restringido</h2>
        <p class="dialog__note">El Centro Maestro es de uso administrativo.</p>
        <div class="field">
          <label for="cpass">Contraseña</label>
          <input id="cpass" type="password" inputmode="numeric" autocomplete="off" placeholder="••••••">
        </div>
        <p class="dialog__err" id="cErr"></p>
        <div class="dialog__row">
          <button class="btn btn--block" id="cCancel" type="button">Cancelar</button>
          <button class="btn btn--primary btn--block" id="cOk" type="button">Entrar</button>
        </div>
      </div></div>`);
  document.body.appendChild(overlay);
  const input = $('#cpass', overlay);
  input.focus();

  const close = () => overlay.remove();
  const attempt = () => {
    if (gate.centroUnlock(input.value)) { close(); viewCentroMaestro(); }
    else { $('#cErr', overlay).textContent = 'Contraseña incorrecta.'; input.select(); }
  };
  $('#cOk', overlay).addEventListener('click', attempt);
  $('#cCancel', overlay).addEventListener('click', () => { close(); router.home(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

/* ---------------- Router → vistas ---------------- */
function route(r) {
  switch (r.name) {
    case 'home': viewHome(); break;
    case 'modulo': viewModule(r.param); break;
    case 'centro-maestro':
      if (!gate.isCentroUnlocked()) renderCentroGate();
      else viewCentroMaestro();
      break;
    case 'privado': viewPrivado(r.param); break;
    default: viewHome();
  }
}

/* ---------------- Service Worker ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      // Aviso de nueva versión disponible (sin recargar de golpe).
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nueva versión disponible', {
              label: 'Actualizar',
              onClick: () => { nw.postMessage({ type: 'SKIP_WAITING' }); },
            });
          }
        });
      });
    }).catch((e) => console.warn('SW no registrado:', e));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return; refreshing = true; location.reload();
    });
  });
}

/* ---------------- Arranque ---------------- */
function boot() {
  renderHeader();
  router.onChange(route);
  registerSW();
  router.start();
}
boot();
