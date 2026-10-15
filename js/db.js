// db.js — thin Promise wrapper over IndexedDB. Everything stays on the device.
import { DEFAULT_CONTENT_TYPES, detectOrientation, newId } from './classify.js';

const DB_NAME = 'alestudio';
const DB_VERSION = 1;
const STORE_VIDEOS = 'videos';
const STORE_BLOBS = 'blobs';
const STORE_SETTINGS = 'settings';
const SETTINGS_KEY = 'settings';
const BACKUP_VERSION = 1;

const ORIENTATIONS = ['vertical', 'horizontal', 'square', 'unknown'];

const MSG_QUOTA_DATA = 'No hay espacio suficiente en el iPhone para guardar los datos.';
const MSG_QUOTA_COPY = 'No hay espacio suficiente en el iPhone para guardar la copia del video.';
const MSG_NO_IDB = 'Este navegador no permite guardar datos en el dispositivo.';
const MSG_OPEN_FAILED = 'No se pudo abrir la base de datos de la app.';
const MSG_NOT_FOUND = 'No se encontró el video.';
const MSG_DUPLICATE = 'Ya existe un video con ese identificador.';
const MSG_INVALID_BACKUP = 'El archivo no es una copia de seguridad válida de AleStudio.';
const MSG_NEWER_BACKUP =
  'La copia de seguridad fue creada con una versión más nueva de AleStudio. Actualiza la app e inténtalo de nuevo.';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  const promise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error(MSG_NO_IDB));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(withCause(new Error(MSG_OPEN_FAILED), err));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const forget = () => {
        if (dbPromise === promise) dbPromise = null;
      };
      // Another tab / a newer app version wants to upgrade: get out of the way.
      db.onversionchange = () => {
        try {
          db.close();
        } catch (_) {
          /* ignore */
        }
        forget();
      };
      // Fired when the browser closes the connection abnormally (e.g. storage eviction).
      db.onclose = forget;
      resolve(db);
    };
    request.onerror = () => {
      reject(mapError(request.error, MSG_QUOTA_DATA) || new Error(MSG_OPEN_FAILED));
    };
    // onblocked: an older connection is still open elsewhere; the request stays
    // pending and succeeds once that connection closes, so there is nothing to do.
    request.onblocked = () => {};
  });
  dbPromise = promise;
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  return promise;
}

function withCause(error, cause) {
  try {
    error.cause = cause;
  } catch (_) {
    /* ignore */
  }
  return error;
}

function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.code === 22);
}

function mapError(err, quotaMessage) {
  if (!err) return null;
  if (isQuotaError(err)) return withCause(new Error(quotaMessage), err);
  return err;
}

/**
 * Runs `work` inside one transaction. Resolves on 'complete' with the value passed
 * to ctx.done(value); rejects on error / abort. ctx.fail(error) aborts the
 * transaction (rolling back every write) and rejects with that error.
 */
function runTx(db, storeNames, mode, work, quotaMessage) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (err) {
      reject(err);
      return;
    }
    let result;
    let failure = null;
    let settled = false;
    const rejectOnce = (err) => {
      if (settled) return;
      settled = true;
      const mapped = failure || mapError(err, quotaMessage);
      if (mapped) {
        reject(mapped);
        return;
      }
      // Aborted without any error: on iOS this means the connection was lost.
      const lost = new Error('La operación con la base de datos fue cancelada.');
      lost.connectionLost = true;
      reject(lost);
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    // While a request's error event bubbles up here, tx.error is still null (it is
    // only set when the transaction aborts afterwards): read the request's own error.
    tx.onerror = (event) => rejectOnce((event && event.target && event.target.error) || tx.error);
    tx.onabort = () => rejectOnce(tx.error);
    const ctx = {
      tx,
      store: (name) => tx.objectStore(name),
      done: (value) => {
        result = value;
      },
      fail: (err) => {
        if (!failure) failure = err;
        try {
          tx.abort();
        } catch (_) {
          rejectOnce(err);
        }
      },
    };
    try {
      work(ctx);
    } catch (err) {
      // Synchronous failures (e.g. DataCloneError from put) must roll back too.
      ctx.fail(mapError(err, quotaMessage));
    }
  });
}

