import chop from "../assets/audio/chop.wav";
import frying from "../assets/audio/frying.wav";
import ovenReady from "../assets/audio/oven-ready.wav";
import success from "../assets/audio/success.wav";
import error from "../assets/audio/error.wav";
import warning from "../assets/audio/warning.wav";
import tick from "../assets/audio/tick.wav";
import timeUp from "../assets/audio/time-up.wav";
import place from "../assets/audio/place.wav";
import step1 from "../assets/audio/step-1.wav";
import step2 from "../assets/audio/step-2.wav";

const CLIPS = { chop, frying, ovenReady, success, error, warning, tick, timeUp, place, step1, step2 };
const VOLUME_KEY = "kitchen-effects-volume";
export function readEffectsVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    const value = saved === null ? 0.65 : Number(saved);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.65;
  } catch { return 0.65; }
}
export function saveEffectsVolume(value) {
  try { localStorage.setItem(VOLUME_KEY, String(value)); } catch { /* Optional persistence. */ }
  window.dispatchEvent(new CustomEvent("kitchen-audio-volume", { detail: value }));
}

export function preloadGameAudio(scene) {
  Object.entries(CLIPS).forEach(([key, url]) => scene.load.audio(`sfx-${key}`, url));
}

export default class GameAudio {
  constructor(scene) {
    this.scene = scene;
    this.volume = readEffectsVolume();
    this.loops = new Map();
    this.oneshots = new Set();
    this.cooldowns = new Map();
    this.stationStates = new Map();
    this.steps = new Map();
    this.roundId = null;
    this.endsAt = null;
    this.finished = false;
    this.lastSecond = null;
    this.onVolume = (event) => { this.volume = event.detail; };
    this.onVisibility = () => { if (document.hidden) this.stopLoops(); };
    window.addEventListener("kitchen-audio-volume", this.onVolume);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  play(name, volume = 0.4, cooldown = 100) {
    const now = Date.now();
    if (this.finished || document.hidden || this.scene.controls?.menuOpen || this.volume === 0 || volume <= 0 || this.scene.sound.locked ||
        now - (this.cooldowns.get(name) ?? -Infinity) < cooldown) return;
    this.cooldowns.set(name, now);
    const sound = this.scene.sound.add(`sfx-${name}`, { volume: volume * this.volume });
    this.oneshots.add(sound);
    sound.once("complete", () => { this.oneshots.delete(sound); sound.destroy(); });
    sound.play();
  }

  syncRound(state) {
    if (this.roundId !== state.roundId) {
      this.roundId = state.roundId;
      this.lastSecond = null;
      this.warned = false;
      this.finished = false;
    }
    this.endsAt = state.roundEndsAt;
    if (state.roundStatus === "FINISHED") this.finish();
  }

  finish() {
    if (this.finished) return;
    this.play("timeUp", 0.6);
    this.finished = true;
    this.stopLoops();
  }

  distanceVolume(x, y) {
    const players = this.scene.players || [];
    const distance = Math.min(...players.map((p) => Math.hypot(p.body.x - x, p.body.y - y)));
    return Math.max(0, 1 - distance / 220);
  }

  step(id, x, y, moving) {
    if (!moving || this.scene.controls?.menuOpen) return;
    const now = Date.now();
    const state = this.steps.get(id) || { at: -Infinity, alternate: false };
    if (now - state.at < 290) return;
    state.at = now;
    state.alternate = !state.alternate;
    this.steps.set(id, state);
    this.play(state.alternate ? "step1" : "step2", 0.12 * this.distanceVolume(x, y), 60);
  }

  update() {
    const now = Date.now();
    if (this.endsAt && !this.finished) {
      const seconds = Math.max(0, Math.ceil((this.endsAt - now) / 1000));
      if (seconds <= 30 && seconds > 10 && !this.warned) {
        this.play("warning", 0.6);
        this.warned = true;
      }
      if (seconds > 0 && seconds <= 10 && seconds !== this.lastSecond) this.play("tick", 0.55);
      this.lastSecond = seconds;
      if (seconds === 0) this.finish();
    }
    const wanted = new Map();
    for (const cfg of this.scene.stationDefs || []) {
      const station = this.scene.stations[cfg.id];
      const item = station?.itemId ? this.scene.items[station.itemId] : null;
      const previous = this.stationStates.get(cfg.id);
      const status = cfg.kind === "oven" ? item?.bakeStatus : item?.status;
      if (cfg.kind === "oven" && previous?.itemId === item?.id && previous?.status === "raw" && status === "cooked") {
        this.play("ovenReady", 0.65, 250);
      }
      this.stationStates.set(cfg.id, { itemId: item?.id, status });
      const volume = this.distanceVolume(cfg.x, cfg.y);
      if (cfg.kind === "grill" && item && item.status !== "burnt") {
        wanted.set(cfg.id, { name: "frying", volume: volume * 0.3 });
      }
      if (cfg.kind === "cutting-board" && item?.status === "raw" && station.cutState === "cutting") {
        this.play("chop", volume * 0.48, 340);
      }
    }
    const silent = this.finished || document.hidden || this.scene.controls?.menuOpen || this.volume === 0;
    for (const [id, sound] of this.loops) {
      if (silent || !wanted.has(id) || wanted.get(id).volume === 0) {
        sound.destroy();
        this.loops.delete(id);
      }
    }
    if (silent || this.scene.sound.locked) return;
    // At most three nearby continuous sources, with their combined level capped.
    const nearby = [...wanted.entries()].filter(([, value]) => value.volume > 0)
      .sort((a, b) => b[1].volume - a[1].volume).slice(0, 3);
    const nearbyIds = new Set(nearby.map(([id]) => id));
    for (const [id, sound] of this.loops) {
      if (!nearbyIds.has(id)) { sound.destroy(); this.loops.delete(id); }
    }
    for (const [id, value] of nearby) {
      let sound = this.loops.get(id);
      if (!sound) {
        sound = this.scene.sound.add(`sfx-${value.name}`, { loop: true });
        this.loops.set(id, sound);
        sound.play();
      }
      sound.setVolume(value.volume * this.volume / Math.sqrt(nearby.length));
    }
  }

  stopLoops() {
    this.loops.forEach((sound) => sound.destroy());
    this.loops.clear();
  }

  destroy() {
    this.stopLoops();
    this.oneshots.forEach((sound) => sound.destroy());
    this.oneshots.clear();
    window.removeEventListener("kitchen-audio-volume", this.onVolume);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
