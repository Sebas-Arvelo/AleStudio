// app.js — AleStudio UI: state store, views (Biblioteca, Resumen, Ajustes), sheets and flows.
import {
  DURATION_BUCKETS,
  getDurationBucket,
  detectOrientation,
  ORIENTATION_LABELS,
  formatDuration,
  formatFileSize,
  newId,
} from './classify.js';
import {
  getAllVideos,
  getVideo,
  addVideo,
  updateVideo,
  deleteVideo,
  saveBlob,
  getBlob,
  deleteBlob,
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  requestPersistence,
  getStorageEstimate,
} from './db.js';
import { extractVideoMeta } from './media.js';

const APP_VERSION = '1.0.0';

const LS_KEYS = {
  groupBy: 'alestudio.groupBy',
  sort: 'alestudio.sort',
  filtersOpen: 'alestudio.filtersOpen',
};

const NO_TYPE = '__none__';
const ORIENTATION_ORDER = ['vertical', 'horizontal', 'square', 'unknown'];
const MANUAL_ORIENTATIONS = ['vertical', 'horizontal', 'square'];

const GROUPS = [
  { id: 'none', label: 'Todos' },
  { id: 'orientation', label: 'Orientación' },
  { id: 'duration', label: 'Duración' },
  { id: 'type', label: 'Tipo' },
];

const SORTS = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'oldest', label: 'Más antiguos' },
  { id: 'short', label: 'Duración: más cortos' },
  { id: 'long', label: 'Duración: más largos' },
  { id: 'title', label: 'Título (A–Z)' },
];

const TABS = [
  { id: 'library', label: 'Biblioteca', icon: 'grid' },
  { id: 'summary', label: 'Resumen', icon: 'chart' },
  { id: 'settings', label: 'Ajustes', icon: 'gear' },
];

const NEW_TYPE_COLORS = ['#5B8DEF', '#F2994A', '#EB5E9D', '#9B6BDF', '#2FB8A6', '#E2B33C', '#E0564B', '#4FA85B'];

const GENERIC_ERROR = 'Algo salió mal. Inténtalo de nuevo.';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function lsGet(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    /* private mode or storage disabled: the preference just is not remembered */
  }
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** DOM builder. Attributes are set with setAttribute; string children become text nodes (never HTML). */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

// Static, trusted SVG paths only (never user data).
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  share: '<path d="M12 15V3.5M8 7l4-4 4 4M6 11H5v9.5h14V11h-1"/>',
};

function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon icon--' + name;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function videosLabel(n) {
  return `${n} ${plural(n, 'video', 'videos')}`;
}

function normalizeText(value) {
  let text = String(value || '').toLowerCase();
  try {
    text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (_) {
    /* normalize unavailable */
  }
  return text;
}

function stripExtension(name) {
  const text = String(name || '');
  const i = text.lastIndexOf('.');
  return i > 0 ? text.slice(0, i) : text;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

function toHex6(color) {
  const c = String(color || '');
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 7).toLowerCase();
  if (/^#[0-9a-fA-F]{3,4}$/.test(c)) {
    return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
  }
  return '#8a8f98';
}

/** db.js throws plain Errors with Spanish messages; anything else gets a generic Spanish text. */
function errorMessage(err, fallback = GENERIC_ERROR) {
  if (err && err.constructor === Error && typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}

function isVideoFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type) return file.type.startsWith('video/');
  return /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(file.name || '');
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** iPhone Safari tab: its storage is NOT shared with the installed (home screen) app. */
function needsInstall() {
  return isIOS() && !isStandalone();
}

function isStandalone() {
  if (navigator.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  videos: [],
  settings: { contentTypes: [] },
  loadError: null,
  tab: 'library',
  groupBy: GROUPS.some((g) => g.id === lsGet(LS_KEYS.groupBy, 'none')) ? lsGet(LS_KEYS.groupBy, 'none') : 'none',
  sort: SORTS.some((s) => s.id === lsGet(LS_KEYS.sort, 'recent')) ? lsGet(LS_KEYS.sort, 'recent') : 'recent',
  filtersOpen: lsGet(LS_KEYS.filtersOpen, '0') === '1',
  search: '',
  filters: { orientation: new Set(), bucket: new Set(), type: new Set(), favorites: false },
  busy: false,
};

/** Persistent DOM references. */
const els = {};
/** Files picked in this session, so a copy can be stored later without re-picking. */
const sessionFiles = new Map();
/** Open sheets, bottom to top. */
const sheets = [];
/** Detail sheet context, or null. */
let detail = null;
let relinkTargetId = null;
/** Backup waiting in the "Respaldo listo" sheet, or null. */
let pendingBackup = null;
let confirmCancel = null;
let toastTimer = null;

function findVideo(id) {
  return state.videos.find((v) => v.id === id) || null;
}

function replaceLocal(record) {
  if (!record) return;
  const i = state.videos.findIndex((v) => v.id === record.id);
  if (i >= 0) state.videos[i] = record;
  else state.videos.unshift(record);
}

function typeMap() {
  return new Map(state.settings.contentTypes.map((t) => [t.id, t]));
}

/** Content-type id of a video, or '' when unassigned or pointing to a deleted type. */
function typeIdOf(video, map = typeMap()) {
  return map.has(video.contentType) ? video.contentType : '';
}

async function loadData() {
  const [settings, videos] = await Promise.all([getSettings(), getAllVideos()]);
  state.settings = settings;
  state.videos = videos;
}

async function patchVideo(id, patch) {
  const record = await updateVideo(id, patch);
  replaceLocal(record);
  renderView();
  return record;
}

async function refreshVideo(id) {
  const record = await getVideo(id);
  if (record) replaceLocal(record);
  return record;
}

// ---------------------------------------------------------------------------
// Feedback: toast, busy overlay, confirm dialog
// ---------------------------------------------------------------------------

function toast(message, kind = 'info') {
  if (!els.toast) return;
  clearTimeout(toastTimer);
  els.toast.className = 'toast toast--' + kind + ' is-visible';
  els.toast.textContent = message;
  toastTimer = setTimeout(
    () => {
      els.toast.classList.remove('is-visible');
    },
    kind === 'error' ? 5500 : 3500
  );
}

function showError(err, fallback) {
  console.error(err);
  toast(errorMessage(err, fallback), 'error');
}

function showBusy(text, fraction = null) {
  state.busy = true;
  els.busyText.textContent = text;
  if (fraction === null) {
    els.busyBar.hidden = true;
  } else {
    els.busyBar.hidden = false;
    els.busyFill.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  }
  els.busy.hidden = false;
}

function hideBusy() {
  state.busy = false;
  if (els.busy) els.busy.hidden = true;
}

function updateScrollLock() {
  const locked = sheets.length > 0 || confirmCancel !== null;
  document.documentElement.classList.toggle('is-locked', locked);
}

/**
 * Resolves true when confirmed, false when cancelled or dismissed.
 * onConfirm runs synchronously inside the confirm tap, for actions that iOS only
 * allows during a user gesture (opening a file picker).
 */
function confirmDialog({ title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false, onConfirm = null }) {
  if (confirmCancel) confirmCancel();
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost' }, cancelLabel);
    const okBtn = h('button', { type: 'button', class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary') }, confirmLabel);
    const backdrop = h('div', { class: 'dialog-backdrop' });
    const layer = h(
      'div',
      { class: 'dialog-layer' },
      backdrop,
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
        h('h2', { class: 'dialog__title' }, title),
        message ? h('p', { class: 'dialog__text' }, message) : null,
        h('div', { class: 'dialog__actions' }, cancelBtn, okBtn)
      )
    );
    const finish = (value) => {
      if (confirmCancel !== cancel) return;
      confirmCancel = null;
      layer.remove();
      updateScrollLock();
      try {
        if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
      resolve(value);
    };
    const cancel = () => finish(false);
    confirmCancel = cancel;
    cancelBtn.addEventListener('click', cancel);
    backdrop.addEventListener('click', cancel);
    okBtn.addEventListener('click', () => {
      finish(true);
      if (onConfirm) run(onConfirm);
    });
    els.overlayRoot.append(layer);
    updateScrollLock();
    try {
      cancelBtn.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  });
}

// ---------------------------------------------------------------------------
// Sheets (plain divs; no <dialog> dependency)
// ---------------------------------------------------------------------------

function openSheet({ title, body, footer = null, onClose = null }) {
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h(
      'div',
      { class: 'sheet__header' },
      h('h2', { class: 'sheet__title' }, title),
      h('button', { type: 'button', class: 'icon-btn', 'data-action': 'close-sheet', 'aria-label': 'Cerrar' }, icon('close'))
    ),
    h('div', { class: 'sheet__body' }, body),
    footer ? h('div', { class: 'sheet__footer' }, footer) : null
  );
  const layer = h(
    'div',
    { class: 'sheet-layer' },
    h('div', { class: 'sheet-backdrop', 'data-action': 'close-sheet' }),
    panel
  );
  const entry = { layer, onClose, previousFocus: document.activeElement };
  sheets.push(entry);
  els.sheetRoot.append(layer);
  updateScrollLock();
  try {
    panel.focus({ preventScroll: true });
  } catch (_) {
    /* ignore */
  }
  return entry;
}

function closeSheet(entry = sheets[sheets.length - 1]) {
  const i = sheets.indexOf(entry);
  if (i < 0) return;
  sheets.splice(i, 1);
  entry.layer.remove();
  updateScrollLock();
  if (entry.onClose) run(entry.onClose);
  try {
    if (entry.previousFocus && entry.previousFocus.isConnected) entry.previousFocus.focus({ preventScroll: true });
  } catch (_) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function buildShell() {
  const root = document.getElementById('app');

  els.headerTitle = h('h1', { class: 'app-header__title' }, 'Biblioteca');
  els.headerMeta = h('p', { class: 'app-header__meta' });
  const header = h(
    'header',
    { class: 'app-header' },
    h('div', { class: 'app-header__inner' }, h('div', null, h('p', { class: 'app-header__brand' }, 'AleStudio'), els.headerTitle), els.headerMeta)
  );

  els.banner = null;
  // Shown on every launch in a Safari tab (closing it only hides it until the next
  // launch): what is saved here does not carry over to the installed app.
  if (needsInstall()) {
    els.banner = h(
      'aside',
      { class: 'install-banner', 'aria-label': 'Instalar la app' },
      h(
        'p',
        { class: 'install-banner__text' },
        h('strong', null, 'Instala AleStudio antes de agregar videos. '),
        'Toca Compartir ',
        icon('share', 16),
        ' y luego “Agregar a inicio”. Lo que agregues aquí en Safari no aparece en la app instalada. ',
        'Si ya agregaste videos aquí, pásalos con Ajustes › Exportar respaldo y, en la app instalada, Importar respaldo. ',
        'La primera vez, abre la app instalada con internet; después funciona sin conexión.'
      ),
      h('button', { type: 'button', class: 'icon-btn', 'data-action': 'dismiss-banner', 'aria-label': 'Cerrar aviso' }, icon('close', 18))
    );
  }

  els.main = h('main', { class: 'app-main', id: 'view' });

  els.fab = h(
    'button',
    { type: 'button', class: 'fab', 'data-action': 'add-videos', 'aria-label': 'Agregar videos' },
    icon('plus', 28)
  );

  els.tabButtons = TABS.map((tab) =>
    h(
      'button',
      { type: 'button', class: 'tabbar__btn', 'data-action': 'tab', 'data-tab': tab.id },
      icon(tab.icon, 22),
      h('span', { class: 'tabbar__label' }, tab.label)
    )
  );
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Secciones' }, els.tabButtons);

  els.videoInput = h('input', {
    type: 'file',
    accept: 'video/*',
    multiple: true,
    tabindex: '-1',
    'aria-hidden': 'true',
    'data-change': 'files-picked',
  });
  els.relinkInput = h('input', {
    type: 'file',
    accept: 'video/*',
    tabindex: '-1',
    'aria-hidden': 'true',
    'data-change': 'relink-picked',
  });
  els.backupInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    tabindex: '-1',
    'aria-hidden': 'true',
    'data-change': 'backup-picked',
  });
  const inputs = h('div', { class: 'visually-hidden' }, els.videoInput, els.relinkInput, els.backupInput);

  els.sheetRoot = h('div', { class: 'sheet-root' });
  els.overlayRoot = h('div', { class: 'overlay-root' });

  els.busyText = h('p', { class: 'busy__text' });
  els.busyFill = h('div', { class: 'busy__fill' });
  els.busyBar = h('div', { class: 'busy__bar' }, els.busyFill);
  els.busy = h(
    'div',
    { class: 'busy', role: 'status', 'aria-live': 'polite', hidden: true },
    h('div', { class: 'busy__card' }, h('div', { class: 'busy__spinner', 'aria-hidden': 'true' }), els.busyText, els.busyBar)
  );

  els.toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });

  root.replaceChildren(
    h('div', { class: 'app' }, header, els.banner, els.main, els.fab, tabbar),
    inputs,
    els.sheetRoot,
    els.overlayRoot,
    els.busy,
    els.toast
  );
}

