import Phaser from "phaser";
import GameAudio, { preloadGameAudio } from "./GameAudio";
import { socket } from "../services/socket";
import LocalTransport from "./LocalTransport";
import { getMapConfig } from "./maps";
import { readLayout, getProp } from "./mapLoader";
import { STATION_BEHAVIORS } from "./stationBehaviors";

import itemsUrl from "../assets/items-pixel-v2.png";
import dishesUrl from "../assets/dishes-pixel.png";
import cookedPizzaUrl from "../assets/pizza-cooked-pixel.png";

import chefBlueUrl from "../assets/chef-chibi-brown.png";
import chefOrangeUrl from "../assets/chef-chibi-orange.png";
import { createGameControls } from "./gameControls";

// =====================================
// CHẾ ĐỘ CHƠI
//
//   single      : 1 người, chạy offline (GameController ngay trong trình duyệt)
//   coop-local  : 2 người chung 1 bàn phím, chạy offline
//   coop-online : 1 người mỗi máy, đi qua server (socket)
// =====================================

export const GAME_MODES = {
  single: { offline: true, locals: ["p1"] },
  "coop-local": { offline: true, locals: ["p1", "p2"] },
  "coop-online": { offline: false, locals: ["p1"] },
};

// Tên phím theo Phaser.Input.Keyboard.KeyCodes
export const KEYMAPS = {
  p1: {
    up: "W",
    down: "S",
    left: "A",
    right: "D",
    interact: "E",
    drop: "Q",
    labels: { interact: "E", drop: "Q" },
  },
  p2: {
    up: "UP",
    down: "DOWN",
    left: "LEFT",
    right: "RIGHT",
    interact: "ENTER",
    drop: "SHIFT",
    labels: { interact: "Enter", drop: "Shift" },
  },
};