async function withTx(storeNames, mode, work, quotaMessage = MSG_QUOTA_DATA) {
  let db = await openDb();
  try {
    return await runTx(db, storeNames, mode, work, quotaMessage);
  } catch (err) {
    // The cached connection was closed or killed behind our back (common on iOS
    // after the app has been suspended for a while): reconnect once and retry.
    // A failed transaction is rolled back as a whole, so running `work` again is safe.
    if (isConnectionLost(err)) {
      try {
        db.close();
      } catch (_) {
        /* ignore */
      }
      dbPromise = null;
      db = await openDb();
      return runTx(db, storeNames, mode, work, quotaMessage);
    }
    throw err;
  }
}

/**
 * WebKit reports a dead IndexedDB connection as InvalidStateError (closed), as
 * UnknownError ("Connection to Indexed Database server lost") or as an abort
 * that carries no error at all.
 */
function isConnectionLost(err) {
  if (!err) return false;
  return err.connectionLost === true || err.name === 'InvalidStateError' || err.name === 'UnknownError';
}

/** Wires a request so that `onSuccess` exceptions abort the transaction. */
function onSuccess(ctx, request, handler) {
  request.onsuccess = () => {
    try {
      handler(request.result);
    } catch (err) {
      ctx.fail(err);
    }
  };
  return request;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isoOr(value, fallback) {
  if (typeof value === 'string' && value && !Number.isNaN(Date.parse(value))) return value;
  return fallback;
}

function stripExtension(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/**
 * Returns a new record with every contract field present and well-typed.
 * Unknown extra fields are preserved.
 */
function normalizeVideo(input, hasCopy) {
  const src = isPlainObject(input) ? input : {};
  const now = new Date().toISOString();
  const fileName = typeof src.fileName === 'string' ? src.fileName : '';
  const width = numOrNull(src.width) || null;
  const height = numOrNull(src.height) || null;
  let title = typeof src.title === 'string' ? src.title.trim() : '';
  if (!title) title = stripExtension(fileName);
  const createdAt = isoOr(src.createdAt, now);
  return {
    ...src,
    id: typeof src.id === 'string' && src.id ? src.id : newId(),
    title,
    fileName,
    fileSize: numOrNull(src.fileSize) || 0,
    duration: numOrNull(src.duration),
    width,
    height,
    orientation: ORIENTATIONS.includes(src.orientation) ? src.orientation : detectOrientation(width, height),
    orientationManual: src.orientationManual === true,
    contentType: typeof src.contentType === 'string' ? src.contentType : '',
    notes: typeof src.notes === 'string' ? src.notes : '',
    favorite: src.favorite === true,
    thumbnail:
      typeof src.thumbnail === 'string' && src.thumbnail.startsWith('data:image/') ? src.thumbnail : null,
    hasCopy: hasCopy === true,
    createdAt,
    updatedAt: isoOr(src.updatedAt, createdAt),
  };
}

function normalizeContentTypes(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      color: typeof item.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(item.color) ? item.color : '#8A8F98',
    });
  }
  return out;
}

function timeOf(iso) {
  const t = Date.parse(typeof iso === 'string' ? iso : '');
  return Number.isNaN(t) ? 0 : t;
}

function isDefaultType(type) {
  return DEFAULT_CONTENT_TYPES.some((d) => d.id === type.id && d.label === type.label && d.color === type.color);
}

function defaultSettings() {
  return { contentTypes: DEFAULT_CONTENT_TYPES.map((t) => ({ ...t })) };
}