function renderView() {
  if (!els.main) return;
  const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
  els.headerTitle.textContent = tab.label;
  els.headerMeta.textContent = state.loadError ? '' : videosLabel(state.videos.length);
  for (const btn of els.tabButtons) {
    const active = btn.getAttribute('data-tab') === tab.id;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  els.fab.hidden = Boolean(state.loadError) || tab.id !== 'library' || state.videos.length === 0;
  els.results = null;
  els.resultBar = null;

  let view;
  if (state.loadError) view = buildLoadError();
  else if (tab.id === 'summary') view = buildSummary();
  else if (tab.id === 'settings') view = buildSettings();
  else view = buildLibrary();
  els.main.replaceChildren(view);
}

function buildLoadError() {
  return h(
    'div',
    { class: 'empty' },
    h('h2', { class: 'empty__title' }, 'No se pudieron cargar tus videos'),
    h('p', { class: 'empty__text' }, state.loadError),
    h('button', { type: 'button', class: 'btn btn--primary btn--lg', 'data-action': 'retry-load' }, 'Reintentar')
  );
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------

function activeFilterCount() {
  const f = state.filters;
  return f.orientation.size + f.bucket.size + f.type.size + (f.favorites ? 1 : 0) + (state.search.trim() ? 1 : 0);
}

function chipFilterCount() {
  const f = state.filters;
  return f.orientation.size + f.bucket.size + f.type.size + (f.favorites ? 1 : 0);
}

function clearFilters() {
  state.filters.orientation.clear();
  state.filters.bucket.clear();
  state.filters.type.clear();
  state.filters.favorites = false;
  state.search = '';
}

function filteredVideos() {
  const f = state.filters;
  const map = typeMap();
  const query = normalizeText(state.search.trim());
  return state.videos.filter((v) => {
    if (f.favorites && !v.favorite) return false;
    if (f.orientation.size && !f.orientation.has(v.orientation)) return false;
    if (f.bucket.size && !f.bucket.has(getDurationBucket(v.duration).id)) return false;
    if (f.type.size && !f.type.has(typeIdOf(v, map) || NO_TYPE)) return false;
    if (query) {
      const haystack = normalizeText(v.title + '\n' + v.notes + '\n' + v.fileName);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function compareDuration(a, b, direction) {
  const da = typeof a.duration === 'number' ? a.duration : null;
  const db = typeof b.duration === 'number' ? b.duration : null;
  if (da === null && db === null) return 0;
  if (da === null) return 1; // unknown durations always last
  if (db === null) return -1;
  return (da - db) * direction;
}

function sortVideos(list) {
  const out = list.slice();
  const byDate = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  switch (state.sort) {
    case 'oldest':
      out.sort(byDate);
      break;
    case 'short':
      out.sort((a, b) => compareDuration(a, b, 1));
      break;
    case 'long':
      out.sort((a, b) => compareDuration(a, b, -1));
      break;
    case 'title':
      out.sort((a, b) => String(a.title).localeCompare(String(b.title), 'es', { sensitivity: 'base', numeric: true }));
      break;
    default:
      out.sort((a, b) => byDate(b, a));
  }
  return out;
}

/** @returns {{key:string,label:string,color:string|null,items:object[]}[]} only non-empty groups, in fixed order */
function groupVideos(list) {
  if (state.groupBy === 'orientation') {
    return ORIENTATION_ORDER.map((key) => ({
      key,
      label: ORIENTATION_LABELS[key],
      color: null,
      items: list.filter((v) => v.orientation === key),
    })).filter((g) => g.items.length);
  }
  if (state.groupBy === 'duration') {
    return DURATION_BUCKETS.map((bucket) => ({
      key: bucket.id,
      label: bucket.label,
      color: null,
      items: list.filter((v) => getDurationBucket(v.duration).id === bucket.id),
    })).filter((g) => g.items.length);
  }
  if (state.groupBy === 'type') {
    const map = typeMap();
    const groups = state.settings.contentTypes.map((type) => ({
      key: type.id,
      label: type.label,
      color: type.color,
      items: list.filter((v) => typeIdOf(v, map) === type.id),
    }));
    groups.push({ key: NO_TYPE, label: 'Sin tipo', color: null, items: list.filter((v) => !typeIdOf(v, map)) });
    return groups.filter((g) => g.items.length);
  }
  return [{ key: 'all', label: '', color: null, items: list }];
}

function colorDot(color) {
  const dot = h('span', { class: 'dot', 'aria-hidden': 'true' });
  if (color) dot.style.setProperty('--dot-color', color);
  return dot;
}

function buildThumb(video, extraClass) {
  const orientation = ORIENTATION_ORDER.includes(video.orientation) ? video.orientation : 'unknown';
  const box = h('div', { class: `thumb thumb--${orientation} ${extraClass || ''}` });
  if (video.thumbnail) {
    box.append(h('img', { class: 'thumb__img', src: video.thumbnail, alt: '', loading: 'lazy', decoding: 'async' }));
  } else {
    box.append(h('div', { class: 'thumb__ph' }, icon('film', 22)));
  }
  return box;
}

function buildCard(video, map) {
  const type = map.get(video.contentType) || null;
  const orientationLabel = ORIENTATION_LABELS[video.orientation] || ORIENTATION_LABELS.unknown;

  const thumb = buildThumb(video, 'card__thumb');
  thumb.append(
    h('span', { class: 'badge badge--orientation' }, orientationLabel),
    h('span', { class: 'badge badge--duration' }, formatDuration(video.duration))
  );

  const typeChip = h('span', { class: 'type-chip' + (type ? '' : ' type-chip--none') }, type ? colorDot(type.color) : null, h('span', { class: 'type-chip__label' }, type ? type.label : 'Sin tipo'));

  const openBtn = h(
    'button',
    {
      type: 'button',
      class: 'card__open',
      'data-action': 'open-video',
      'data-id': video.id,
      'aria-label': `Abrir ${video.title || 'video'}. ${orientationLabel}, ${formatDuration(video.duration)}`,
    },
    thumb,
    h('span', { class: 'card__body' }, h('span', { class: 'card__title' }, video.title || 'Sin título'), typeChip)
  );

  const favBtn = h(
    'button',
    {
      type: 'button',
      class: 'card__fav' + (video.favorite ? ' is-on' : ''),
      'data-action': 'toggle-fav',
      'data-id': video.id,
      'aria-pressed': String(video.favorite === true),
      'aria-label': video.favorite ? 'Quitar de favoritos' : 'Marcar como favorito',
    },
    icon('star', 18)
  );

  return h('li', { class: 'card' }, openBtn, favBtn);
}

function buildChip({ label, on, kind, value, color = null, withStar = false }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'chip' + (on ? ' is-on' : ''),
      'data-action': 'filter',
      'data-kind': kind,
      'data-value': value,
      'aria-pressed': String(Boolean(on)),
    },
    color ? colorDot(color) : null,
    withStar ? icon('star', 14) : null,
    label
  );
}

function buildFilterPanel() {
  const f = state.filters;
  const hasUnknownOrientation = f.orientation.has('unknown') || state.videos.some((v) => v.orientation === 'unknown');
  const hasUnknownDuration = f.bucket.has('unknown') || state.videos.some((v) => getDurationBucket(v.duration).id === 'unknown');

  const group = (label, chips) =>
    h('div', { class: 'filter-group', role: 'group', 'aria-label': label }, h('p', { class: 'filter-group__label' }, label), h('div', { class: 'chip-row' }, chips));

  return h(
    'div',
    { class: 'filters', id: 'filters-panel' },
    group('Favoritos', [buildChip({ label: 'Solo favoritos', on: f.favorites, kind: 'favorites', value: '1', withStar: true })]),
    group(
      'Orientación',
      ORIENTATION_ORDER.filter((key) => key !== 'unknown' || hasUnknownOrientation).map((key) =>
        buildChip({ label: ORIENTATION_LABELS[key], on: f.orientation.has(key), kind: 'orientation', value: key })
      )
    ),
    group(
      'Duración',
      DURATION_BUCKETS.filter((b) => b.id !== 'unknown' || hasUnknownDuration).map((b) =>
        buildChip({ label: b.label, on: f.bucket.has(b.id), kind: 'bucket', value: b.id })
      )
    ),
    group('Tipo de contenido', [
      ...state.settings.contentTypes.map((t) => buildChip({ label: t.label, on: f.type.has(t.id), kind: 'type', value: t.id, color: t.color })),
      buildChip({ label: 'Sin tipo', on: f.type.has(NO_TYPE), kind: 'type', value: NO_TYPE }),
    ])
  );
}

function buildToolbar() {
  const search = h(
    'div',
    { class: 'search' },
    icon('search', 18),
    h('input', {
      class: 'search__input',
      type: 'search',
      value: state.search,
      placeholder: 'Buscar por título, notas o archivo',
      'aria-label': 'Buscar videos',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      'data-input': 'search',
    })
  );

  const segmented = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Agrupar por' },
    GROUPS.map((g) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented__btn' + (state.groupBy === g.id ? ' is-on' : ''),
          'data-action': 'group',
          'data-group': g.id,
          'aria-pressed': String(state.groupBy === g.id),
        },
        g.label
      )
    )
  );

  const chipCount = chipFilterCount();
  const filtersBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--soft btn--sm' + (state.filtersOpen ? ' is-on' : ''),
      'data-action': 'toggle-filters',
      'aria-expanded': String(state.filtersOpen),
      'aria-controls': 'filters-panel',
    },
    icon('filter', 18),
    'Filtros',
    chipCount ? h('span', { class: 'count-pill' }, chipCount) : null
  );

  const sortSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Ordenar por', 'data-change': 'sort' },
    SORTS.map((s) => h('option', { value: s.id, selected: s.id === state.sort }, s.label))
  );

  els.resultBar = h('div', { class: 'result-bar' });

  return h(
    'div',
    { class: 'toolbar' },
    search,
    h('div', { class: 'toolbar__block' }, h('p', { class: 'toolbar__label' }, 'Agrupar por'), segmented),
    h('div', { class: 'toolbar__row' }, filtersBtn, sortSelect),
    state.filtersOpen ? buildFilterPanel() : null,
    els.resultBar
  );
}

