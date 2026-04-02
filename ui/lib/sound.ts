/**
 * sound.ts — Web Audio API sound design for SYNTHETIC-BULL terminal.
 *
 * All sounds are generated synthetically — no external files.
 * AudioContext is created lazily on the first user interaction to satisfy
 * browser autoplay policy. Call initAudio() from a click/keydown handler.
 */

let ctx: AudioContext | null = null;
let _muted = false;
let _lastTickMs = 0;

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Create (or resume) the AudioContext. Must be called from a user gesture
 * the first time so the browser allows audio playback.
 */
export function initAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
  } catch {
    // Web Audio not supported in this environment — degrade silently
  }
}

/** Returns true if the AudioContext exists and is running. */
function getCtx(): AudioContext | null {
  if (_muted || !ctx) return null;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// ─── Mute ────────────────────────────────────────────────────────────────────

export function setMuted(val: boolean): void {
  _muted = val;
  try {
    localStorage.setItem("nb_muted", val ? "1" : "0");
  } catch {
    // localStorage unavailable (SSR / private mode) — ignore
  }
}


/** Load persisted mute preference. Call once on client mount. */
export function loadMutePreference(): boolean {
  try {
    return localStorage.getItem("nb_muted") === "1";
  } catch {
    return false;
  }
}

// ─── Primitive: single oscillator burst ──────────────────────────────────────

function burst(
  freq: number,
  vol: number,
  dur: number,
  delay = 0,
  type: OscillatorType = "sine",
): void {
  const c = getCtx();
  if (!c) return;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = type;
  osc.frequency.value = freq;

  const t = c.currentTime + delay;
  // Short attack to avoid click artifacts, then exponential decay
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.start(t);
  osc.stop(t + dur + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

// ─── Primitive: frequency-swept oscillator (for cancel tone) ─────────────────

function sweep(
  freqStart: number,
  freqEnd: number,
  vol: number,
  dur: number,
): void {
  const c = getCtx();
  if (!c) return;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(freqStart, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);

  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);

  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

// ─── Public sound API ────────────────────────────────────────────────────────

/**
 * Trade tape tick — pitched and volumed by trade size.
 * Throttled to ~28/sec so rapid market activity doesn't become noise.
 */
export function tick(size: number): void {
  const now = Date.now();
  if (now - _lastTickMs < 35) return;
  _lastTickMs = now;

  if (size >= 20) {
    // Block trade — deep, authoritative click
    burst(440, 0.07, 0.05);
  } else if (size >= 5) {
    // Medium trade — mid-range tick
    burst(880, 0.05, 0.03);
  } else {
    // Small trade — soft high tick
    burst(1320, 0.03, 0.022);
  }
}

/**
 * Order submitted — clean, neutral confirm tone.
 * Played immediately after a successful placeOrder API call.
 */
export function orderSubmit(): void {
  burst(1047, 0.055, 0.09); // C6 — clean and brief
}

/**
 * Order filled — ascending two-note chime (A5 → E6).
 * Staggered 90ms apart for a pleasant musical feel.
 */
export function orderFill(): void {
  burst(880, 0.07, 0.15); // A5 — root
  burst(1320, 0.05, 0.12, 0.09); // E6 — perfect fifth, delayed
}

/**
 * Order cancelled — descending pitch sweep, short and neutral.
 */
export function orderCancel(): void {
  sweep(660, 330, 0.05, 0.11); // G5 → E4 — descending half-octave
}