/** Returns normalized settings, or null when the value is unusable. */
function normalizeSettings(value) {
  if (!isPlainObject(value)) return null;
  const contentTypes = normalizeContentTypes(value.contentTypes);
  if (!contentTypes) return null;
  return { ...value, contentTypes };
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

/** All videos, newest first. */
export async function getAllVideos() {
  const list = await withTx(STORE_VIDEOS, 'readonly', (ctx) => {
    onSuccess(ctx, ctx.store(STORE_VIDEOS).getAll(), (rows) => ctx.done(rows || []));
  });
  return (list || []).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getVideo(id) {
  if (typeof id !== 'string' || !id) return null;
  const record = await withTx(STORE_VIDEOS, 'readonly', (ctx) => {
    onSuccess(ctx, ctx.store(STORE_VIDEOS).get(id), (row) => ctx.done(row || null));
  });
  return record || null;
}

/**
 * Inserts a new video. Missing fields get defaults; a missing id is generated.
 * hasCopy always reflects whether a blob really exists for that id.
 */
export function addVideo(record) {
  return withTx([STORE_VIDEOS, STORE_BLOBS], 'readwrite', (ctx) => {
    const draft = normalizeVideo(record, false);
    onSuccess(ctx, ctx.store(STORE_BLOBS).count(draft.id), (count) => {
      draft.hasCopy = count > 0;
      const request = ctx.store(STORE_VIDEOS).add(draft);
      request.onerror = () => {
        if (request.error && request.error.name === 'ConstraintError') {
          ctx.fail(new Error(MSG_DUPLICATE));
        }
      };
      request.onsuccess = () => ctx.done(draft);
    });
  });
}

/**
 * Merges `patch` into the stored record and sets updatedAt.
 * id, createdAt and hasCopy cannot be changed through a patch.
 */
export function updateVideo(id, patch) {
  return withTx(STORE_VIDEOS, 'readwrite', (ctx) => {
    const store = ctx.store(STORE_VIDEOS);
    onSuccess(ctx, store.get(id), (existing) => {
      if (!existing) {
        ctx.fail(new Error(MSG_NOT_FOUND));
        return;
      }
      const merged = normalizeVideo(
        { ...existing, ...(isPlainObject(patch) ? patch : {}), id: existing.id, createdAt: existing.createdAt },
        existing.hasCopy === true
      );
      merged.updatedAt = new Date().toISOString();
      store.put(merged);
      ctx.done(merged);
    });
  });
}

/** Deletes the video and its stored copy (if any). */
export async function deleteVideo(id) {
  if (typeof id !== 'string' || !id) return;
  await withTx([STORE_VIDEOS, STORE_BLOBS], 'readwrite', (ctx) => {
    ctx.store(STORE_VIDEOS).delete(id);
    ctx.store(STORE_BLOBS).delete(id);
  });
}

// ---------------------------------------------------------------------------
// Blobs (optional in-app copy of the video file)
// ---------------------------------------------------------------------------

/** Stores the file and flags the video with hasCopy = true, atomically. Returns the updated record. */
export function saveBlob(id, blob) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) {
    return Promise.reject(new Error('El archivo de video no es válido.'));
  }
  return withTx(
    [STORE_VIDEOS, STORE_BLOBS],
    'readwrite',
    (ctx) => {
      const videos = ctx.store(STORE_VIDEOS);
      onSuccess(ctx, videos.get(id), (existing) => {
        if (!existing) {
          ctx.fail(new Error(MSG_NOT_FOUND));
          return;
        }
        ctx.store(STORE_BLOBS).put({ id, blob });
        const updated = { ...existing, hasCopy: true };
        videos.put(updated);
        ctx.done(updated);
      });
    },
    MSG_QUOTA_COPY
  );
}

export async function getBlob(id) {
  if (typeof id !== 'string' || !id) return null;
  const row = await withTx(STORE_BLOBS, 'readonly', (ctx) => {
    onSuccess(ctx, ctx.store(STORE_BLOBS).get(id), (r) => ctx.done(r || null));
  });
  return row && typeof Blob !== 'undefined' && row.blob instanceof Blob ? row.blob : null;
}