/** Empty library in an iPhone Safari tab: installing comes first. */
function buildInstallFirst() {
  return h(
    'div',
    { class: 'empty' },
    h('h2', { class: 'empty__title' }, 'Primero instala AleStudio'),
    h(
      'p',
      { class: 'empty__text' },
      'Así se abre como una app y tus videos quedan guardados ahí. Lo que agregues aquí en Safari no aparece en la app instalada.'
    ),
    h(
      'ol',
      { class: 'install-steps' },
      h('li', null, 'Toca Compartir ', icon('share', 16), ' en la barra de Safari.'),
      h('li', null, 'Elige “Agregar a inicio”.'),
      h('li', null, 'Abre AleStudio desde su ícono (la primera vez, con internet) y agrega ahí tus videos.')
    ),
    h('button', { type: 'button', class: 'btn btn--ghost', 'data-action': 'add-videos' }, 'Probar aquí sin instalar')
  );
}

function buildLibrary() {
  if (!state.videos.length && needsInstall()) return buildInstallFirst();
  if (!state.videos.length) {
    return h(
      'div',
      { class: 'empty' },
      h('h2', { class: 'empty__title' }, 'Tu biblioteca está lista'),
      h(
        'p',
        { class: 'empty__text' },
        'Agrega tus videos y AleStudio los ordena por orientación, duración y tipo de contenido. Todo se queda en tu iPhone.'
      ),
      h('button', { type: 'button', class: 'btn btn--hero btn--lg', 'data-action': 'add-videos' }, icon('plus', 22), 'Agregar mis primeros videos')
    );
  }
  const toolbar = buildToolbar();
  els.results = h('div', { class: 'results' });
  fillResults();
  return h('div', { class: 'library' }, toolbar, els.results);
}

