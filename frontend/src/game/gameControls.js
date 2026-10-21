import Phaser from "phaser";

// =====================================
// ĐIỀU KHIỂN TRONG GAME: menu + settings + joystick/nút E, Q, zoom
// Dùng DOM thuần (giống HUD của KitchenScene), mọi class có tiền tố kc-
// =====================================

const STORAGE_KEY = "kitchen-control-mode"; // "keyboard" | "joystick"
const DEAD_ZONE = 0.18; // vùng chết của joystick (0..1)
const STICK_TRAVEL = 46; // px núm joystick được kéo ra khỏi tâm

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

/* ----- Nút menu ----- */
.kc-menu-btn{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:calc(14px + env(safe-area-inset-left,0px));
  width:46px;height:46px;padding:0;border-radius:50%;font:inherit;font-size:1.25rem;cursor:pointer;pointer-events:auto}

/* ----- Joystick + nút cảm ứng ----- */
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

/* ----- Menu / Settings ----- */
.kc-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(0,0,0,.45);pointer-events:auto}
.kc-panel{width:min(100%,340px);display:flex;flex-direction:column;gap:10px;padding:22px;border-radius:28px}
.kc-title{font-size:1.3rem;text-align:center;margin-bottom:4px}
.kc-label{font-size:.85rem;opacity:.9;margin-top:4px}
.kc-note{font-size:.78rem;font-weight:600;line-height:1.5;opacity:.9}
.kc-btn{padding:13px 20px;font:inherit;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.45);
  background:linear-gradient(135deg,rgba(255,255,255,.32),rgba(255,255,255,.1));
  border:1px solid rgba(255,255,255,.4);border-radius:999px;cursor:pointer;transition:background .2s,transform .12s}
.kc-btn:hover{background:linear-gradient(135deg,rgba(255,255,255,.45),rgba(255,255,255,.18))}
.kc-btn:active{transform:scale(.97)}
.kc-danger{background:linear-gradient(135deg,rgba(255,90,80,.45),rgba(255,90,80,.15));border-color:rgba(255,160,150,.5)}
.kc-seg{display:flex;gap:6px;padding:4px;border-radius:999px;background:rgba(0,0,0,.28)}
.kc-seg-btn{flex:1;padding:10px;border:0;border-radius:999px;background:transparent;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.kc-seg-btn.kc-on{background:linear-gradient(135deg,#ffd54a,#f0a030);color:#3a2300;text-shadow:none}
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === "button") node.tabIndex = -1; // không giữ focus bàn phím của game
  return node;
}

/**
 * Tạo menu + điều khiển cảm ứng cho một scene.
 * opts: { onInteract, onDrop, onZoom, onLeave?, onModeChange? }
 */
export function createGameControls(scene, opts = {}) {
  const { onInteract, onDrop, onZoom, onLeave, onModeChange } = opts;

  let mode = loadControlMode();
  let menuOpen = false;
  let menuView = "main"; // "main" | "settings"
  let stick = null; // { id, x, y } khi đang chạm joystick
  let lastLabel = undefined;

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

    // Co giãn lại để ngay sau vùng chết là bắt đầu từ 0
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
  // NÚT E / Q / ZOOM (bấm bằng pointerdown cho phản hồi nhanh)
  // ---------------------------------
  const press = (btn, fn) =>
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!menuOpen && fn) fn();
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

  // ---------------------------------
  // MENU / SETTINGS
  // ---------------------------------
  const menuBtn = el("button", "kc-menu-btn kc-glass", "☰");
  menuBtn.setAttribute("aria-label", "Menu");

  const overlay = el("div", "kc-overlay kc-hidden");
  const panel = el("div", "kc-panel kc-glass");
  overlay.appendChild(panel);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeMenu();
  });

  const button = (text, fn, extra = "") => {
    const b = el("button", `kc-btn ${extra}`.trim(), text);
    b.addEventListener("click", fn);
    return b;
  };

  function applyMode() {
    touch.classList.toggle("kc-hidden", mode !== "joystick");
    if (mode !== "joystick") releaseStick();
  }

  function setMode(value) {
    if (value === mode) return;

    mode = value;

    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // bỏ qua
    }

    applyMode();
    if (onModeChange) onModeChange(mode);
    render();
  }

  function render() {
    panel.textContent = "";

    if (menuView === "main") {
      panel.append(
        el("div", "kc-title", "Menu"),
        button("Resume", closeMenu),
        button("Settings", () => {
          menuView = "settings";
          render();
        }),
      );

      if (onLeave) {
        panel.append(
          button(
            "Leave room",
            () => {
              closeMenu();
              onLeave();
            },
            "kc-danger",
          ),
        );
      }

      return;
    }

    const seg = el("div", "kc-seg");

    [
      ["keyboard", "Keyboard"],
      ["joystick", "Joystick"],
    ].forEach(([value, text]) => {
      const b = el("button", `kc-seg-btn${mode === value ? " kc-on" : ""}`, text);
      b.addEventListener("click", () => setMode(value));
      seg.appendChild(b);
    });

    panel.append(
      el("div", "kc-title", "Settings"),
      el("div", "kc-label", "Controls"),
      seg,
      el(
        "div",
        "kc-note",
        mode === "keyboard"
          ? "Move: W A S D · Interact: E · Drop: Q · Zoom: Z or mouse wheel · Menu: Esc · Fullscreen: F"
          : "Drag the joystick to move. Use the E and Q buttons on the right, and 🔍 to zoom.",
      ),
      button("Back", () => {
        menuView = "main";
        render();
      }),
    );
  }

  function openMenu() {
    menuOpen = true;
    menuView = "main";
    releaseStick();
    render();
    overlay.classList.remove("kc-hidden");
  }

  function closeMenu() {
    menuOpen = false;
    overlay.classList.add("kc-hidden");
  }

  function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
  }

  menuBtn.addEventListener("click", toggleMenu);

  root.append(touch, menuBtn, overlay);
  applyMode();

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
      return mode;
    },

    get menuOpen() {
      return menuOpen;
    },

    /** Vector joystick {x, y} (-1..1), hoặc null nếu không dùng joystick lúc này. */
    getVector() {
      if (mode !== "joystick" || menuOpen || !stick) return null;
      return { x: stick.x, y: stick.y };
    },

    /** Chữ hiện trên nút E (vd "Chop", "Serve dish"); null = không có hành động. */
    setActionLabel(label) {
      if (label === lastLabel) return;

      lastLabel = label;
      pill.textContent = label || "";
      pill.classList.toggle("kc-hidden", !label);
      eBtn.classList.toggle("kc-dim", !label);
    },

    /** Truyền loại item đang cầm để hiện nút Q; null = ẩn. */
    setDropItem(type) {
      qBtn.classList.toggle("kc-hidden", !type);
    },

    toggleMenu,
    closeMenu,
    destroy,
  };
}