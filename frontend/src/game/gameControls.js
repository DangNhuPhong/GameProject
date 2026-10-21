import Phaser from "phaser";

// =====================================
// ĐIỀU KHIỂN CẢM ỨNG: joystick + nút E, Q, zoom
// (Menu / Settings đã chuyển sang Game.jsx)
// =====================================

const STORAGE_KEY = "kitchen-control-mode"; // "keyboard" | "joystick"
const DEAD_ZONE = 0.18;
const STICK_TRAVEL = 46;

/** Chế độ đã lưu; lần đầu: thiết bị cảm ứng → joystick, còn lại → bàn phím. */
export function loadControlMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "keyboard" || saved === "joystick") return saved;
  } catch {
    // bỏ qua
  }

  return window.matchMedia?.("(pointer: coarse)").matches
    ? "joystick"
    : "keyboard";
}

export function saveControlMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // bỏ qua
  }
}

const CSS = `
.kc-root{position:fixed;inset:0;z-index:70;pointer-events:none;user-select:none;-webkit-user-select:none;
  -webkit-touch-callout:none;font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif;font-weight:700;color:#fff}
.kc-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.kc-hidden{display:none !important}

.kc-glass{color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.45);
  background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.08));
  border:1px solid rgba(255,255,255,.35);
  backdrop-filter:blur(12px) saturate(170%);-webkit-backdrop-filter:blur(12px) saturate(170%);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.7),0 8px 24px rgba(0,0,0,.35)}

.kc-touch{position:absolute;inset:0;pointer-events:none}
.kc-stick{position:absolute;left:calc(28px + env(safe-area-inset-left,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));
  width:132px;height:132px;border-radius:50%;pointer-events:auto;touch-action:none}
.kc-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
  background:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.85);box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:none}

.kc-actions{position:absolute;right:calc(24px + env(safe-area-inset-right,0px));bottom:calc(64px + env(safe-area-inset-bottom,0px));
  display:flex;flex-direction:column;align-items:flex-end;gap:12px;pointer-events:none}
.kc-row{display:flex;align-items:flex-end;gap:14px}
.kc-round{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;
  border-radius:50%;font:inherit;cursor:pointer;pointer-events:auto;touch-action:none;transition:transform .12s,opacity .2s}
.kc-round:active{transform:scale(.9)}
.kc-e{width:88px;height:88px;font-size:2rem}
.kc-q{width:60px;height:60px;font-size:1.3rem}
.kc-zoom{width:46px;height:46px;font-size:1.1rem}
.kc-cap{font-size:.6rem;line-height:1;opacity:.9}
.kc-dim{opacity:.55}
.kc-pill{max-width:60vw;padding:6px 14px;border-radius:999px;font-size:.85rem;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;pointer-events:none}
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === "button") node.tabIndex = -1; // không giữ focus bàn phím của game
  return node;
}

/**
 * opts: {
 *   onInteract, onDrop, onZoom,
 *   getMode()    -> "keyboard" | "joystick"   (lấy từ Game.jsx)
 *   isMenuOpen() -> boolean                   (lấy từ Game.jsx)
 *   onModeChange?(mode)
 * }
 */
export function createGameControls(scene, opts = {}) {
  const { onInteract, onDrop, onZoom, getMode, isMenuOpen, onModeChange } =
    opts;

  const menuOpen = () => !!isMenuOpen?.();

  let stick = null; // { id, x, y }
  let lastLabel = undefined;
  let appliedMode = null;

  const root = el("div", "kc-root");
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  root.appendChild(el("style")).textContent = CSS;
  document.body.appendChild(root);

  // ---------------------------------
  // JOYSTICK
  // ---------------------------------
  const touch = el("div", "kc-touch");

  const base = el("div", "kc-stick kc-glass");
  const knob = el("div", "kc-knob");
  base.appendChild(knob);

  const releaseStick = () => {
    stick = null;
    knob.style.transform = "translate(0,0)";
  };

  const updateStick = (e) => {
    const r = base.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / STICK_TRAVEL;
    let dy = (e.clientY - (r.top + r.height / 2)) / STICK_TRAVEL;

    const len = Math.hypot(dx, dy);

    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    knob.style.transform = `translate(${dx * STICK_TRAVEL}px,${dy * STICK_TRAVEL}px)`;

    const mag = Math.hypot(dx, dy);

    if (mag < DEAD_ZONE) {
      stick.x = 0;
      stick.y = 0;
      return;
    }

    const k = Math.min(1, (mag - DEAD_ZONE) / (1 - DEAD_ZONE)) / mag;
    stick.x = dx * k;
    stick.y = dy * k;
  };

  base.addEventListener("pointerdown", (e) => {
    if (stick) return;
    e.preventDefault();
    stick = { id: e.pointerId, x: 0, y: 0 };
    base.setPointerCapture(e.pointerId);
    updateStick(e);
  });

  base.addEventListener("pointermove", (e) => {
    if (stick && e.pointerId === stick.id) updateStick(e);
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
    base.addEventListener(type, (e) => {
      if (stick && e.pointerId === stick.id) releaseStick();
    }),
  );

  // ---------------------------------
  // NÚT E / Q / ZOOM
  // ---------------------------------
  const press = (btn, fn) =>
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!menuOpen() && fn) fn();
    });

  const actions = el("div", "kc-actions");

  const zoomBtn = el("button", "kc-round kc-zoom kc-glass", "🔍");
  zoomBtn.setAttribute("aria-label", "Zoom");
  press(zoomBtn, onZoom);

  const pill = el("div", "kc-pill kc-glass kc-hidden");

  const row = el("div", "kc-row");

  const qBtn = el("button", "kc-round kc-q kc-glass kc-hidden");
  qBtn.append("Q", el("span", "kc-cap", "Drop"));
  press(qBtn, onDrop);

  const eBtn = el("button", "kc-round kc-e kc-glass kc-dim", "E");
  eBtn.setAttribute("aria-label", "Interact");
  press(eBtn, onInteract);

  row.append(qBtn, eBtn);
  actions.append(zoomBtn, pill, row);
  touch.append(base, actions);

  root.append(touch);

  // ---------------------------------
  // ĐỒNG BỘ VỚI Game.jsx (gọi mỗi frame từ scene.update)
  // ---------------------------------
  function applyMode(notify) {
    const mode = getMode ? getMode() : "keyboard";

    if (mode === appliedMode) return;

    appliedMode = mode;
    touch.classList.toggle("kc-hidden", mode !== "joystick");

    if (mode !== "joystick") releaseStick();
    if (notify && onModeChange) onModeChange(mode);
  }

  applyMode(false);

  const sync = () => {
    applyMode(true);

    // Mở menu giữa lúc đang kéo joystick → thả núm ra
    if (menuOpen() && stick) releaseStick();
  };

  // ---------------------------------
  // CLEANUP
  // ---------------------------------
  const destroy = () => {
    root.remove();
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  scene.events.once(Phaser.Scenes.Events.DESTROY, destroy);

  // ---------------------------------
  // API cho scene
  // ---------------------------------
  return {
    get mode() {
      return getMode ? getMode() : "keyboard";
    },

    get menuOpen() {
      return menuOpen();
    },

    sync,

    getVector() {
      if (this.mode !== "joystick" || menuOpen() || !stick) return null;
      return { x: stick.x, y: stick.y };
    },

    setActionLabel(label) {
      if (label === lastLabel) return;

      lastLabel = label;
      pill.textContent = label || "";
      pill.classList.toggle("kc-hidden", !label);
      eBtn.classList.toggle("kc-dim", !label);
    },

    setDropItem(type) {
      qBtn.classList.toggle("kc-hidden", !type);
    },

    destroy,
  };
}