/** Re-renders only the result list and its counter (keeps the search field focused while typing). */
function fillResults() {
  if (!els.results || !els.resultBar) return;
  const list = sortVideos(filteredVideos());
  const active = activeFilterCount();

  const summary =
    active > 0
      ? `${active} ${plural(active, 'filtro activo', 'filtros activos')} · ${list.length} de ${videosLabel(state.videos.length)}`
      : videosLabel(list.length);
  // replaceChildren() would print a null argument as text, so build the list first.
  const barItems = [h('p', { class: 'result-bar__text', 'aria-live': 'polite' }, summary)];
  if (active > 0) {
    barItems.push(h('button', { type: 'button', class: 'btn btn--text btn--sm', 'data-action': 'clear-filters' }, 'Limpiar'));
  }
  els.resultBar.replaceChildren(...barItems);

  if (!list.length) {
    els.results.replaceChildren(
      h(
        'div',
        { class: 'no-results' },
        h('p', null, 'Ningún video coincide con la búsqueda o los filtros.'),
        h('button', { type: 'button', class: 'btn btn--soft', 'data-action': 'clear-filters' }, 'Limpiar filtros')
      )
    );
    return;
  }

  const map = typeMap();
  const sections = groupVideos(list).map((group) =>
    h(
      'section',
      { class: 'group' },
      group.label
        ? h(
            'h2',
            { class: 'group__head' },
            group.color ? colorDot(group.color) : null,
            h('span', { class: 'group__label' }, group.label),
            h('span', { class: 'group__count', 'aria-label': videosLabel(group.items.length) }, group.items.length)
          )
        : null,
      h('ul', { class: 'grid' }, group.items.map((video) => buildCard(video, map)))
    )
  );
  els.results.replaceChildren(...sections);
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

function buildBarGroup(title, rows) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, title),
    h(
      'ul',
      { class: 'bars' },
      rows.map((row) => {
        const fill = h('span', { class: 'bar__fill' });
        fill.style.width = (row.count / max) * 100 + '%';
        if (row.color) fill.style.setProperty('--bar-color', row.color);
        return h(
          'li',
          null,
          h(
            'button',
            {
              type: 'button',
              class: 'bar',
              'data-action': 'summary-filter',
              'data-kind': row.kind,
              'data-value': row.value,
              disabled: row.count === 0,
              'aria-label': `${row.label}: ${videosLabel(row.count)}. Ver en la biblioteca`,
            },
            h('span', { class: 'bar__head' }, h('span', { class: 'bar__label' }, row.label), h('span', { class: 'bar__count' }, row.count)),
            h('span', { class: 'bar__track' }, fill)
          )
        );
      })
    )
  );
}

function buildSummary() {
  const videos = state.videos;
  if (!videos.length) {
    return h(
      'div',
      { class: 'empty' },
      h('h2', { class: 'empty__title' }, 'Aún no hay nada que resumir'),
      h('p', { class: 'empty__text' }, 'Cuando agregues videos, aquí verás cuántos tienes por orientación, duración y tipo.'),
      h('button', { type: 'button', class: 'btn btn--hero btn--lg', 'data-action': 'add-videos' }, icon('plus', 22), 'Agregar videos')
    );
  }
  const map = typeMap();
  const totalSeconds = videos.reduce((sum, v) => sum + (typeof v.duration === 'number' ? v.duration : 0), 0);
  const favorites = videos.filter((v) => v.favorite).length;

  const tile = (value, label) => h('div', { class: 'tile' }, h('p', { class: 'tile__value' }, value), h('p', { class: 'tile__label' }, label));

  const orientationRows = ORIENTATION_ORDER.map((key) => ({
    label: ORIENTATION_LABELS[key],
    count: videos.filter((v) => v.orientation === key).length,
    kind: 'orientation',
    value: key,
  })).filter((r) => r.value !== 'unknown' || r.count > 0);

  const durationRows = DURATION_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: videos.filter((v) => getDurationBucket(v.duration).id === bucket.id).length,
    kind: 'bucket',
    value: bucket.id,
  })).filter((r) => r.value !== 'unknown' || r.count > 0);

  const typeRows = state.settings.contentTypes.map((type) => ({
    label: type.label,
    count: videos.filter((v) => typeIdOf(v, map) === type.id).length,
    kind: 'type',
    value: type.id,
    color: type.color,
  }));
  const untyped = videos.filter((v) => !typeIdOf(v, map)).length;
  if (untyped > 0 || !typeRows.length) typeRows.push({ label: 'Sin tipo', count: untyped, kind: 'type', value: NO_TYPE });

  return h(
    'div',
    { class: 'summary' },
    h('div', { class: 'tiles' }, tile(String(videos.length), plural(videos.length, 'Video', 'Videos')), tile(formatDuration(totalSeconds), 'Duración total'), tile(String(favorites), plural(favorites, 'Favorito', 'Favoritos'))),
    buildBarGroup('Por orientación', orientationRows),
    buildBarGroup('Por duración', durationRows),
    buildBarGroup('Por tipo de contenido', typeRows),
    h('p', { class: 'hint hint--center' }, 'Toca una barra para ver esos videos en la biblioteca.')
  );
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

function buildTypeRow(type) {
  return h(
    'li',
    { class: 'type-row' },
    h('input', {
      type: 'color',
      class: 'color-input',
      value: toHex6(type.color),
      'aria-label': `Color de ${type.label}`,
      'data-change': 'type-color',
      'data-id': type.id,
    }),
    h('input', {
      type: 'text',
      class: 'input',
      value: type.label,
      maxlength: '40',
      autocomplete: 'off',
      enterkeyhint: 'done',
      'aria-label': 'Nombre del tipo',
      'data-change': 'type-label',
      'data-id': type.id,
    }),
    h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'data-action': 'type-delete', 'data-id': type.id, 'aria-label': `Eliminar ${type.label}` }, icon('trash', 20))
  );
}

function buildSettings() {
  const types = state.settings.contentTypes;

  const typesPanel = h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, 'Tipos de contenido'),
    h('p', { class: 'hint' }, 'Cambia el nombre o el color tocándolos. Se guardan al instante.'),
    types.length ? h('ul', { class: 'type-list' }, types.map(buildTypeRow)) : h('p', { class: 'hint' }, 'No hay tipos todavía. Agrega el primero aquí abajo.'),
    h(
      'form',
      { class: 'type-add', 'data-submit': 'type-add', novalidate: true },
      h('input', { type: 'text', class: 'input', name: 'label', maxlength: '40', placeholder: 'Nuevo tipo, p. ej. Receta', 'aria-label': 'Nombre del nuevo tipo', autocomplete: 'off', enterkeyhint: 'done' }),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Agregar')
    )
  );

  const backupPanel = h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, 'Copia de seguridad'),
    h('p', { class: 'hint' }, 'El respaldo guarda títulos, notas, tipos y miniaturas. No incluye los archivos de video.'),
    h(
      'div',
      { class: 'button-stack' },
      h('button', { type: 'button', class: 'btn btn--soft btn--block', 'data-action': 'export-backup' }, 'Exportar respaldo'),
      h('button', { type: 'button', class: 'btn btn--soft btn--block', 'data-action': 'import-backup' }, 'Importar respaldo')
    )
  );

  const copies = state.videos.filter((v) => v.hasCopy).length;
  const storageText = h('p', { class: 'storage__text' }, 'Calculando…');
  const storageFill = h('div', { class: 'storage__fill' });
  const storageBar = h('div', { class: 'storage__bar', hidden: true }, storageFill);
  const storagePanel = h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, 'Almacenamiento'),
    storageText,
    storageBar,
    h('p', { class: 'hint' }, `${videosLabel(state.videos.length)} en la biblioteca · ${copies} ${plural(copies, 'copia guardada', 'copias guardadas')} dentro de la app.`)
  );
  getStorageEstimate()
    .then((estimate) => {
      if (!estimate || !estimate.quota) {
        storageText.textContent = estimate && estimate.usage ? `${formatFileSize(estimate.usage)} usados.` : 'El uso de espacio no está disponible en este dispositivo.';
        return;
      }
      storageText.textContent = `${formatFileSize(estimate.usage)} usados de ${formatFileSize(estimate.quota)} disponibles.`;
      storageFill.style.width = Math.max(1, Math.min(100, (estimate.usage / estimate.quota) * 100)) + '%';
      storageBar.hidden = false;
    })
    .catch(() => {
      storageText.textContent = 'El uso de espacio no está disponible en este dispositivo.';
    });

  const privacyPanel = h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel__title' }, 'Privacidad'),
    h('p', { class: 'panel__text' }, 'Tus datos se guardan solo en este iPhone. No hay cuentas, servidores ni seguimiento.'),
    h('p', { class: 'hint' }, 'Si borras la app o los datos de Safari, se pierde la biblioteca. Exporta un respaldo de vez en cuando.')
  );

  return h('div', { class: 'settings' }, typesPanel, backupPanel, storagePanel, privacyPanel, h('p', { class: 'version' }, `AleStudio · versión ${APP_VERSION}`));
}