/** Removes the stored file and flags the video with hasCopy = false, atomically. */
export async function deleteBlob(id) {
  if (typeof id !== 'string' || !id) return;
  await withTx([STORE_VIDEOS, STORE_BLOBS], 'readwrite', (ctx) => {
    ctx.store(STORE_BLOBS).delete(id);
    const videos = ctx.store(STORE_VIDEOS);
    onSuccess(ctx, videos.get(id), (existing) => {
      if (existing && existing.hasCopy !== false) videos.put({ ...existing, hasCopy: false });
    });
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Returns the settings, seeding the default content types on first run. */
export async function getSettings() {
  const read = await withTx(STORE_SETTINGS, 'readonly', (ctx) => {
    onSuccess(ctx, ctx.store(STORE_SETTINGS).get(SETTINGS_KEY), (row) => ctx.done(row || null));
  });
  const current = read ? normalizeSettings(read.value) : null;
  if (current) return current;
  return withTx(STORE_SETTINGS, 'readwrite', (ctx) => {
    const store = ctx.store(STORE_SETTINGS);
    // Re-check inside the write transaction so two concurrent callers seed only once.
    onSuccess(ctx, store.get(SETTINGS_KEY), (row) => {
      const existing = row ? normalizeSettings(row.value) : null;
      if (existing) {
        ctx.done(existing);
        return;
      }
      const seeded = defaultSettings();
      store.put({ key: SETTINGS_KEY, value: seeded });
      ctx.done(seeded);
    });
  });
}

export function saveSettings(settings) {
  const value = normalizeSettings(settings);
  if (!value) return Promise.reject(new Error('Los ajustes no son válidos.'));
  return withTx(STORE_SETTINGS, 'readwrite', (ctx) => {
    ctx.store(STORE_SETTINGS).put({ key: SETTINGS_KEY, value });
    ctx.done(value);
  });
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/** JSON string with settings and every video record (thumbnails included, video files excluded). */
export async function exportBackup() {
  const [settings, videos] = await Promise.all([getSettings(), getAllVideos()]);
  return JSON.stringify({
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    videos,
  });
}

/**
 * Merges a backup into the local data, by id. Records in the file replace local
 * records with the same id, unless the local record was edited more recently
 * (newer updatedAt): those are kept and counted as skipped. Stored video copies
 * are kept. Content types are merged by id; a type that was renamed or recolored
 * on this device keeps its local label and color.
 * @returns {Promise<{added:number, updated:number, skipped:number}>}
 */
export async function importBackup(jsonString) {
  let data;
  try {
    data = JSON.parse(typeof jsonString === 'string' ? jsonString.replace(/^﻿/, '') : '');
  } catch (err) {
    throw withCause(new Error(MSG_INVALID_BACKUP), err);
  }
  if (!isPlainObject(data) || !Array.isArray(data.videos)) throw new Error(MSG_INVALID_BACKUP);
  if (data.version !== undefined) {
    if (typeof data.version !== 'number' || !Number.isFinite(data.version) || data.version < 1) {
      throw new Error(MSG_INVALID_BACKUP);
    }
    if (data.version > BACKUP_VERSION) throw new Error(MSG_NEWER_BACKUP);
  }

  // Validate everything before touching the database. Last occurrence of an id wins.
  const incoming = new Map();
  for (const item of data.videos) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(MSG_INVALID_BACKUP);
    }
    incoming.set(item.id, item);
  }
  let importedTypes = null;
  if (data.settings !== undefined && data.settings !== null) {
    const s = normalizeSettings(data.settings);
    if (!s) throw new Error(MSG_INVALID_BACKUP);
    importedTypes = s.contentTypes;
  }

  return withTx([STORE_VIDEOS, STORE_BLOBS, STORE_SETTINGS], 'readwrite', (ctx) => {
    const videos = ctx.store(STORE_VIDEOS);
    const settingsStore = ctx.store(STORE_SETTINGS);
    const settingsReq = settingsStore.get(SETTINGS_KEY);
    const blobKeysReq = ctx.store(STORE_BLOBS).getAllKeys();
    // Requests run in order, so the two above are finished when this one succeeds.
    onSuccess(ctx, videos.getAll(), (rows) => {
      const existing = new Map((rows || []).map((row) => [row.id, row]));
      const blobIds = new Set(blobKeysReq.result || []);
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const [id, item] of incoming) {
        const record = normalizeVideo(item, blobIds.has(id));
        const local = existing.get(id);
        if (local && timeOf(local.updatedAt) > timeOf(record.updatedAt)) {
          skipped += 1; // edited here after the backup was made: keep the local version
          continue;
        }
        videos.put(record);
        if (local) updated += 1;
        else added += 1;
      }

      if (importedTypes) {
        const row = settingsReq.result;
        const local = (row && normalizeSettings(row.value)) || defaultSettings();
        const merged = local.contentTypes.slice();
        for (const type of importedTypes) {
          const i = merged.findIndex((t) => t.id === type.id);
          if (i < 0) merged.push(type);
          // Only replace a local type that is still an untouched default.
          else if (isDefaultType(merged[i])) merged[i] = type;
        }
        settingsStore.put({ key: SETTINGS_KEY, value: { ...local, contentTypes: merged } });
      }
      ctx.done({ added, updated, skipped });
    });
  });
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Asks the browser not to evict our data. Never throws. */
export async function requestPersistence() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!storage) return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    if (typeof storage.persist === 'function') return (await storage.persist()) === true;
    return false;
  } catch (_) {
    return false;
  }
}

/** @returns {Promise<{usage:number, quota:number}|null>} */
export async function getStorageEstimate() {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!storage || typeof storage.estimate !== 'function') return null;
    const estimate = await storage.estimate();
    if (!estimate) return null;
    return {
      usage: Number.isFinite(estimate.usage) ? estimate.usage : 0,
      quota: Number.isFinite(estimate.quota) ? estimate.quota : 0,
    };
  } catch (_) {
    return null;
  }
}