// Chơi 1 người: cho phép dùng thêm phím mũi tên để di chuyển
const ARROW_KEYS = { up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT" };

const PLAYER_STYLE = {
  p1: { spriteKey: "chef-blue", label: "P1", color: "#60a5fa" },
  p2: { spriteKey: "chef-orange", label: "P2", color: "#fb923c" },
};

// Hitbox chân người chơi
const FEET_HALF_W = 5;
const FEET_TOP = 3;
const FEET_BOTTOM = 9; // = CHEF_FOOT_OFFSET

const PLAYER_SPEED = 75;

const ZOOM_STORAGE_KEY = "kitchen-zoom-mode";
const NEAR_ZOOM_SCALE = 0.6;

function loadZoomMode() {
  try {
    return localStorage.getItem(ZOOM_STORAGE_KEY) === "near" ? "near" : "far";
  } catch {
    return "far";
  }
}

const CAMERA_LERP = 0.15;

const PLAYER_BLOCK_W = 10;
const PLAYER_BLOCK_H = 8;

const INTERP_DELAY_MS = 100;
const POSITION_SEND_INTERVAL = 50;

// ⚠ Phải khớp với server
const INTERACT_RANGE = 20;
const PICKUP_RANGE = 16;

// Số thứ tự ô trong items.png (đếm từ trái sang phải, hết hàng thì xuống hàng dưới)
const ITEM_FRAMES = {
  "meat:raw": 0,
  "meat:cooked": 1,
  "meat:burnt": 2,
  "tomato:raw": 3,
  "tomato:chopped": 4,
  "salad:raw": 5,
  "salad:chopped": 6,
  "bread:raw": 7,
  "dough:raw": 8,
  "plate:empty": 9,
  "plate:full": 10,
};

function itemFrame(type, status, ingredients = []) {
  if (type === "plate") {
    return ITEM_FRAMES[ingredients.length ? "plate:full" : "plate:empty"];
  }

  return ITEM_FRAMES[`${type}:${status}`] ?? ITEM_FRAMES[`${type}:raw`] ?? 0;
}

// Build plate textures from the actual contents, shared by held and placed items.
function setItemAppearance(scene, sprite, item) {
  if (item.type !== "plate") {
    sprite.setTexture("items", itemFrame(item.type, item.status));
    sprite.clearTint();
    return;
  }
  const ingredients = (item.ingredients || []).map((ingredient) =>
    typeof ingredient === "string"
      ? { type: ingredient, status: "raw" }
      : { type: ingredient.type ?? ingredient.ingredientType, status: ingredient.status ?? "raw" },
  );
  const exact = (expected) => ingredients.length === expected.length &&
    expected.every(([type, status]) => ingredients.some((i) => i.type === type && (!status || i.status === status)));
  const pizza = exact([["dough"], ["tomato", "chopped"]]);
  if (pizza) {
    if (item.bakeStatus === "burnt") {
      sprite.setTexture("dishes", 0);
      sprite.clearTint();
      return;
    }
    if (item.bakeStatus === "cooked") {
      sprite.setTexture("pizza-cooked");
    } else {
      sprite.setTexture("items", ITEM_FRAMES["plate:full"]);
    }
    sprite.clearTint();
    return;
  }
  const burger = exact([["bread"], ["meat", "cooked"], ["tomato", "chopped"]]);
  if (burger) {
    sprite.setTexture("dishes", 1);
    sprite.clearTint();
    return;
  }
  const key = `plate-contents:${JSON.stringify(ingredients.map((i) => [i.type, i.status]).sort())}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 128, 128);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    const draw = (frameNumber, x, y, w, h) => {
      const frame = scene.textures.getFrame("items", frameNumber);
      ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, x, y, w, h);
    };
    draw(ITEM_FRAMES["plate:empty"], 0, 0, 128, 128);
    {
      const count = ingredients.length;
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const size = count === 1 ? 84 : Math.min(58, 92 / columns);
      ingredients.forEach((ingredient, index) => {
        const row = Math.floor(index / columns);
        const inRow = Math.min(columns, count - row * columns);
        const x = 64 - inRow * size / 2 + (index % columns) * size;
        const y = 64 - rows * size / 2 + row * size;
        draw(itemFrame(ingredient.type, ingredient.status), x, y, size, size);
      });
    }
    texture.refresh();
  }
  sprite.setTexture(key);
  sprite.clearTint();
}

// =====================================
// Chibi sprites: four animation frames, rows facing down, up, and left.
// =====================================

const CHEF_FRAME_W = 128;
const CHEF_FRAME_H = 160;
const CHEF_SCALE = 0.1875;
const CHEF_FOOT_OFFSET = 9;
const CHEF_ROW = { down: 0, up: 1, side: 2 };

function createChefAnims(scene, key) {
  Object.entries(CHEF_ROW).forEach(([dir, row]) => {
    const base = row * 4;

    if (!scene.anims.exists(`${key}-idle-${dir}`)) {
      scene.anims.create({
        key: `${key}-idle-${dir}`,
        frames: [{ key, frame: base }],
        frameRate: 1,
      });
    }

    if (!scene.anims.exists(`${key}-walk-${dir}`)) {
      scene.anims.create({
        key: `${key}-walk-${dir}`,
        frames: [base + 1, base + 0, base + 3, base + 0].map((frame) => ({
          key,
          frame,
        })),
        frameRate: 8,
        repeat: -1,
      });
    }
  });
}

function heldItemOffset(facing, facingRight) {
  if (facing === "up") return { x: 5, y: 3, depth: 4 };
  if (facing === "side") return { x: facingRight ? 6 : -6, y: 3, depth: 6 };
  return { x: 0, y: 3, depth: 6 };
}

function chefFacing(dx, dy, current) {
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) >= Math.abs(dy)) return "side";
  return dy > 0 ? "down" : "up";
}

// Vẽ hình elip bằng từng pixel (có viền), dùng làm texture: luôn sắc nét khi zoom
function makePixelDisc(scene, key, w, h, outline) {
  if (scene.textures.exists(key)) return;

  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();

  const inside = (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (y + 0.5 - h / 2) / (h / 2);
    return dx * dx + dy * dy <= 1;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;

      const edge =
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1);

      ctx.fillStyle = edge && outline ? outline : "#ffffff";
      ctx.fillRect(x, y, 1, 1);
    }
  }

  tex.refresh();
}

function createPixelTextures(scene) {
  makePixelDisc(scene, "px-shadow", 12, 4, null);
}

// =====================================
// GAME
// =====================================

/**
 * Tạo Phaser scene.
 * @param {object} opts
 * @param {object} opts.user      người chơi hiện tại ({ id })
 * @param {string} opts.roomCode  mã phòng (chỉ dùng khi coop-online)
 * @param {string} opts.mapId
 * @param {"single"|"coop-local"|"coop-online"} opts.mode
 * @param {object} opts.ui        { getMode, isMenuOpen, toggleMenu }
 */
export function createKitchenScene({
  user,
  roomCode,
  mapId,
  mode = "coop-online",
  ui,
  durationMs = null,
  onRoundFinished = null,
  onClockSync = null,
}) {
  const mapCfg = getMapConfig(mapId);
  const modeCfg = GAME_MODES[mode] ?? GAME_MODES["coop-online"];

  // Phòng nội bộ cho chế độ offline
  const roomId = modeCfg.offline ? "LOCAL" : roomCode;
  const multiLocal = modeCfg.locals.length > 1;

  const userIdFor = (slot) => (multiLocal ? `${user.id}:${slot}` : user.id);

  return class KitchenScene extends Phaser.Scene {
    constructor() {
      super("KitchenScene");

      this.mapCfg = mapCfg;
      this.mode = mode;

      this.net = null; // LocalTransport hoặc socket
      this.players = []; // người điều khiển trên máy này (1 hoặc 2)
      this.otherPlayers = {}; // người chơi từ xa (chỉ coop-online)

      // Co-op cùng máy: luôn nhìn toàn map nên khoá zoom
      this.zoomLocked = multiLocal;
      this.zoomMode = "far";

      this.items = {};
      this.stations = {};

      this.ordersOwner = null;

      this.score = 0;

      this.socketHandlers = [];
    }

    // =====================================
    // PRELOAD
    // =====================================

    preload() {
      preloadGameAudio(this);
      const cfg = this.mapCfg;

      // Offline dùng file map đóng gói sẵn, online lấy từ server
      const mapUrl = modeCfg.offline
        ? (cfg.localMapUrl ?? cfg.mapUrl)
        : cfg.mapUrl;

      this.load.tilemapTiledJSON(cfg.id, mapUrl);

      if (cfg.image) {
        this.load.image(`${cfg.id}:bg`, cfg.image.url);
      }

      Object.entries(cfg.tilesets).forEach(([name, url]) =>
        this.load.image(`${cfg.id}:${name}`, url),
      );

      this.load.spritesheet("chef-blue", chefBlueUrl, {
        frameWidth: CHEF_FRAME_W,
        frameHeight: CHEF_FRAME_H,
      });

      this.load.spritesheet("chef-orange", chefOrangeUrl, {
        frameWidth: CHEF_FRAME_W,
        frameHeight: CHEF_FRAME_H,
      });

      this.load.spritesheet("items", itemsUrl, {
        frameWidth: 128,
        frameHeight: 128,
      });
      this.load.spritesheet("dishes", dishesUrl, {
        frameWidth: 128,
        frameHeight: 128,
      });
      this.load.image("pizza-cooked", cookedPizzaUrl);
    }

    applyControlMode() {
      if (this.hudZoom) {
        this.hudZoom.style.display =
          this.zoomLocked || this.controls.mode === "joystick"
            ? "none"
            : "block";
      }
    }

    // =====================================
    // CREATE
    // =====================================

    create() {
      this.zoomMode = this.zoomLocked ? "far" : loadZoomMode();
      createPixelTextures(this);

      // =================================
      // TILEMAP (tự tạo mọi layer)
      // =================================

      const cfg = this.mapCfg;
      const map = this.make.tilemap({ key: cfg.id });

      const tilesets = map.tilesets.map((ts) =>
        map.addTilesetImage(ts.name, `${cfg.id}:${ts.name}`),
      );

      this.worldW = map.widthInPixels;
      this.worldH = map.heightInPixels;
      this.collisionLayers = [];

      this.input.keyboard.on("keydown-ESC", () => {
        if (this.ordersEl) this.closeOrders();
        else ui?.toggleMenu();
      });

      // Ảnh nền nguyên bản (nếu map có)
      if (cfg.image) {
        this.add
          .image(0, 0, `${cfg.id}:bg`)
          .setOrigin(0, 0)
          .setDisplaySize(cfg.image.width, cfg.image.height)
          .setDepth(-1);
      }

      map.layers.forEach((data, i) => {
        const depth = getProp(data.properties, "depth") ?? i;
        const layer = map.createLayer(data.name, tilesets).setDepth(depth);

        // Layer chỉ dùng để va chạm thì ẩn đi
        if (getProp(data.properties, "hidden")) {
          layer.setVisible(false);
        }

        if (getProp(data.properties, "collides")) {
          this.collisionLayers.push(layer);
        }
      });

      // Chưa đặt property "collides" cho layer nào → tạm dùng layer "counters"
      if (this.collisionLayers.length === 0) {
        const fallback = map.getLayer("counters")?.tilemapLayer;

        if (fallback) {
          this.collisionLayers.push(fallback);
        }
      }

      // =================================
      // LAYOUT + LUẬT TRẠM
      // =================================

      this.layout = readLayout(map);
      this.audioEffects = new GameAudio(this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audioEffects.destroy());

      this.stationDefs = this.layout.stations
        .filter((s) => STATION_BEHAVIORS[s.kind])
        .map((s) => ({ ...s, ...STATION_BEHAVIORS[s.kind] }));

      this.plateStation =
        this.layout.stations.find((s) => s.kind === "plate-station") || null;

      const spawn = this.layout.spawn;

      // =================================
      // NETWORK / LOCAL TRANSPORT
      // =================================

      if (modeCfg.offline) {
        // File Tiled JSON gốc nằm trong cache của Phaser
        const mapJson = this.cache.tilemap.get(cfg.id).data;

        this.net = new LocalTransport({
          roomCode: roomId,
          mapId: cfg.id,
          mapJson,
          durationMs,
        });
      } else {
        this.net = socket;
      }

      // =================================
      // NHÂN VẬT CỦA NGƯỜI CHƠI TRÊN MÁY NÀY
      // =================================

      createChefAnims(this, "chef-blue");
      createChefAnims(this, "chef-orange");

      this.players = modeCfg.locals.map((slot, index) =>
        this.createLocalPlayer(slot, index, spawn),
      );

      // =================================
      // HUD
      // =================================

      this.createHud();

      this.controls = createGameControls(this, {
        // Nút cảm ứng chỉ điều khiển người chơi 1
        onInteract: () => this.handleInteract(this.players[0]),
        onDrop: () => this.dropItem(this.players[0]),
        onZoom: () =>
          this.setZoomMode(this.zoomMode === "near" ? "far" : "near"),
        // Co-op cùng máy: chỉ dùng bàn phím
        getMode: () => (multiLocal ? "keyboard" : ui.getMode()),
        isMenuOpen: ui.isMenuOpen,
        onModeChange: () => this.applyControlMode(),
      });
      this.applyControlMode();

      this.stationBar = this.add.graphics().setDepth(7);

      // Camera đi theo 1 điểm: người chơi 1, hoặc trung điểm 2 người
      this.camTarget = this.add
        .rectangle(this.players[0].body.x, this.players[0].body.y, 1, 1)
        .setVisible(false);

      this.setupCamera();

      // =================================
      // KEYBOARD
      // =================================

      const KC = Phaser.Input.Keyboard.KeyCodes;
      const kb = this.input.keyboard;

      this.players.forEach((p) => {
        const km = p.keymap;

        p.keys = {
          up: kb.addKey(KC[km.up]),
          down: kb.addKey(KC[km.down]),
          left: kb.addKey(KC[km.left]),
          right: kb.addKey(KC[km.right]),
          drop: kb.addKey(KC[km.drop]),
        };

        // Chơi 1 người: thêm phím mũi tên làm phím di chuyển phụ
        if (!multiLocal) {
          p.altKeys = {
            up: kb.addKey(KC[ARROW_KEYS.up]),
            down: kb.addKey(KC[ARROW_KEYS.down]),
            left: kb.addKey(KC[ARROW_KEYS.left]),
            right: kb.addKey(KC[ARROW_KEYS.right]),
          };
        }

        kb.addKey(KC[km.interact]);

        kb.on(`keydown-${km.interact}`, (event) => {
          if (event && event.repeat) return;
          this.handleInteract(p);
        });
      });

      kb.on("keydown-Z", (event) => {
        if (event && event.repeat) return;
        this.setZoomMode(this.zoomMode === "near" ? "far" : "near");
      });

      this.input.on("wheel", (pointer, over, dx, dy) => {
        this.setZoomMode(dy < 0 ? "near" : "far");
      });

      // =================================
      // EVENTS (socket hoặc LocalTransport: cùng một giao diện)
      // =================================

      const net = this.net;

      const on = (eventName, handler) => {
        net.on(eventName, handler);
        this.socketHandlers.push([eventName, handler]);
      };

      const cleanupNet = () => {
        this.socketHandlers.forEach(([eventName, handler]) => {
          net.off(eventName, handler);
        });
        this.socketHandlers = [];
        this.closeOrders();

        // Local: dừng bộ đếm thời gian của game
        if (modeCfg.offline) net.destroy();
      };

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupNet);
      this.events.once(Phaser.Scenes.Events.DESTROY, cleanupNet);

      on("game-state", (state) => {
        this.audioEffects.syncRound(state);
        if (typeof onClockSync === "function") onClockSync(state.roundEndsAt);
        if (
          state.roundStatus === "FINISHED" &&
          typeof onRoundFinished === "function"
        ) {
          onRoundFinished({
            roundId: state.roundId,
            mapId: state.mapId,
            score: state.finalScore,
            expiredPenalties: state.expiredPenalties,
          });
        }
      });
      on("map-finished", (result) => {
        this.audioEffects.finish();
        if (typeof onRoundFinished === "function") onRoundFinished(result);
      });

      on("game-state", (state) => {
        if (!state) return;

        Object.values(this.items).forEach((item) => {
          if (item.sprite) item.sprite.destroy();
        });

        this.items = {};
        this.players.forEach((p) => {
          p.heldItemId = null;
        });

        if (Array.isArray(state.items)) {
          state.items.forEach((itemData) => this.upsertItem(itemData));
        }

        this.stations = {};

        if (Array.isArray(state.stations)) {
          state.stations.forEach((stationData) =>
            this.setStationState(stationData),
          );
        }
      });

      [
        "item-created",
        "item-picked",
        "item-dropped",
        "plate-created",
        "plate-picked",
        "plate-dropped",
      ].forEach((eventName) => {
        on(eventName, (payload) => {
          const item = payload?.item || payload?.plate;
          if (item) this.audioEffects.play("place", 0.3);
          if (item) this.upsertItem(item);
        });
      });

      on("station-updated", ({ station, item }) => {
        if (station && this.stations[station.id]?.itemId !== station.itemId) {
          this.audioEffects.play("place", 0.3);
        }
        if (item) this.upsertItem(item);
        if (station) this.setStationState(station);
      });

      // Danh sách đơn thay đổi (đơn mới / hết hạn / hoàn thành): chỉ cập nhật dữ liệu,
      // nếu bảng đang mở thì vẽ lại. KHÔNG tự bật bảng lên.
      on("orders-updated", ({ orders, score }) => {
        this.currentOrders = orders || [];
        this.ordersReceivedAt = Date.now();

        if (typeof score === "number") this.setScore(score);
        if (this.ordersEl) this.renderOrders();
      });

      // Trả lời riêng cho người bấm E ở order station → mở bảng
      on("orders-list", ({ orders }) => {
        this.currentOrders = orders || [];
        this.ordersReceivedAt = Date.now();
        this.openOrders();
      });

      // Vật phẩm bị xoá (vứt thùng rác / phục vụ xong) → hết bị "dính tay"
      on("item-removed", ({ itemId }) => {
        this.removeItemVisual(itemId);
      });

      on("order-expired", ({ order, penalty, score }) => {
        this.audioEffects.play("error", 0.45);
        if (typeof score === "number") this.setScore(score);
        this.showToast(
          `${order?.name || "Order"} expired! -${penalty ?? 0}`,
          "#ef4444",
        );
      });

      on("order-completed", ({ order, points, score, userId: who }) => {
        this.audioEffects.play("success", 0.55);
        if (typeof score === "number") this.setScore(score);

        const name = order?.name || "dish";
        const localPlayer = this.playerByUserId(who);

        let text;

        if (localPlayer && multiLocal) {
          text = `${localPlayer.label} served ${name}! +${points ?? 0}`;
        } else if (localPlayer) {
          text = `${name} served! +${points ?? 0}`;
        } else {
          text = `Teammate served ${name}! +${points ?? 0}`;
        }

        this.showToast(text, "#22c55e");
      });

      on("interaction-error", ({ message }) => {
        this.audioEffects.play("error", 0.4);
        console.warn("Server:", message);
        this.showToast(message, "#ef4444");
      });

      on("player-position", ({ userId, x, y, t }) => {
        if (this.playerByUserId(userId)) return;
        this.updateOtherPlayer(userId, x, y, t);
      });

      on("player-joined", ({ userId }) => {
        if (this.playerByUserId(userId)) return;
        console.log("Player joined:", userId);
      });

      on("player-left", ({ userId }) => {
        const other = this.otherPlayers[userId];
        if (!other) return;

        other.player.destroy();
        other.shadow.destroy();

        delete this.otherPlayers[userId];
      });

      on("disconnect", () => {
        this.players.forEach((p) => {
          p.heldItemId = null;
        });
      });

      const joinRoom = () => {
        net.emit("join-room", {
          roomCode: roomId,
          userId: this.players[0].userId,
          mapId,
        });
      };

      on("connect", joinRoom);

      if (!net.connected) {
        net.connect();
      } else {
        joinRoom();
      }
    }

    // =====================================
    // NGƯỜI CHƠI CỤC BỘ
    // =====================================

    createLocalPlayer(slot, index, spawn) {
      const style = PLAYER_STYLE[slot];
      const pos = this.findSpawnFor(index, spawn);

      const shadow = this.add
        .image(pos.x, pos.y + 8, "px-shadow")
        .setTint(0x000000)
        .setAlpha(0.25)
        .setDepth(4);

      // Hình chữ nhật ẩn: giữ toạ độ logic (x, y) của người chơi
      const body = this.add
        .rectangle(pos.x, pos.y, 12, 14, 0x2563eb)
        .setVisible(false);

      const sprite = this.add
        .sprite(pos.x, pos.y + CHEF_FOOT_OFFSET, style.spriteKey, 0)
        .setOrigin(0.5, 1)
        .setScale(CHEF_SCALE)
        .setDepth(5);

      return {
        slot,
        index,
        userId: userIdFor(slot),
        keymap: KEYMAPS[slot],
        label: style.label,
        color: style.color,
        spriteKey: style.spriteKey,

        body,
        sprite,
        shadow,

        facing: "down",
        heldItemId: null,
        heldItemVisual: null,
        pendingPlateAdd: false,

        keys: null,
        altKeys: null,

        lastSentX: null,
        lastSentY: null,
        lastSentAt: 0,

        hudHint: null,
        hudHintVisible: false,
        hintSig: null,
      };
    }

    // Người thứ 2 đứng cạnh người thứ nhất (không đè lên, không vào tường)
    findSpawnFor(index, spawn) {
      if (index === 0) return { x: spawn.x, y: spawn.y };

      const offsets = [
        [14, 0],
        [-14, 0],
        [0, 14],
        [0, -14],
        [10, 10],
        [-10, 10],
      ];

      for (const [ox, oy] of offsets) {
        if (!this.isBlocked(spawn.x + ox, spawn.y + oy)) {
          return { x: spawn.x + ox, y: spawn.y + oy };
        }
      }

      return { x: spawn.x, y: spawn.y };
    }

    playerByUserId(userId) {
      return this.players.find((p) => p.userId === userId) || null;
    }

    // =====================================
    // COLLISION (đọc từ property của layer / tile)
    // =====================================

    tileBlockHeight(tile) {
      // 1. property trên tile
      let h = getProp(tile.properties, "blockHeight");
      if (h !== undefined) return h;

      // 2. property trong tileset (Tiled)
      const ts = tile.tileset;
      h = getProp(
        ts?.tileProperties?.[tile.index - ts.firstgid],
        "blockHeight",
      );
      if (h !== undefined) return h;

      // 3. bảng trong config.js; không có thì chặn cả ô
      return this.mapCfg.blockHeights?.[tile.index] ?? tile.height;
    }

    isBlocked(x, y) {
      const points = [
        [x - FEET_HALF_W, y + FEET_TOP],
        [x + FEET_HALF_W, y + FEET_TOP],
        [x - FEET_HALF_W, y + FEET_BOTTOM],
        [x + FEET_HALF_W, y + FEET_BOTTOM],
      ];

      return points.some(([px, py]) => {
        if (px < 0 || px > this.worldW || py > this.worldH) {
          return true;
        }

        return this.collisionLayers.some((layer) => {
          const tile = layer.getTileAtWorldXY(px, py);

          if (!tile) return false;

          return py - tile.pixelY < this.tileBlockHeight(tile);
        });
      });
    }

    // Va chạm với người chơi khác: người ở xa (online) + người cùng máy
    blockedByOthers(p, x, y) {
      const others = [
        ...Object.values(this.otherPlayers).map((o) => ({
          x: o.curX,
          y: o.curY,
        })),
        ...this.players
          .filter((q) => q !== p)
          .map((q) => ({ x: q.body.x, y: q.body.y })),
      ];

      return others.some((other) => {
        const newDx = Math.abs(x - other.x);
        const newDy = Math.abs(y - other.y);

        if (newDx >= PLAYER_BLOCK_W || newDy >= PLAYER_BLOCK_H) {
          return false;
        }

        // Chỉ chặn nếu bước này làm 2 người lại gần nhau hơn
        // (đang kẹt chồng lên nhau thì vẫn được đi ra)
        const nowDist = Math.hypot(p.body.x - other.x, p.body.y - other.y);

        return Math.hypot(newDx, newDy) < nowDist;
      });
    }

    // =====================================
    // ITEM HELPERS
    // =====================================

    upsertItem(itemData) {
      if (!itemData?.id) return;
      const alreadyKnown = Boolean(this.items[itemData.id]);

      if (!this.items[itemData.id]) {
        const sprite = this.add
          .image(itemData.x, itemData.y, "items", 0)
          .setScale(0.125)
          .setDepth(3);

        this.items[itemData.id] = {
          id: itemData.id,
          type: itemData.type,
          sprite,
        };
      }

      const item = this.items[itemData.id];

      item.state = itemData.state;
      item.userId = itemData.userId || null;
      item.status = itemData.status || "raw";
      item.stationId = itemData.stationId || null;
      const nextIngredients = itemData.ingredients || [];
      if (alreadyKnown && item.type === "plate" && nextIngredients.length > (item.ingredients?.length || 0)) {
        this.audioEffects.play("place", 0.3);
      }
      item.ingredients = nextIngredients;
      item.x = itemData.x;
      item.y = itemData.y;

      // Món này đang nằm trong tay người chơi nào trên máy này?
      const owner =
        item.state === "held" ? this.playerByUserId(item.userId) : null;

      this.players.forEach((p) => {
        if (p === owner) p.heldItemId = item.id;
        else if (p.heldItemId === item.id) p.heldItemId = null;
      });

      item.bakeStatus = itemData.bakeStatus || "raw";
      setItemAppearance(this, item.sprite, item);

      if (item.state === "held") {
        item.sprite.setVisible(false);
        return;
      }

      item.sprite.setVisible(true);
      item.sprite.x = item.x;
      item.sprite.y = item.y;
    }

    removeItemVisual(itemId) {
      const item = this.items[itemId];
      if (!item) return;

      if (item.sprite) item.sprite.destroy();

      delete this.items[itemId];

      this.players.forEach((p) => {
        if (p.heldItemId === itemId) p.heldItemId = null;
      });
    }

    setScore(value) {
      this.score = value;

      if (this.hudScore) {
        this.hudScore.textContent = `Score  ${value}`;
      }
    }

    setStationState(stationData) {
      if (!stationData?.id) return;

      this.stations[stationData.id] = {
        id: stationData.id,
        itemId: stationData.itemId || null,
        cookTime: stationData.cookTime || 5000,
        burnTime: stationData.burnTime || 10000,
        cutTime: stationData.cutTime || 2000,
        elapsedMs: stationData.elapsedMs || 0,
        cutState: stationData.cutState || null,
        cuttingUserId: stationData.cuttingUserId || null,
        receivedAt: Date.now(),
      };
    }

    // =====================================
    // CAMERA / ZOOM
    // =====================================

    computeZoom() {
      const gw = this.scale.width;
      const gh = this.scale.height;

      // Far fills the viewport without stretching either axis.
      const fitZoom = Math.max(gw / this.worldW, gh / this.worldH);

      if (this.zoomMode === "far") {
        return fitZoom;
      }

      // near: sát nhân vật, không bao giờ xa hơn mức far
      return Math.max(fitZoom, gw / this.mapCfg.zoomNear) * NEAR_ZOOM_SCALE;
    }

    setZoomMode(mode) {
      // Co-op cùng máy: luôn thấy cả 2 người nên không cho zoom gần
      if (this.zoomLocked) return;

      if (mode === this.zoomMode) return;

      this.zoomMode = mode;

      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, mode);
      } catch {
        // bỏ qua
      }

      this.applyCameraZoom();
      this.updateZoomLabel();
    }

    updateZoomLabel() {
      if (this.hudZoom) {
        this.hudZoom.textContent = `Z · Zoom: ${this.zoomMode === "near" ? "Close" : "Wide"}`;
      }
    }

    updateCameraTarget() {
      const [a, b] = this.players;

      if (!b) {
        this.camTarget.x = a.body.x;
        this.camTarget.y = a.body.y;
        return;
      }

      this.camTarget.x = (a.body.x + b.body.x) / 2;
      this.camTarget.y = (a.body.y + b.body.y) / 2;
    }

    applyCameraZoom() {
      const cam = this.cameras.main;
      // Keep a uniform scale; camera bounds crop the overflow at the edges.
      cam.setZoom(this.computeZoom());
      cam.startFollow(this.camTarget, true, CAMERA_LERP, CAMERA_LERP);
    }

    setupCamera() {
      const cam = this.cameras.main;

      cam.setBackgroundColor(this.mapCfg.background);
      cam.setBounds(0, 0, this.worldW, this.worldH);
      this.applyCameraZoom();

      const onResize = () => this.applyCameraZoom();
      this.scale.on(Phaser.Scale.Events.RESIZE, onResize);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      });

      cam.on(Phaser.Cameras.Scene2D.Events.POST_RENDER, () => this.layoutHud());
    }

    // =====================================
    // HUD
    // =====================================

    createHud() {
      const root = document.createElement("div");

      root.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:50;" +
        "font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif;font-weight:700;color:#fff;";

      // Keep HUD and React menus in the same stacking context.
      this.game.canvas.closest(".game-page").appendChild(root);

      const make = (css) => {
        const el = document.createElement("div");

        el.style.cssText =
          "position:absolute;left:0;top:0;white-space:nowrap;" + css;

        root.appendChild(el);

        return el;
      };

      this.hudRoot = root;

      this.hudScore = make(
        "",
      );
      this.hudScore.className = "gm-score";
      this.hudScore.textContent = `Score  ${this.score}`;

      // Mỗi người chơi có một bong bóng gợi ý riêng
      this.players.forEach((p) => {
        p.hudHint = make(
          "display:none;background:rgba(18,48,46,.95);border-radius:.6em;padding:.35em .6em;transform:translate(-50%,-100%);",
        );
        p.hudHintVisible = false;
        p.hintSig = null;
      });

      this.hudZoom = make(
        "background:rgba(18,48,46,.85);border-radius:.4em;padding:.2em .6em;font-size:.8em;transform:translate(-100%,-100%);",
      );
      this.hudZoom.className = "gm-zoom-hint";
      this.updateZoomLabel();

      this.stationLabels = {};

      this.stationDefs.forEach((cfg) => {
        const el = make(
          "display:none;background:#12302e;border-radius:.3em;padding:.1em .5em;transform:translate(-50%,-100%);font-size:.85em;",
        );

        this.stationLabels[cfg.id] = {
          el,
          text: "",
          visible: false,
          setVisible(v) {
            this.visible = v;
            el.style.display = v ? "block" : "none";
          },
          setText(t) {
            this.text = t;
            el.textContent = t;
          },
        };
      });

      const cleanup = () => {
        if (this.hudRoot) {
          this.hudRoot.remove();
          this.hudRoot = null;
        }
      };

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    }

    layoutHud() {
      if (!this.hudRoot || !this.game.canvas) return;

      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();

      const k = cam.zoom * (rect.width / this.scale.width);
      const view = cam.worldView;

      const sx = (x) => rect.left + (x - view.x) * k;
      const sy = (y) => rect.top + (y - view.y) * k;

      const fs = Phaser.Math.Clamp(Math.round(rect.height / 50), 12, 20);
      this.hudRoot.style.fontSize = `${fs}px`;


      this.hudZoom.style.left = `${rect.right - fs}px`;
      this.hudZoom.style.top = `${rect.bottom - fs}px`;

      this.players.forEach((p) => {
        if (!p.hudHintVisible) return;

        const w = p.hudHint.offsetWidth;

        const x = Phaser.Math.Clamp(
          sx(p.body.x),
          rect.left + w / 2 + 4,
          rect.right - w / 2 - 4,
        );

        p.hudHint.style.left = `${x}px`;
        p.hudHint.style.top = `${Math.max(sy(p.body.y - 13), rect.top + fs * 3)}px`;
      });

      this.stationDefs.forEach((cfg) => {
        const label = this.stationLabels[cfg.id];

        if (label && label.visible) {
          label.el.style.left = `${sx(cfg.x)}px`;
          label.el.style.top = `${sy(cfg.y - 16)}px`;
        }
      });
    }

    setHint(p, entries) {
      const sig = entries
        ? entries.map((e) => `${e.key}:${e.label}`).join("|")
        : "";

      if (sig === p.hintSig) return;

      p.hintSig = sig;

      const box = p.hudHint;
      if (!box) return;

      box.textContent = "";

      if (!entries || entries.length === 0) {
        box.style.display = "none";
        p.hudHintVisible = false;
        return;
      }

      // Co-op cùng máy: thêm nhãn P1 / P2 để biết bong bóng của ai
      if (multiLocal) {
        const tag = document.createElement("span");
        tag.textContent = p.label;
        tag.style.cssText = `display:inline-block;margin-right:.6em;color:${p.color};`;
        box.appendChild(tag);
      }

      entries.forEach((e, i) => {
        const wrap = document.createElement("span");
        wrap.style.cssText = `display:inline-block;${i ? "margin-left:1em;" : ""}`;

        const key = document.createElement("span");
        key.textContent = e.key;
        key.style.cssText =
          "display:inline-block;min-width:1.4em;text-align:center;background:#fff3d6;color:#12302e;" +
          "border-radius:.25em;padding:0 .2em;margin-right:.45em;box-shadow:0 .12em 0 #a8743b;";

        const label = document.createElement("span");
        label.textContent = e.label;

        wrap.append(key, label);
        box.appendChild(wrap);
      });

      const arrow = document.createElement("div");
      arrow.style.cssText =
        "position:absolute;left:50%;bottom:-.4em;transform:translateX(-50%);width:0;height:0;" +
        "border:.4em solid transparent;border-bottom:0;border-top-color:rgba(18,48,46,.95);";
      box.appendChild(arrow);

      box.style.display = "block";
      p.hudHintVisible = true;
    }

    // =====================================
    // OTHER PLAYERS (chỉ coop-online)
    // =====================================

    updateOtherPlayer(userId, x, y, t) {
      if (!this.otherPlayers[userId]) {
        const shadow = this.add
          .image(x, y + 8, "px-shadow")
          .setTint(0x000000)
          .setAlpha(0.25)
          .setDepth(4);

        const player = this.add
          .sprite(x, y + CHEF_FOOT_OFFSET, "chef-orange", 0)
          .setOrigin(0.5, 1)
          .setScale(CHEF_SCALE)
          .setDepth(5);

        this.otherPlayers[userId] = {
          shadow,
          player,
          facing: "down",
          samples: [],
          clockOffset: null,
          curX: x,
          curY: y,
          prevX: x,
          prevY: y,
        };
      }

      const other = this.otherPlayers[userId];

      const sentAt = typeof t === "number" ? t : Date.now();
      const sample = Date.now() - sentAt;

      other.clockOffset =
        other.clockOffset === null
          ? sample
          : Math.min(sample, other.clockOffset + 1);

      const last = other.samples[other.samples.length - 1];

      const mdx = last ? x - last.x : 0;
      const mdy = last ? y - last.y : 0;

      if (mdx !== 0 || mdy !== 0) {
        other.facing = chefFacing(mdx, mdy, other.facing);

        if (other.facing === "side") {
          other.player.setFlipX(mdx > 0);
        }
      }

      other.samples.push({ t: sentAt, x, y });

      if (other.samples.length > 40) {
        other.samples.shift();
      }
    }

    // =====================================
    // INTERACTION
    // =====================================

    distanceTo(p, x, y) {
      return Phaser.Math.Distance.Between(p.body.x, p.body.y, x, y);
    }

    findNearbyItem(p) {
      let closest = null;
      let closestDistance = Infinity;

      Object.values(this.items).forEach((item) => {
        if (item.state !== "available") return;

        const distance = this.distanceTo(p, item.x, item.y);

        if (distance <= PICKUP_RANGE && distance < closestDistance) {
          closest = item;
          closestDistance = distance;
        }
      });

      return closest;
    }

    // =====================================
    // BẢNG ĐƠN HÀNG (HTML đặt đè giữa màn hình)
    // =====================================

    showOrders(orders = []) {
      this.currentOrders = orders;
      this.ordersReceivedAt = Date.now();
      this.openOrders();
    }

    openOrders() {
      if (!this.ordersEl) {
        document
          .querySelectorAll("[data-orders-panel]")
          .forEach((n) => n.remove());

        const el = document.createElement("div");
        el.dataset.ordersPanel = "1";

        el.style.cssText =
          "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;" +
          "width:min(440px,92vw);background:rgba(32,35,43,.97);border:3px solid #f0b44d;" +
          "border-radius:12px;padding:16px 18px;color:#fff;box-shadow:0 10px 36px rgba(0,0,0,.55);" +
          "font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif;";

        this.game.canvas.closest(".game-page").appendChild(el);

        this.ordersEl = el;

        // Đồng hồ đếm ngược chạy mỗi 0,5 giây khi bảng đang mở
        this.ordersTimer = window.setInterval(() => this.renderOrders(), 500);
      }

      this.renderOrders();
    }

    renderOrders() {
      const el = this.ordersEl;

      if (!el) return;

      const orders = this.currentOrders || [];

      // Thời gian còn lại = số server gửi - thời gian đã trôi từ lúc nhận
      // (không dùng đồng hồ server nên không bị lệch giờ giữa 2 máy)
      const elapsed = Date.now() - (this.ordersReceivedAt || Date.now());

      el.textContent = "";

      const head = document.createElement("div");
      head.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;";

      const title = document.createElement("div");
      title.textContent = "CUSTOMER ORDERS";
      title.style.cssText = "font-size:20px;font-weight:800;color:#ffd166;";

      const close = document.createElement("button");
      close.textContent = "X";
      close.style.cssText =
        "pointer-events:auto;cursor:pointer;border:0;border-radius:6px;background:#a83232;" +
        "color:#fff;font-weight:800;font-size:16px;padding:4px 10px;";
      close.onclick = () => this.closeOrders();

      head.append(title, close);
      el.appendChild(head);

      if (orders.length === 0) {
        const none = document.createElement("div");
        none.textContent = "No active orders";
        none.style.cssText = "padding:10px 0;color:#cbd5e1;";
        el.appendChild(none);
      }

      const RECIPE_HINT = {
        hamburger: "Bread + cooked meat + chopped tomato",
        pizza: "Dough + chopped tomato on a plate, then bake in the oven",
        salad: "Chopped salad",
      };

      orders.forEach((order, i) => {
        const remaining = Math.max(0, (order.remainingMs ?? 0) - elapsed);
        const seconds = Math.ceil(remaining / 1000);
        const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        const ratio = order.durationMs
          ? Math.min(1, remaining / order.durationMs)
          : 0;

        const row = document.createElement("div");
        row.style.cssText =
          "padding:8px 0;border-top:1px solid rgba(255,255,255,.12);";

        const line = document.createElement("div");
        line.style.cssText =
          "display:flex;justify-content:space-between;font-weight:700;";

        const name = document.createElement("span");
        name.textContent = `${i + 1}. ${order.name || order.recipeId}`;

        const time = document.createElement("span");
        time.textContent = mmss;
        time.style.color = remaining < 15000 ? "#ff6666" : "#9be7a5";

        line.append(name, time);

        const hint = document.createElement("div");
        hint.textContent = RECIPE_HINT[order.recipeId] || "";
        hint.style.cssText = "font-size:12px;color:#94a3b8;margin:2px 0 6px;";

        const bar = document.createElement("div");
        bar.style.cssText =
          "height:5px;border-radius:3px;background:#3b4150;overflow:hidden;";

        const fillBar = document.createElement("div");
        fillBar.style.cssText = `height:100%;width:${ratio * 100}%;background:${remaining < 15000 ? "#ef4444" : "#22c55e"};`;

        bar.appendChild(fillBar);
        row.append(line, hint, bar);
        el.appendChild(row);
      });

      const foot = document.createElement("div");
      foot.textContent = multiLocal
        ? "Press E / Enter or ESC to close"
        : "Press E or ESC to close";
      foot.style.cssText =
        "margin-top:10px;font-size:12px;color:#94a3b8;text-align:right;";
      el.appendChild(foot);
    }

    closeOrders() {
      if (this.ordersTimer) {
        window.clearInterval(this.ordersTimer);
        this.ordersTimer = null;
      }

      if (this.ordersEl) {
        this.ordersEl.remove();
        this.ordersEl = null;
      }

      this.ordersOwner = null;

      document
        .querySelectorAll("[data-orders-panel]")
        .forEach((n) => n.remove());
    }

    // Thông báo ngắn giữa phía trên màn hình (phục vụ xong, lỗi...)
    showToast(text, color = "#22c55e") {
      if (!this.hudRoot || !this.game.canvas) return;

      const rect = this.game.canvas.getBoundingClientRect();
      const el = document.createElement("div");

      el.textContent = text;
      el.style.cssText =
        `position:absolute;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height * 0.14}px;` +
        `transform:translate(-50%,-50%);background:${color};color:#fff;font-weight:800;` +
        "padding:.4em .9em;border-radius:.5em;white-space:nowrap;transition:opacity .4s;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.35);";

      this.hudRoot.appendChild(el);

      window.setTimeout(() => (el.style.opacity = "0"), 1800);
      window.setTimeout(() => el.remove(), 2300);
    }

    // Hành động người chơi p có thể làm ngay lúc này (hoặc null)
    findInteraction(p) {
      const px = p.body.x;
      const py = p.body.y;

      const special = this.layout.stations.filter((s) =>
        ["trash-bin", "order-station", "serving-counter"].includes(s.kind),
      );

      let specialBest = null;

      for (const station of special) {
        const d = this.distanceTo(p, station.x, station.y);

        if (d > INTERACT_RANGE) continue;

        let label = null;
        let run = null;

        if (station.kind === "order-station") {
          label = this.ordersEl ? "Close orders" : "View orders";

          run = () => {
            if (this.ordersEl) {
              this.closeOrders();
              return;
            }

            this.ordersOwner = p;

            this.net.emit("request-orders", {
              roomCode: roomId,
              playerX: p.body.x,
              playerY: p.body.y,
            });
          };
        } else if (station.kind === "trash-bin" && p.heldItemId) {
          label = "Throw item away";

          run = () =>
            this.net.emit("use-trash-bin", {
              roomCode: roomId,
              userId: p.userId,
              itemId: p.heldItemId,
              playerX: p.body.x,
              playerY: p.body.y,
            });
        } else if (
          station.kind === "serving-counter" &&
          p.heldItemId &&
          this.items[p.heldItemId]?.type === "plate"
        ) {
          label = "Serve dish";

          run = () =>
            this.net.emit("serve-order", {
              roomCode: roomId,
              userId: p.userId,
              itemId: p.heldItemId,
              playerX: p.body.x,
              playerY: p.body.y,
            });
        }

        if (label && (!specialBest || d < specialBest.d)) {
          specialBest = { d, label, run };
        }
      }

      if (specialBest) return specialBest;

      // ---------------------------------
      // ĐANG CẦM ITEM
      // ---------------------------------
      if (p.heldItemId) {
        const held = this.items[p.heldItemId];

        if (!held) return null;

        let best = null;

        for (const cfg of this.stationDefs) {
          const station = this.stations[cfg.id];

          if (station && station.itemId) continue;
          if (!cfg.accepts(held)) continue;

          // Lò chỉ nhận đĩa chưa nướng: đĩa đã chín / cháy không được bỏ vào lại
          if (
            cfg.kind === "oven" &&
            (held.type !== "plate" || (held.bakeStatus || "raw") !== "raw")
          ) {
            continue;
          }

          const d = this.distanceTo(p, cfg.x, cfg.y);

          if (d > INTERACT_RANGE) continue;

          if (!best || d < best.d) {
            best = {
              d,
              label: cfg.placeLabel,
              run: () => this.placeOnStation(p, cfg.id),
            };
          }
        }

        // Đang cầm đĩa (chưa nướng): thêm thẳng nguyên liệu gần đó vào đĩa,
        // không cần đặt đĩa xuống
        if (held.type === "plate" && (held.bakeStatus || "raw") === "raw") {
          const offer = (d, label, source) => {
            if (d > INTERACT_RANGE) return;

            if (!best || d < best.d) {
              best = {
                d,
                label,
                run: () => this.addToHeldPlate(p, source),
              };
            }
          };

          // 1) Nguyên liệu nằm dưới đất
          Object.values(this.items).forEach((item) => {
            if (item.type === "plate" || item.state !== "available") return;

            offer(
              this.distanceTo(p, item.x, item.y),
              `Add ${item.status !== "raw" ? item.status + " " : ""}${item.type} to plate`,
              { type: "floor", id: item.id },
            );
          });

          // 2) Đồ đã xong trên trạm (cà chua đã thái, thịt đã chín)
          this.stationDefs.forEach((cfg) => {
            const station = this.stations[cfg.id];
            const item =
              station && station.itemId && this.items[station.itemId];

            if (!item || item.type === "plate") return;
            if (!["chopped", "cooked"].includes(item.status)) return;

            offer(
              this.distanceTo(p, cfg.x, cfg.y),
              `Add ${item.status} ${item.type} to plate`,
              { type: "station", id: cfg.id },
            );
          });

          // 3) Lấy thẳng từ kệ nguyên liệu bỏ vào đĩa
          this.layout.shelves.forEach((shelf) => {
            offer(
              this.distanceTo(p, shelf.x, shelf.y),
              `Add ${shelf.type} to plate`,
              { type: "shelf", id: shelf.id },
            );
          });
        }

        if (held.type !== "plate") {
          Object.values(this.items).forEach((item) => {
            if (item.type !== "plate" || item.state !== "available") return;

            const d = this.distanceTo(p, item.x, item.y);

            if (d > INTERACT_RANGE) return;

            if (!best || d < best.d) {
              best = {
                d,
                label: "Add to plate",
                run: () => this.addIngredientToPlate(p, item.id),
              };
            }
          });
        }

        return best;
      }

      // ---------------------------------
      // TAY TRỐNG
      // ---------------------------------

      let best = null;

      const consider = (d, label, run) => {
        if (d > INTERACT_RANGE) return;

        if (!best || d < best.d) {
          best = { d, label, run };
        }
      };

      // Thớt: bấm E để thái / thái tiếp (đặt trước nhánh "Take")
      this.stationDefs.forEach((cfg) => {
        if (!cfg.chop) return;

        const station = this.stations[cfg.id];
        const item = station && station.itemId && this.items[station.itemId];

        if (!item || item.status !== "raw") return;
        if (!["idle", "paused"].includes(station.cutState)) return;

        consider(
          this.distanceTo(p, cfg.x, cfg.y),
          station.cutState === "paused" ? "Resume chopping" : "Chop",
          () => this.startCutting(p, cfg.id),
        );
      });

      const takeLabel = (item) => {
        if (item.type !== "plate") return `Take ${item.status} ${item.type}`;

        if (item.bakeStatus === "cooked") return "Take baked pizza";
        if (item.bakeStatus === "burnt") return "Take burnt pizza";
        return "Take pizza (still baking)";
      };

      this.stationDefs.forEach((cfg) => {
        const station = this.stations[cfg.id];
        const item = station && station.itemId && this.items[station.itemId];

        if (!item) return;

        consider(this.distanceTo(p, cfg.x, cfg.y), takeLabel(item), () =>
          this.takeFromStation(p, cfg.id),
        );
      });

      if (this.plateStation) {
        consider(
          this.distanceTo(p, this.plateStation.x, this.plateStation.y),
          "Take plate",
          () => this.takePlate(p),
        );
      }

      this.layout.shelves.forEach((shelf) => {
        consider(
          this.distanceTo(p, shelf.x, shelf.y),
          `Take ${shelf.type}`,
          () => this.takeIngredientFromShelf(p, shelf),
        );
      });

      // Compare floor items after stations so stations win equal distances.
      const floorItem = this.findNearbyItem(p);
      if (floorItem) {
        consider(
          this.distanceTo(p, floorItem.x, floorItem.y),
          `Pick up ${floorItem.type}`,
          () => this.pickUpItem(p, floorItem.id),
        );
      }

      return best;
    }

    handleInteract(p) {
      if (!p || this.controls?.menuOpen) return;

      // Bảng order đang mở: bấm interact luôn đóng được, không phụ thuộc khoảng cách
      if (this.ordersEl) {
        this.closeOrders();
        return;
      }

      const action = this.findInteraction(p);

      if (action) action.run();
    }

    // =====================================
    // ACTIONS (gửi lệnh qua this.net: server hoặc local)
    // =====================================

    takeIngredientFromShelf(p, shelf) {
      if (p.heldItemId) return;

      this.net.emit("take-ingredient", {
        roomCode: roomId,
        userId: p.userId,
        shelfId: shelf.id,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    takePlate(p) {
      if (p.heldItemId) return;

      this.net.emit("take-plate", {
        roomCode: roomId,
        userId: p.userId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    pickUpItem(p, itemId) {
      if (!itemId || p.heldItemId) return;

      this.net.emit("pick-up-item", {
        roomCode: roomId,
        userId: p.userId,
        itemId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    placeOnStation(p, stationId) {
      if (!p.heldItemId) return;

      this.net.emit("place-on-station", {
        roomCode: roomId,
        userId: p.userId,
        stationId,
        itemId: p.heldItemId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    takeFromStation(p, stationId) {
      if (p.heldItemId) return;

      this.net.emit("take-from-station", {
        roomCode: roomId,
        userId: p.userId,
        stationId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    // Người chơi nhích đi -> thanh thái đứng ngay (server cũng pause ngay)
    freezeCutting(p) {
      for (const cfg of this.stationDefs) {
        if (!cfg.chop) continue;

        const st = this.stations[cfg.id];

        if (!st || st.cutState !== "cutting" || st.cuttingUserId !== p.userId) {
          continue;
        }

        st.elapsedMs += Date.now() - st.receivedAt;
        st.receivedAt = Date.now();
        st.cutState = "paused";
      }
    }

    startCutting(p, stationId) {
      if (p.heldItemId) return;

      this.net.emit("start-cutting", {
        roomCode: roomId,
        userId: p.userId,
        stationId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    // Khoá thao tác thêm nguyên liệu 400ms (riêng từng người) để không gửi lệnh trùng
    lockPlateAdd(p) {
      p.pendingPlateAdd = true;

      this.time.delayedCall(400, () => {
        p.pendingPlateAdd = false;
      });
    }

    addIngredientToPlate(p, plateId) {
      if (!p.heldItemId || p.pendingPlateAdd) return;

      this.lockPlateAdd(p);

      this.net.emit("add-ingredient-to-plate", {
        roomCode: roomId,
        userId: p.userId,
        plateId,
        itemId: p.heldItemId,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    // Thêm nguyên liệu (dưới đất / trên trạm / ở kệ) vào đĩa đang cầm
    addToHeldPlate(p, source) {
      if (!p.heldItemId || p.pendingPlateAdd) return;

      const plate = this.items[p.heldItemId];
      if (!plate || plate.type !== "plate") return;

      this.lockPlateAdd(p);

      this.net.emit("add-to-held-plate", {
        roomCode: roomId,
        userId: p.userId,
        plateId: p.heldItemId,
        sourceType: source.type,
        sourceId: source.id,
        playerX: p.body.x,
        playerY: p.body.y,
      });
    }

    dropItem(p) {
      if (!p || !p.heldItemId) return;

      this.net.emit("drop-item", {
        roomCode: roomId,
        userId: p.userId,
        itemId: p.heldItemId,
        x: p.body.x,
        y: p.body.y,
      });
    }

    // =====================================
    // STATION VIEW
    // =====================================

    updateStationViews() {
      this.stationBar.clear();

      this.stationDefs.forEach((cfg) => {
        const label = this.stationLabels[cfg.id];
        const station = this.stations[cfg.id];
        const item =
          station && station.itemId ? this.items[station.itemId] : null;

        if (!station || !item) {
          label.setVisible(false);
          return;
        }

        if (item.sprite && item.sprite.visible) {
          item.sprite.x = cfg.x;
          item.sprite.y = cfg.y;
        }

        const live = !station.cutState || station.cutState === "cutting";

        const elapsed =
          station.elapsedMs + (live ? Date.now() - station.receivedAt : 0);

        const { progress, color, text } = cfg.progress(item, station, elapsed);

        const barW = 24;
        const barH = 3;
        const barX = cfg.x - barW / 2;
        const barY = cfg.y - 13;

        this.stationBar.fillStyle(0x000000, 0.6);
        this.stationBar.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        this.stationBar.fillStyle(color, 1);
        this.stationBar.fillRect(barX, barY, barW * progress, barH);

        if (label.text !== text) label.setText(text);

        label.setVisible(true);
      });
    }

    // =====================================
    // NHÂN VẬT: vị trí + animation
    // =====================================

    updatePlayerSprite(p, dx, dy) {
      const moving = dx !== 0 || dy !== 0;

      p.facing = chefFacing(dx, dy, p.facing);

      if (moving && p.facing === "side") {
        p.sprite.setFlipX(dx > 0);
      }

      p.sprite.x = Math.round(p.body.x);
      p.sprite.y = Math.round(p.body.y + CHEF_FOOT_OFFSET);

      p.shadow.x = p.body.x;
      p.shadow.y = p.body.y + 8;

      p.sprite.anims.play(
        `${p.spriteKey}-${moving ? "walk" : "idle"}-${p.facing}`,
        true,
      );
    }

    updateOtherPlayers() {
      Object.values(this.otherPlayers).forEach((other) => {
        const buf = other.samples;

        if (buf.length > 0 && other.clockOffset !== null) {
          const renderT = Date.now() - other.clockOffset - INTERP_DELAY_MS;

          while (buf.length > 2 && buf[1].t <= renderT) {
            buf.shift();
          }

          const a = buf[0];
          const b = buf[1];

          if (!b || renderT <= a.t) {
            other.curX = a.x;
            other.curY = a.y;
          } else if (renderT >= b.t || b.t - a.t > 400) {
            other.curX = b.x;
            other.curY = b.y;
          } else {
            const k = (renderT - a.t) / (b.t - a.t);

            other.curX = a.x + (b.x - a.x) * k;
            other.curY = a.y + (b.y - a.y) * k;
          }
        }

        const moving =
          Math.hypot(other.curX - other.prevX, other.curY - other.prevY) > 0.02;
        this.audioEffects.step(other.userId || other, other.curX, other.curY, moving);

        other.prevX = other.curX;
        other.prevY = other.curY;

        other.player.x = Math.round(other.curX);
        other.player.y = Math.round(other.curY + CHEF_FOOT_OFFSET);
        other.shadow.x = Math.round(other.curX);
        other.shadow.y = Math.round(other.curY + 8);

        other.player.anims.play(
          `chef-orange-${moving ? "walk" : "idle"}-${other.facing}`,
          true,
        );
      });
    }

    // =====================================
    // POSITION
    // =====================================

    // Gửi vị trí để server / GameController kiểm tra khoảng cách (thớt thái...)
    sendPosition(p) {
      if (!this.net.connected) return;

      const x = Math.round(p.body.x);
      const y = Math.round(p.body.y);

      if (x === p.lastSentX && y === p.lastSentY) return;

      const nowMs = performance.now();

      if (nowMs - p.lastSentAt < POSITION_SEND_INTERVAL) return;

      p.lastSentAt = nowMs;

      p.lastSentX = x;
      p.lastSentY = y;

      this.net.volatile.emit("player-position", {
        roomCode: roomId,
        userId: p.userId,
        x,
        y,
        t: Date.now(),
      });
    }

    // =====================================
    // UPDATE
    // =====================================

    // Đọc phím di chuyển của một người chơi -> vector (dx, dy)
    readMoveInput(p, stick) {
      if (stick) return { dx: stick.x, dy: stick.y };

      const k = p.keys;
      const alt = p.altKeys; // phím mũi tên phụ (chỉ khi chơi 1 người)

      const left = k.left.isDown || alt?.left.isDown;
      const right = k.right.isDown || alt?.right.isDown;
      const up = k.up.isDown || alt?.up.isDown;
      const downKey = k.down.isDown || alt?.down.isDown;

      let dx = (right ? 1 : 0) - (left ? 1 : 0);
      let dy = (downKey ? 1 : 0) - (up ? 1 : 0);

      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      return { dx, dy };
    }

    update(time, delta) {
      this.controls.sync();

      const stick = this.controls.getVector();
      const step = PLAYER_SPEED * (delta / 1000);

      this.players.forEach((p, index) => {
        // Joystick cảm ứng chỉ điều khiển người chơi 1
        let { dx, dy } = this.readMoveInput(p, index === 0 ? stick : null);

        if (this.controls.menuOpen) {
          dx = 0;
          dy = 0;
        }

        const beforeX = p.body.x;
        const beforeY = p.body.y;

        const nextX = p.body.x + dx * step;

        if (
          !this.isBlocked(nextX, p.body.y) &&
          !this.blockedByOthers(p, nextX, p.body.y)
        ) {
          p.body.x = nextX;
        }

        const nextY = p.body.y + dy * step;

        if (
          !this.isBlocked(p.body.x, nextY) &&
          !this.blockedByOthers(p, p.body.x, nextY)
        ) {
          p.body.y = nextY;
        }

        if (p.body.x !== beforeX || p.body.y !== beforeY) {
          this.freezeCutting(p);
        }
        this.audioEffects.step(p.slot, p.body.x, p.body.y,
          Math.hypot(p.body.x - beforeX, p.body.y - beforeY) > 0.01);

        this.updatePlayerSprite(p, dx, dy);

        this.sendPosition(p);

        this.updatePlayerHold(p, index);
      });

      this.updateCameraTarget();
      this.updateOtherPlayers();
      this.audioEffects.update();

      // Bảng order: đóng khi người đã mở nó đi xa
      if (this.ordersEl) {
        const os = this.layout.stations.find(
          (st) => st.kind === "order-station",
        );

        const owner = this.ordersOwner || this.players[0];

        if (!os || this.distanceTo(owner, os.x, os.y) > INTERACT_RANGE * 1.6) {
          this.closeOrders();
        }
      }

      this.updateStationViews();
    }

    // Đồ đang cầm + gợi ý phím + phím thả của một người chơi
    updatePlayerHold(p, index) {
      if (p.heldItemId && !this.items[p.heldItemId]) {
        p.heldItemId = null;
      }

      const heldItem = p.heldItemId ? this.items[p.heldItemId] : null;

      // Luôn đọc phím thả mỗi khung hình để không bị "tồn" lần bấm cũ
      const dropPressed = Phaser.Input.Keyboard.JustDown(p.keys.drop);

      const hint = [];

      const action = this.findInteraction(p);

      // Nút cảm ứng (E / Q) chỉ phản ánh người chơi 1
      if (index === 0) {
        this.controls.setActionLabel(action ? action.label : null);
        this.controls.setDropItem(heldItem ? heldItem.type : null);
      }

      if (action) {
        hint.push({ key: p.keymap.labels.interact, label: action.label });
      }

      if (heldItem) {
        if (dropPressed && !this.controls.menuOpen) {
          this.dropItem(p);
        }

        hint.push({
          key: p.keymap.labels.drop,
          label: `Drop ${heldItem.type}`,
        });

        if (!p.heldItemVisual) {
          p.heldItemVisual = this.add
            .image(p.body.x, p.body.y, "items", 0)
            .setScale(0.125)
            .setDepth(6);
        }

        setItemAppearance(this, p.heldItemVisual, heldItem);

        const hold = heldItemOffset(p.facing, p.sprite.flipX);

        p.heldItemVisual.setDepth(hold.depth);
        p.heldItemVisual.x = p.body.x + hold.x;
        p.heldItemVisual.y = p.body.y + hold.y;
      } else if (p.heldItemVisual) {
        p.heldItemVisual.destroy();
        p.heldItemVisual = null;
      }

      const hideHint = index === 0 && this.controls.mode === "joystick";

      this.setHint(p, hideHint ? [] : hint);
    }
  };
}