async function saveTypes(list) {
  state.settings = await saveSettings({ ...state.settings, contentTypes: list });
}

// ---------------------------------------------------------------------------
// Adding videos
// ---------------------------------------------------------------------------

async function importFiles(fileList) {
  const all = Array.from(fileList || []);
  const files = all.filter(isVideoFile);
  const skipped = all.length - files.length;
  if (!files.length) {
    if (all.length) toast('Los archivos elegidos no son videos.', 'error');
    return;
  }

  const added = [];
  let failed = 0;
  let duplicates = 0;
  let lastError = null;
  // The iOS picker does not show which videos are already in the library:
  // skip files with the same name and exact size as an existing one.
  const fileKey = (name, size) => `${name || ''}\n${size || 0}`;
  const known = new Set(state.videos.filter((v) => v.fileName && v.fileSize).map((v) => fileKey(v.fileName, v.fileSize)));
  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      showBusy(`Procesando ${i + 1} de ${files.length}…`, i / files.length);
      if (file.name && file.size && known.has(fileKey(file.name, file.size))) {
        duplicates += 1;
        continue;
      }
      try {
        // One file at a time: decoding several videos at once exhausts memory on iPhone.
        const meta = await extractVideoMeta(file);
        const record = await addVideo({
          title: stripExtension(file.name),
          fileName: file.name || '',
          fileSize: file.size || 0,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          orientation: detectOrientation(meta.width, meta.height),
          orientationManual: false,
          contentType: '',
          notes: '',
          favorite: false,
          thumbnail: meta.thumbnail,
        });
        added.push(record);
        sessionFiles.set(record.id, file);
        known.add(fileKey(file.name, file.size));
      } catch (err) {
        failed += 1;
        lastError = err;
        console.error(err);
      }
    }
    if (added.length) {
      try {
        state.videos = await getAllVideos();
      } catch (_) {
        for (const record of added) replaceLocal(record);
      }
    }
  } finally {
    hideBusy();
  }

  renderView();

  const notes = [];
  if (duplicates > 0) {
    notes.push(duplicates === 1 ? 'Se omitió 1 video que ya estaba en tu biblioteca.' : `Se omitieron ${duplicates} videos que ya estaban en tu biblioteca.`);
  }
  if (skipped > 0) {
    notes.push(skipped === 1 ? 'Se omitió 1 archivo que no era video.' : `Se omitieron ${skipped} archivos que no eran video.`);
  }
  if (failed > 0) {
    const reason = errorMessage(lastError, '');
    toast(`No se ${plural(failed, 'pudo agregar', 'pudieron agregar')} ${videosLabel(failed)}.${reason ? ' ' + reason : ''}`, 'error');
  } else if (!added.length) {
    toast(notes.join(' '));
  } else {
    toast([`Se ${plural(added.length, 'agregó', 'agregaron')} ${videosLabel(added.length)}.`, ...notes].join(' '));
  }

  if (added.length) {
    // Ask the browser not to evict the library once there is something worth keeping.
    requestPersistence().catch(() => {});
    openAssignSheet(added.map((r) => r.id));
  }
}

function buildAssignChips(video) {
  return h(
    'div',
    { class: 'chip-row' },
    state.settings.contentTypes.map((type) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip' + (video.contentType === type.id ? ' is-on' : ''),
          'data-action': 'assign-type',
          'data-id': video.id,
          'data-type': type.id,
          'aria-pressed': String(video.contentType === type.id),
        },
        colorDot(type.color),
        type.label
      )
    )
  );
}

function openAssignSheet(ids) {
  const videos = ids.map(findVideo).filter(Boolean);
  if (!videos.length || !state.settings.contentTypes.length) return;
  const list = h(
    'ul',
    { class: 'assign-list' },
    videos.map((video) =>
      h(
        'li',
        { class: 'assign-item' },
        h(
          'div',
          { class: 'assign-item__head' },
          buildThumb(video, 'assign-item__thumb'),
          h(
            'div',
            { class: 'assign-item__info' },
            h('p', { class: 'assign-item__title' }, video.title || 'Sin título'),
            h('p', { class: 'hint' }, `${ORIENTATION_LABELS[video.orientation] || ORIENTATION_LABELS.unknown} · ${formatDuration(video.duration)}`)
          )
        ),
        buildAssignChips(video)
      )
    )
  );
  openSheet({
    title: '¿Qué tipo de contenido son?',
    body: h('div', null, h('p', { class: 'hint' }, 'Toca un tipo para cada video. Puedes omitir este paso y hacerlo después.'), list),
    footer: h('button', { type: 'button', class: 'btn btn--primary btn--block', 'data-action': 'close-sheet' }, 'Listo'),
  });
}

// ---------------------------------------------------------------------------
// Video detail
// ---------------------------------------------------------------------------

function releaseDetailUrl(ctx) {
  if (ctx && ctx.objectUrl) {
    try {
      URL.revokeObjectURL(ctx.objectUrl);
    } catch (_) {
      /* ignore */
    }
    ctx.objectUrl = null;
  }
}

async function flushDetail(ctx = detail) {
  if (!ctx || ctx.deleted) return;
  const video = findVideo(ctx.id);
  if (!video) return;
  const patch = {};
  const title = ctx.els.title.value.trim();
  if (!title) ctx.els.title.value = video.title;
  else if (title !== video.title) patch.title = title;
  const notes = ctx.els.notes.value;
  if (notes !== video.notes) patch.notes = notes;
  const contentType = ctx.els.type.value;
  if (contentType !== typeIdOf(video)) patch.contentType = contentType;
  if (Object.keys(patch).length) await patchVideo(video.id, patch);
}

function renderDetailFav(ctx = detail) {
  const video = ctx && findVideo(ctx.id);
  if (!video) return;
  const btn = ctx.els.fav;
  btn.classList.toggle('is-on', video.favorite);
  btn.setAttribute('aria-pressed', String(video.favorite === true));
  btn.replaceChildren(icon('star', 18), video.favorite ? 'En favoritos' : 'Marcar como favorito');
}

function renderDetailOrientation(ctx = detail) {
  const video = ctx && findVideo(ctx.id);
  if (!video) return;
  const known = video.width && video.height;
  let hint;
  if (video.orientationManual) {
    hint = h('p', { class: 'hint' }, 'Ajustada a mano. ', h('button', { type: 'button', class: 'link-btn', 'data-action': 'detail-orientation', 'data-value': 'auto' }, 'Volver a detección automática'));
  } else if (known) {
    hint = h('p', { class: 'hint' }, 'Detectada automáticamente. Toca otra opción si no es correcta.');
  } else {
    hint = h('p', { class: 'hint' }, 'No se pudo detectar. Elige la orientación a mano.');
  }
  ctx.els.orientation.replaceChildren(
    h('p', { class: 'field__label', id: 'd-orientation-label' }, 'Orientación'),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-labelledby': 'd-orientation-label' },
      MANUAL_ORIENTATIONS.map((key) =>
        h(
          'button',
          {
            type: 'button',
            class: 'segmented__btn' + (video.orientation === key ? ' is-on' : ''),
            'data-action': 'detail-orientation',
            'data-value': key,
            'aria-pressed': String(video.orientation === key),
          },
          ORIENTATION_LABELS[key]
        )
      )
    ),
    hint
  );
}

