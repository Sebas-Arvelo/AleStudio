// media.js — reads duration, dimensions and a thumbnail from a local video file.

const OVERALL_TIMEOUT_MS = 8000;
// If 'seeked' has not produced a frame by then, accept any decoded frame and nudge playback.
const SEEK_FALLBACK_MS = 2500;
const THUMB_MAX_SIDE = 480;
const THUMB_QUALITY = 0.72;

function positiveOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Draws the current frame, scaled so the long side is at most THUMB_MAX_SIDE.
 * Returns a JPEG data URL, or null when no real frame could be drawn.
 */
function drawThumbnail(video, width, height) {
  try {
    const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    // When iOS has not decoded a frame yet, drawImage paints nothing and the canvas
    // stays fully transparent. Detect that instead of saving a black thumbnail.
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      const step = Math.max(4, Math.floor(data.length / 4 / 400) * 4);
      let painted = false;
      for (let i = 3; i < data.length; i += step) {
        if (data[i] !== 0) {
          painted = true;
          break;
        }
      }
      if (!painted) return null;
    } catch (_) {
      /* getImageData unavailable: trust the draw */
    }

    const url = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
    // Release the canvas backing store early (iOS has a tight canvas memory budget).
    canvas.width = 0;
    canvas.height = 0;
    return typeof url === 'string' && url.startsWith('data:image/jpeg') ? url : null;
  } catch (_) {
    return null;
  }
}

/**
 * Never rejects. Every field is null when it cannot be read.
 * @param {File|Blob} file
 * @returns {Promise<{duration:number|null, width:number|null, height:number|null, thumbnail:string|null}>}
 */
export function extractVideoMeta(file) {
  const result = { duration: null, width: null, height: null, thumbnail: null };

  return new Promise((resolve) => {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function' ||
      typeof Blob === 'undefined' ||
      !(file instanceof Blob)
    ) {
      resolve(result);
      return;
    }

    let url = null;
    let video = null;
    let finished = false;
    let metaRead = false;
    let seekDone = false;
    let anyFrameAllowed = false;
    let overallTimer = null;
    let fallbackTimer = null;
    const listeners = [];

    const listen = (type, handler) => {
      video.addEventListener(type, handler);
      listeners.push([type, handler]);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(overallTimer);
      clearTimeout(fallbackTimer);
      if (video) {
        for (const [type, handler] of listeners) {
          try {
            video.removeEventListener(type, handler);
          } catch (_) {
            /* ignore */
          }
        }
        try {
          video.pause();
        } catch (_) {
          /* ignore */
        }
        try {
          // Detach the source so the decoder is released right away.
          video.removeAttribute('src');
          video.load();
        } catch (_) {
          /* ignore */
        }
      }
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          /* ignore */
        }
      }
      resolve(result);
    };

    const readDuration = () => {
      const d = positiveOrNull(video.duration); // rejects NaN and Infinity
      if (d !== null) result.duration = d;
    };

    const tryCapture = () => {
      if (finished) return;
      if (!metaRead) {
        // Dimensions were not available at 'loadedmetadata': check again now.
        onMetadata();
        return;
      }
      if (!seekDone && !anyFrameAllowed) return;
      if (video.readyState < 2) return; // HAVE_CURRENT_DATA: a frame is available
      const thumb = drawThumbnail(video, result.width, result.height);
      if (thumb) {
        result.thumbnail = thumb;
        finish();
      }
    };

    function onMetadata() {
      if (finished || metaRead) return;
      // On iOS these are already rotation-corrected (a portrait clip reports h > w).
      const w = positiveOrNull(video.videoWidth);
      const h = positiveOrNull(video.videoHeight);
      readDuration();
      if (w === null || h === null) {
        // With a decoded frame and still no size, it is an audio-only or
        // undecodable track: nothing to draw.
        if (video.readyState >= 2) {
          finish();
          return;
        }
        // Some HEVC / HDR clips report 0×0 until the first frame is decoded: keep
        // waiting for 'loadeddata' / 'canplay' (or the overall timeout).
        try {
          video.preload = 'auto';
        } catch (_) {
          /* ignore */
        }
        if (fallbackTimer === null) {
          fallbackTimer = setTimeout(() => {
            if (finished || metaRead) return;
            // Muted inline playback forces iOS to decode; 'playing' / 'timeupdate' re-check.
            try {
              const p = video.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {
              /* ignore */
            }
          }, SEEK_FALLBACK_MS);
        }
        return;
      }
      clearTimeout(fallbackTimer);
      metaRead = true;
      result.width = w;
      result.height = h;

      const target = result.duration !== null ? Math.min(1, result.duration / 2) : 0.1;
      try {
        video.preload = 'auto';
        video.currentTime = target;
      } catch (_) {
        anyFrameAllowed = true;
      }

      fallbackTimer = setTimeout(() => {
        if (finished) return;
        anyFrameAllowed = true;
        tryCapture();
        if (finished) return;
        // Last resort: muted inline playback is allowed without a user gesture and
        // forces iOS to decode frames; 'timeupdate' / 'playing' then trigger a capture.
        try {
          const p = video.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {
          /* ignore */
        }
      }, SEEK_FALLBACK_MS);

      tryCapture();
    }

    overallTimer = setTimeout(finish, OVERALL_TIMEOUT_MS);

    try {
      url = URL.createObjectURL(file);
      video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'metadata';

      listen('loadedmetadata', onMetadata);
      listen('durationchange', () => {
        if (!finished) readDuration();
      });
      listen('seeked', () => {
        seekDone = true;
        tryCapture();
      });
      // Fallbacks for when 'seeked' fires before the frame is decoded (or never fires).
      listen('loadeddata', tryCapture);
      listen('canplay', tryCapture);
      listen('playing', tryCapture);
      listen('timeupdate', tryCapture);
      listen('error', finish);

      video.src = url;
      video.load();
    } catch (_) {
      finish();
    }
  });
}
