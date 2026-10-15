// classify.js — pure helpers: duration buckets, orientation, content types, formatting, ids.
// No DOM and no storage access here, so this module is safe to import anywhere.

/**
 * Duration buckets. A duration belongs to a bucket when  min < seconds <= max
 * (the first bucket also includes 0). The 'unknown' bucket has null bounds.
 */
export const DURATION_BUCKETS = [
  { id: 'u15', label: 'Hasta 15 s', min: 0, max: 15 },
  { id: 'u30', label: '15–30 s', min: 15, max: 30 },
  { id: 'u60', label: '30–60 s', min: 30, max: 60 },
  { id: 'u180', label: '1–3 min', min: 60, max: 180 },
  { id: 'u600', label: '3–10 min', min: 180, max: 600 },
  { id: 'long', label: 'Más de 10 min', min: 600, max: Infinity },
  { id: 'unknown', label: 'Sin duración', min: null, max: null },
];

const UNKNOWN_BUCKET = DURATION_BUCKETS[DURATION_BUCKETS.length - 1];

function isValidDuration(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0;
}

/**
 * @param {number|null|undefined} seconds
 * @returns {{id:string,label:string,min:number|null,max:number|null}}
 */
export function getDurationBucket(seconds) {
  if (!isValidDuration(seconds)) return UNKNOWN_BUCKET;
  for (const bucket of DURATION_BUCKETS) {
    if (bucket.max === null) continue;
    if (seconds <= bucket.max) return bucket;
  }
  return UNKNOWN_BUCKET;
}

export const ORIENTATION_LABELS = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  square: 'Cuadrado',
  unknown: 'Sin definir',
};

/**
 * Square when both sides differ by less than 5 % of the longer side.
 * @returns {'vertical'|'horizontal'|'square'|'unknown'}
 */
export function detectOrientation(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'unknown';
  const longSide = Math.max(w, h);
  if (Math.abs(w - h) / longSide < 0.05) return 'square';
  return h > w ? 'vertical' : 'horizontal';
}

export const DEFAULT_CONTENT_TYPES = [
  { id: 'tutorial', label: 'Tutorial', color: '#5B8DEF' },
  { id: 'vlog', label: 'Vlog', color: '#F2994A' },
  { id: 'reel', label: 'Reel / Tendencia', color: '#EB5E9D' },
  { id: 'collab', label: 'Colaboración / Marca', color: '#9B6BDF' },
  { id: 'bts', label: 'Detrás de cámaras', color: '#2FB8A6' },
  { id: 'lifestyle', label: 'Lifestyle', color: '#E2B33C' },
  { id: 'other', label: 'Otro', color: '#8A8F98' },
];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * 42 -> "0:42", 725 -> "12:05", 3723 -> "1:02:03", null -> "—"
 */
export function formatDuration(seconds) {
  if (!isValidDuration(seconds)) return '—';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
  return m + ':' + pad2(s);
}

/**
 * 35861299 -> "34,2 MB" (decimal comma, binary units as shown by iOS-like UIs).
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (bytes === null || bytes === undefined || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return Math.round(n) + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Rounding to one decimal can push the value up to 1024 (e.g. 1023,97 MB).
  if (Math.round(value * 10) / 10 >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',');
  return text + ' ' + units[unit];
}

let idCounter = 0;

/**
 * Unique string id. Uses crypto.randomUUID when available (secure contexts only),
 * then crypto.getRandomValues, then a time + Math.random fallback.
 */
export function newId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  try {
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch (_) {
    /* fall through */
  }
  try {
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; // version 4
      b[8] = (b[8] & 0x3f) | 0x80; // variant
      const hex = Array.from(b, (x) => (x < 16 ? '0' : '') + x.toString(16));
      return (
        hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
        hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
        hex.slice(10, 16).join('')
      );
    }
  } catch (_) {
    /* fall through */
  }
  idCounter = (idCounter + 1) % 1679616; // 36^4
  return (
    Date.now().toString(36) + '-' +
    idCounter.toString(36) + '-' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