function renderDetailMeta(ctx = detail) {
  const video = ctx && findVideo(ctx.id);
  if (!video) return;
  const row = (label, value) => [h('dt', null, label), h('dd', null, value)];
  ctx.els.meta.replaceChildren(
    ...row('Duración', formatDuration(video.duration)),
    ...row('Resolución', video.width && video.height ? `${video.width} × ${video.height}` : '—'),
    ...row('Tamaño', video.fileSize ? formatFileSize(video.fileSize) : '—'),
    ...row('Archivo', video.fileName || '—'),
    ...row('Agregado', formatDate(video.createdAt))
  );
}

function renderDetailCopy(ctx = detail) {
  const video = ctx && findVideo(ctx.id);
  if (!video) return;
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'switch' + (video.hasCopy ? ' is-on' : ''),
      role: 'switch',
      'aria-checked': String(video.hasCopy === true),
      'aria-labelledby': 'd-copy-label',
      'data-action': 'detail-copy-toggle',
    },
    h('span', { class: 'switch__knob' })
  );
  // replaceChildren() would print a null argument as text, so build the list first.
  const items = [
    h('div', { class: 'switch-row' }, h('p', { class: 'field__label', id: 'd-copy-label' }, 'Guardar copia dentro de la app'), toggle),
    h('p', { class: 'hint' }, 'Usa espacio de tu iPhone y te permite reproducir el video aquí.'),
  ];
  if (video.hasCopy) {
    items.push(h('button', { type: 'button', class: 'btn btn--soft btn--block', 'data-action': 'detail-remove-copy' }, 'Quitar copia'));
  }
  ctx.els.copy.replaceChildren(...items);
}

async function renderDetailMedia(ctx = detail) {
  const video = ctx && findVideo(ctx.id);
  if (!video) return;
  ctx.mediaToken += 1;
  const token = ctx.mediaToken;
  releaseDetailUrl(ctx);
  const box = ctx.els.media;
  const still = () => buildThumb(video, 'detail-thumb');

  if (!video.hasCopy) {
    box.replaceChildren(
      still(),
      h('p', { class: 'hint hint--center' }, 'Para reproducirlo aquí, activa “Guardar copia dentro de la app” más abajo.')
    );
    return;
  }
  box.replaceChildren(still(), h('p', { class: 'hint hint--center' }, 'Cargando video…'));
  let blob = null;
  try {
    blob = await getBlob(video.id);
  } catch (err) {
    console.error(err);
  }
  // The sheet was closed or the media was re-rendered while the blob was loading.
  if (detail !== ctx || ctx.mediaToken !== token) return;
  if (!blob) {
    box.replaceChildren(
      still(),
      h('p', { class: 'hint hint--center' }, 'No se encontró la copia guardada.'),
      h('button', { type: 'button', class: 'btn btn--soft btn--block', 'data-action': 'detail-relink' }, 'Elegir el video de nuevo')
    );
    return;
  }
  ctx.objectUrl = URL.createObjectURL(blob);
  box.replaceChildren(
    h('video', {
      class: 'player',
      controls: true,
      playsinline: true,
      'webkit-playsinline': true,
      preload: 'metadata',
      poster: video.thumbnail,
      src: ctx.objectUrl,
      'aria-label': `Reproducir ${video.title || 'video'}`,
    })
  );
}

function renderDetailDynamic(ctx = detail) {
  renderDetailFav(ctx);
  renderDetailOrientation(ctx);
  renderDetailMeta(ctx);
  renderDetailCopy(ctx);
}

function openDetail(id) {
  const video = findVideo(id);
  if (!video) return;
  const currentType = typeIdOf(video);

  const ctxEls = {
    media: h('div', { class: 'detail-media' }),
    fav: h('button', { type: 'button', class: 'btn btn--soft btn--block fav-btn', 'data-action': 'detail-fav' }),
    title: h('input', {
      type: 'text',
      class: 'input',
      id: 'd-title',
      value: video.title,
      maxlength: '200',
      autocomplete: 'off',
      enterkeyhint: 'done',
      'data-change': 'detail-field',
    }),
    type: h(
      'select',
      { class: 'input', id: 'd-type', 'data-change': 'detail-field' },
      h('option', { value: '', selected: currentType === '' }, 'Sin tipo'),
      state.settings.contentTypes.map((t) => h('option', { value: t.id, selected: t.id === currentType }, t.label))
    ),
    notes: h(
      'textarea',
      { class: 'input textarea', id: 'd-notes', rows: '3', maxlength: '4000', placeholder: 'Ideas, guion, dónde lo publicaste…', 'data-change': 'detail-field' },
      video.notes
    ),
    orientation: h('div', { class: 'field' }),
    meta: h('dl', { class: 'meta-list' }),
    copy: h('div', { class: 'field copy-box' }),
  };

  const ctx = { id, els: ctxEls, objectUrl: null, mediaToken: 0, deleted: false, sheet: null };

  const body = h(
    'div',
    { class: 'detail' },
    ctxEls.media,
    ctxEls.fav,
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'd-title' }, 'Título'), ctxEls.title),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'd-type' }, 'Tipo de contenido'), ctxEls.type),
    ctxEls.orientation,
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'd-notes' }, 'Notas'), ctxEls.notes),
    ctxEls.meta,
    ctxEls.copy,
    h('button', { type: 'button', class: 'btn btn--danger-soft btn--block', 'data-action': 'detail-delete' }, icon('trash', 18), 'Eliminar video')
  );

  detail = ctx;
  ctx.sheet = openSheet({
    title: 'Detalle del video',
    body,
    onClose: async () => {
      const video2 = ctx.els.media.querySelector('video');
      if (video2) {
        try {
          video2.pause();
          video2.removeAttribute('src');
          video2.load();
        } catch (_) {
          /* ignore */
        }
      }
      releaseDetailUrl(ctx);
      if (detail === ctx) detail = null;
      // The inputs are detached but still hold their values.
      await flushDetail(ctx);
    },
  });
  renderDetailDynamic(ctx);
  run(() => renderDetailMedia(ctx));
}

/** Stores `file` as the in-app copy of a video; with refreshMeta it also re-reads the file's metadata. */
async function attachCopy(id, file, refreshMeta) {
  const ctx = detail && detail.id === id ? detail : null;
  showBusy('Guardando copia…');
  try {
    let patch = null;
    if (refreshMeta) {
      const meta = await extractVideoMeta(file);
      const video = findVideo(id);
      if (!video) return;
      if (typeof video.duration === 'number' && typeof meta.duration === 'number' && Math.abs(video.duration - meta.duration) > 2) {
        hideBusy();
        const ok = await confirmDialog({
          title: '¿Es el mismo video?',
          message: `El archivo que elegiste dura ${formatDuration(meta.duration)} y este video dura ${formatDuration(video.duration)}. ¿Quieres usarlo de todos modos?`,
          confirmLabel: 'Usar este archivo',
        });
        if (!ok) return;
        showBusy('Guardando copia…');
      }
      patch = { fileSize: file.size || video.fileSize };
      if (file.name) patch.fileName = file.name;
      if (meta.duration !== null) patch.duration = meta.duration;
      if (meta.width !== null && meta.height !== null) {
        patch.width = meta.width;
        patch.height = meta.height;
        if (!video.orientationManual) patch.orientation = detectOrientation(meta.width, meta.height);
      }
      if (meta.thumbnail) patch.thumbnail = meta.thumbnail;
    }
    // The copy is committed here: reflect it right away, whatever happens next.
    replaceLocal(await saveBlob(id, file));
    sessionFiles.set(id, file);
    if (patch) replaceLocal(await updateVideo(id, patch));
    toast('Copia guardada. Ya puedes reproducir el video aquí.');
  } catch (err) {
    showError(err, 'No se pudo guardar la copia del video.');
  } finally {
    try {
      // Always show what is really stored, whichever step failed.
      await refreshVideo(id);
    } catch (err) {
      console.error(err);
    }
    hideBusy();
    renderView();
    if (ctx && detail === ctx) {
      renderDetailDynamic(ctx);
      run(() => renderDetailMedia(ctx));
    }
  }
}

async function removeCopy(id) {
  const ok = await confirmDialog({
    title: '¿Quitar la copia?',
    message: 'Se libera el espacio en tu iPhone. El video sigue en tu biblioteca, pero ya no podrás reproducirlo aquí.',
    confirmLabel: 'Quitar copia',
    danger: true,
  });
  if (!ok) return;
  const ctx = detail && detail.id === id ? detail : null;
  try {
    await deleteBlob(id);
    await refreshVideo(id);
    toast('Copia quitada.');
  } finally {
    renderView();
    if (ctx && detail === ctx) {
      renderDetailCopy(ctx);
      run(() => renderDetailMedia(ctx));
    }
  }
}

function pickRelinkFile(id) {
  relinkTargetId = id;
  els.relinkInput.value = '';
  els.relinkInput.click();
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

function downloadText(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: fileName, class: 'visually-hidden' }, fileName);
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30000);
}

/**
 * Step 1 of the export: build the file. On touch devices the share sheet is then
 * opened by a second tap ('share-backup'), because iOS only allows navigator.share
 * during a user gesture and reading the whole library first would lose it.
 */
async function exportData() {
  const json = await exportBackup();
  const fileName = `alestudio-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch (_) {
    /* ignore */
  }
  let file = null;
  if (coarse && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && typeof File === 'function') {
    try {
      const candidate = new File([json], fileName, { type: 'application/json' });
      if (navigator.canShare({ files: [candidate] })) file = candidate;
    } catch (err) {
      console.warn(err);
    }
  }
  if (!file && !isIOS()) {
    // Desktop browsers: a plain download works.
    downloadText(json, fileName);
    toast('Respaldo descargado.');
    return;
  }
  openBackupSheet(json, fileName, file);
}

function openBackupSheet(json, fileName, file) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  // A link she taps herself: programmatic downloads are unreliable in the installed app.
  const link = h('a', { class: 'btn btn--soft btn--block', href: url, download: fileName, hidden: Boolean(file) }, 'Abrir el archivo de respaldo');
  const note = h(
    'p',
    { class: 'hint', hidden: Boolean(file) },
    'Toca el botón y luego usa Compartir › “Guardar en Archivos”. Comprueba que el archivo quedó guardado.'
  );
  const ctx = { file, link, note };
  pendingBackup = ctx;
  openSheet({
    title: 'Respaldo listo',
    body: h(
      'div',
      { class: 'backup-ready' },
      h('p', { class: 'panel__text' }, `Tu respaldo con ${videosLabel(state.videos.length)} está listo. Falta guardarlo fuera de la app.`),
      file
        ? h('p', { class: 'hint' }, 'Toca “Guardar respaldo” y elige “Guardar en Archivos”, o envíatelo por correo o AirDrop.')
        : null,
      file ? h('button', { type: 'button', class: 'btn btn--primary btn--block', 'data-action': 'share-backup' }, icon('share', 18), 'Guardar respaldo') : null,
      note,
      link
    ),
    onClose: () => {
      if (pendingBackup === ctx) pendingBackup = null;
      // Give a tapped link time to be read before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  });
}

/** How many videos of the backup already exist here, and when it was exported. Never throws. */
function inspectBackup(text) {
  const info = { existing: 0, exportedAt: null };
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!data || !Array.isArray(data.videos)) return info;
    const localIds = new Set(state.videos.map((v) => v.id));
    const seen = new Set();
    for (const item of data.videos) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
      seen.add(item.id);
      if (localIds.has(item.id)) info.existing += 1;
    }
    if (typeof data.exportedAt === 'string' && !Number.isNaN(Date.parse(data.exportedAt))) info.exportedAt = data.exportedAt;
  } catch (_) {
    /* invalid file: importBackup reports it */
  }
  return info;
}

async function importData(file) {
  const text = await file.text();
  const info = inspectBackup(text);
  if (info.existing > 0) {
    const when = info.exportedAt ? ` del ${formatDate(info.exportedAt)}` : '';
    const ok = await confirmDialog({
      title: '¿Importar este respaldo?',
      message:
        `Este respaldo${when} incluye ${videosLabel(info.existing)} que ya ${plural(info.existing, 'está', 'están')} en tu biblioteca. ` +
        'Su título, tipo, notas, orientación y favorito volverán a ser los del respaldo, salvo en los videos que hayas cambiado aquí después de crearlo. No se puede deshacer.',
      confirmLabel: 'Importar',
    });
    if (!ok) return;
  }
  showBusy('Importando respaldo…');
  let result;
  try {
    result = await importBackup(text);
    await loadData();
  } finally {
    hideBusy();
  }
  renderView();
  const kept = result.skipped || 0;
  toast(
    `Respaldo importado: ${result.added} ${plural(result.added, 'nuevo', 'nuevos')}, ${result.updated} ${plural(result.updated, 'actualizado', 'actualizados')}` +
      (kept ? `, ${kept} sin tocar porque aquí ${plural(kept, 'es más reciente', 'son más recientes')}.` : '.')
  );
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

function run(fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') result.catch((err) => showError(err));
  } catch (err) {
    showError(err);
  }
}

const actions = {
  tab(el) {
    const tab = el.getAttribute('data-tab');
    if (tab === state.tab) {
      window.scrollTo(0, 0);
      return;
    }
    state.tab = tab;
    renderView();
    window.scrollTo(0, 0);
  },

  'add-videos'() {
    if (state.busy) return;
    els.videoInput.value = '';
    els.videoInput.click();
  },

  'dismiss-banner'() {
    if (els.banner) els.banner.remove();
    els.banner = null;
  },

  async 'retry-load'() {
    await start();
  },

  group(el) {
    state.groupBy = el.getAttribute('data-group');
    lsSet(LS_KEYS.groupBy, state.groupBy);
    renderView();
  },

  'toggle-filters'() {
    state.filtersOpen = !state.filtersOpen;
    lsSet(LS_KEYS.filtersOpen, state.filtersOpen ? '1' : '0');
    renderView();
  },

  filter(el) {
    const kind = el.getAttribute('data-kind');
    const value = el.getAttribute('data-value');
    if (kind === 'favorites') {
      state.filters.favorites = !state.filters.favorites;
    } else if (state.filters[kind] instanceof Set) {
      const set = state.filters[kind];
      if (set.has(value)) set.delete(value);
      else set.add(value);
    }
    renderView();
  },

  'clear-filters'() {
    clearFilters();
    renderView();
  },

  'summary-filter'(el) {
    const kind = el.getAttribute('data-kind');
    const value = el.getAttribute('data-value');
    if (!(state.filters[kind] instanceof Set)) return;
    clearFilters();
    state.filters[kind].add(value);
    state.filtersOpen = true;
    lsSet(LS_KEYS.filtersOpen, '1');
    state.tab = 'library';
    renderView();
    window.scrollTo(0, 0);
  },

  'open-video'(el) {
    openDetail(el.getAttribute('data-id'));
  },

  async 'toggle-fav'(el) {
    const video = findVideo(el.getAttribute('data-id'));
    if (video) await patchVideo(video.id, { favorite: !video.favorite });
  },

  'close-sheet'() {
    closeSheet();
  },

  async 'assign-type'(el) {
    const video = findVideo(el.getAttribute('data-id'));
    if (!video) return;
    const type = el.getAttribute('data-type');
    const row = el.closest('.chip-row');
    const updated = await patchVideo(video.id, { contentType: video.contentType === type ? '' : type });
    if (row && row.isConnected) row.replaceWith(buildAssignChips(updated));
  },

  async 'detail-fav'() {
    const ctx = detail;
    const video = ctx && findVideo(ctx.id);
    if (!video) return;
    await patchVideo(video.id, { favorite: !video.favorite });
    renderDetailFav(ctx);
  },

  async 'detail-orientation'(el) {
    const ctx = detail;
    const video = ctx && findVideo(ctx.id);
    if (!video) return;
    const value = el.getAttribute('data-value');
    const patch =
      value === 'auto'
        ? { orientation: detectOrientation(video.width, video.height), orientationManual: false }
        : { orientation: value, orientationManual: true };
    if (value !== 'auto' && !MANUAL_ORIENTATIONS.includes(value)) return;
    await patchVideo(video.id, patch);
    renderDetailOrientation(ctx);
    if (!findVideo(ctx.id).hasCopy) run(() => renderDetailMedia(ctx));
  },

  async 'detail-copy-toggle'() {
    const ctx = detail;
    const video = ctx && findVideo(ctx.id);
    if (!video || state.busy) return;
    if (video.hasCopy) {
      await removeCopy(video.id);
      return;
    }
    const file = sessionFiles.get(video.id);
    if (file) {
      await attachCopy(video.id, file, false);
      return;
    }
    // The original file is no longer at hand: explain why the picker opens, then
    // open it from inside the confirm tap (iOS requires a user gesture).
    const id = video.id;
    await confirmDialog({
      title: 'Elige el video otra vez',
      message: 'Para guardar la copia, vuelve a elegir este mismo video en tus Fotos.',
      confirmLabel: 'Elegir video',
      onConfirm: () => pickRelinkFile(id),
    });
  },

  'detail-relink'() {
    if (detail && !state.busy) pickRelinkFile(detail.id);
  },

  async 'detail-remove-copy'() {
    if (detail) await removeCopy(detail.id);
  },

  async 'detail-delete'() {
    const ctx = detail;
    const video = ctx && findVideo(ctx.id);
    if (!video) return;
    const ok = await confirmDialog({
      title: '¿Eliminar este video?',
      message: `“${video.title || 'Sin título'}” se quitará de tu biblioteca${video.hasCopy ? ', junto con la copia guardada en la app' : ''}. El original en Fotos no se toca.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deleteVideo(video.id);
    state.videos = state.videos.filter((v) => v.id !== video.id);
    sessionFiles.delete(video.id);
    ctx.deleted = true;
    if (ctx.sheet) closeSheet(ctx.sheet);
    renderView();
    toast('Video eliminado.');
  },

  async 'type-delete'(el) {
    const id = el.getAttribute('data-id');
    const type = state.settings.contentTypes.find((t) => t.id === id);
    if (!type) return;
    const affected = state.videos.filter((v) => v.contentType === id);
    const ok = await confirmDialog({
      title: `¿Eliminar “${type.label}”?`,
      message: affected.length
        ? `${videosLabel(affected.length)} ${plural(affected.length, 'quedará', 'quedarán')} sin tipo. Los videos no se borran.`
        : 'Ningún video usa este tipo.',
      confirmLabel: 'Eliminar tipo',
      danger: true,
    });
    if (!ok) return;
    showBusy('Eliminando tipo…');
    try {
      for (const video of affected) {
        replaceLocal(await updateVideo(video.id, { contentType: '' }));
      }
      await saveTypes(state.settings.contentTypes.filter((t) => t.id !== id));
      state.filters.type.delete(id);
      toast('Tipo eliminado.');
    } finally {
      hideBusy();
      renderView();
    }
  },

  async 'export-backup'() {
    if (state.busy) return;
    showBusy('Preparando respaldo…');
    try {
      await exportData();
    } catch (err) {
      showError(err, 'No se pudo crear el respaldo.');
    } finally {
      hideBusy();
    }
  },

  /** Step 2 of the export: navigator.share is called directly inside this tap. */
  'share-backup'() {
    const ctx = pendingBackup;
    if (!ctx || !ctx.file) return undefined;
    let sharing;
    try {
      sharing = navigator.share({ files: [ctx.file], title: 'Respaldo de AleStudio' });
    } catch (err) {
      sharing = Promise.reject(err);
    }
    return Promise.resolve(sharing).then(
      () => {
        toast('Respaldo compartido. Comprueba que quedó guardado donde lo enviaste.');
      },
      (err) => {
        if (err && err.name === 'AbortError') return; // she closed the share sheet: nothing was saved
        console.warn(err);
        ctx.link.hidden = false;
        ctx.note.hidden = false;
        toast('No se pudo abrir el menú para compartir. Usa el botón “Abrir el archivo de respaldo”.', 'error');
      }
    );
  },

  'import-backup'() {
    if (state.busy) return;
    els.backupInput.value = '';
    els.backupInput.click();
  },
};

const changeHandlers = {
  sort(el) {
    if (!SORTS.some((s) => s.id === el.value)) return;
    state.sort = el.value;
    lsSet(LS_KEYS.sort, state.sort);
    fillResults();
  },

  async 'files-picked'(el) {
    const files = Array.from(el.files || []);
    el.value = '';
    if (files.length) await importFiles(files);
  },

  async 'relink-picked'(el) {
    const file = el.files && el.files[0];
    const id = relinkTargetId;
    el.value = '';
    relinkTargetId = null;
    if (!file || !id || !findVideo(id)) return;
    if (!isVideoFile(file)) {
      toast('El archivo elegido no es un video.', 'error');
      return;
    }
    await attachCopy(id, file, true);
  },

  async 'backup-picked'(el) {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    try {
      await importData(file);
    } catch (err) {
      showError(err, 'No se pudo importar el respaldo.');
    }
  },

  async 'detail-field'() {
    await flushDetail();
  },

  async 'type-label'(el) {
    const id = el.getAttribute('data-id');
    const types = state.settings.contentTypes;
    const type = types.find((t) => t.id === id);
    if (!type) return;
    const label = el.value.trim();
    if (!label) {
      el.value = type.label;
      toast('El nombre no puede quedar vacío.', 'error');
      return;
    }
    if (label === type.label) return;
    if (types.some((t) => t.id !== id && normalizeText(t.label) === normalizeText(label))) {
      el.value = type.label;
      toast('Ya existe un tipo con ese nombre.', 'error');
      return;
    }
    try {
      await saveTypes(types.map((t) => (t.id === id ? { ...t, label } : t)));
    } catch (err) {
      el.value = type.label;
      throw err;
    }
    toast('Nombre guardado.');
  },

  async 'type-color'(el) {
    const id = el.getAttribute('data-id');
    const types = state.settings.contentTypes;
    if (!types.some((t) => t.id === id) || !/^#[0-9a-fA-F]{6}$/.test(el.value)) return;
    await saveTypes(types.map((t) => (t.id === id ? { ...t, color: el.value } : t)));
  },
};

const inputHandlers = {
  search(el) {
    state.search = el.value;
    fillResults();
  },
};

const submitHandlers = {
  async 'type-add'(form) {
    const input = form.querySelector('input[name="label"]');
    const label = input ? input.value.trim() : '';
    const types = state.settings.contentTypes;
    if (!label) {
      toast('Escribe un nombre para el nuevo tipo.', 'error');
      return;
    }
    if (types.some((t) => normalizeText(t.label) === normalizeText(label))) {
      toast('Ya existe un tipo con ese nombre.', 'error');
      return;
    }
    const color = NEW_TYPE_COLORS[types.length % NEW_TYPE_COLORS.length];
    await saveTypes([...types, { id: newId(), label, color }]);
    renderView();
    toast('Tipo agregado.');
  },
};

function delegate(eventName, attribute, handlers, { preventDefault = false } = {}) {
  document.addEventListener(eventName, (event) => {
    const target = event.target instanceof Element ? event.target.closest(`[${attribute}]`) : null;
    if (!target) return;
    const handler = handlers[target.getAttribute(attribute)];
    if (!handler) return;
    if (preventDefault) event.preventDefault();
    if (target.disabled) return;
    run(() => handler(target, event));
  });
}

function bindEvents() {
  delegate('click', 'data-action', actions);
  delegate('change', 'data-change', changeHandlers);
  delegate('input', 'data-input', inputHandlers);
  delegate('submit', 'data-submit', submitHandlers, { preventDefault: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (confirmCancel) confirmCancel();
    else if (sheets.length && !state.busy) closeSheet();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  try {
    await loadData();
    state.loadError = null;
  } catch (err) {
    console.error(err);
    state.loadError = errorMessage(err, 'Cierra la app y vuelve a abrirla. Si el problema sigue, revisa que tu iPhone tenga espacio libre.');
  }
  if (!els.main) buildShell();
  renderView();
}

bindEvents();
start();
