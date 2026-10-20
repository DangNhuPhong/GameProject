import Phaser from "phaser";
import { socket } from "../services/socket";
import { getMapConfig } from "./maps";
import { readLayout, getProp } from "./mapLoader";
import { STATION_BEHAVIORS } from "./stationBehaviors";

import itemsUrl from "../assets/items.png";

import chefBlueUrl from "../assets/chef-blue.png";
import chefOrangeUrl from "../assets/chef-orange.png";

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
const PICKUP_RANGE = 24;

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

// Đĩa pizza: chín = vàng, cháy = xám đen
function applyBakeTint(sprite, bakeStatus) {
  if (bakeStatus === "cooked") sprite.setTint(0xffd27a);
  else if (bakeStatus === "burnt") sprite.setTint(0x555555);
  else sprite.clearTint();
}

// =====================================
// NHÂN VẬT PIXEL (spritesheet 4 cột x 3 hàng, mỗi khung 16 x 20)
// =====================================

const CHEF_FRAME_W = 16;
const CHEF_FRAME_H = 20;
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
  if (dx !== 0) return "side";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return current;
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

/** Creates the Phaser scene with the current player, room and map. */
export function createKitchenScene({ user, roomCode, mapId }) {
  const mapCfg = getMapConfig(mapId);

  return class KitchenScene extends Phaser.Scene {
    constructor() {
      super("KitchenScene");

      this.mapCfg = mapCfg;

      this.otherPlayers = {};

      this.facing = "down";
      this.zoomMode = "far";

      this.lastSentX = null;
      this.lastSentY = null;

      this.items = {};
      this.stations = {};
      this.heldItemId = null;

      this.hintSig = null;
      this.hintWidth = 0;
      this.pendingPlateAdd = false;

      this.score = 0;

      this.socketHandlers = [];
    }

    // =====================================
    // PRELOAD
    // =====================================

    preload() {
      const cfg = this.mapCfg;

      this.load.tilemapTiledJSON(cfg.id, cfg.mapUrl);

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
        frameWidth: 16,
        frameHeight: 16,
      });
    }

    // =====================================
    // CREATE
    // =====================================

    create() {
      this.zoomMode = loadZoomMode();
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
        this.closeOrders();
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

      this.stationDefs = this.layout.stations
        .filter((s) => STATION_BEHAVIORS[s.kind])
        .map((s) => ({ ...s, ...STATION_BEHAVIORS[s.kind] }));

      this.plateStation =
        this.layout.stations.find((s) => s.kind === "plate-station") || null;

      const spawn = this.layout.spawn;

      // =================================
      // HUD
      // =================================

      this.createHud();

      this.stationBar = this.add.graphics().setDepth(7);

      // =================================
      // CURRENT PLAYER
      // =================================

      this.playerShadow = this.add
        .image(spawn.x, spawn.y + 8, "px-shadow")
        .setTint(0x000000)
        .setAlpha(0.25)
        .setDepth(4);

      this.player = this.add
        .rectangle(spawn.x, spawn.y, 12, 14, 0x2563eb)
        .setVisible(false);

      createChefAnims(this, "chef-blue");
      createChefAnims(this, "chef-orange");

      this.playerSprite = this.add
        .sprite(spawn.x, spawn.y + CHEF_FOOT_OFFSET, "chef-blue", 0)
        .setOrigin(0.5, 1)
        .setDepth(5);

      this.setupCamera();

      // =================================
      // KEYBOARD
      // =================================

      this.keys = this.input.keyboard.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
      });

      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

      this.input.keyboard.on("keydown-E", (event) => {
        if (event && event.repeat) return;
        this.handleInteract();
      });

      this.dropKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q,
      );

      this.input.keyboard.on("keydown-Z", (event) => {
        if (event && event.repeat) return;
        this.setZoomMode(this.zoomMode === "near" ? "far" : "near");
      });

      this.input.on("wheel", (pointer, over, dx, dy) => {
        this.setZoomMode(dy < 0 ? "near" : "far");
      });

      // =================================
      // SOCKET
      // =================================

      const on = (eventName, handler) => {
        socket.on(eventName, handler);
        this.socketHandlers.push([eventName, handler]);
      };

      const cleanupSocket = () => {
        this.socketHandlers.forEach(([eventName, handler]) => {
          socket.off(eventName, handler);
        });
        this.socketHandlers = [];
        this.closeOrders();
      };

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupSocket);
      this.events.once(Phaser.Scenes.Events.DESTROY, cleanupSocket);

      on("game-state", (state) => {
        if (!state) return;

        Object.values(this.items).forEach((item) => {
          if (item.sprite) item.sprite.destroy();
        });

        this.items = {};
        this.heldItemId = null;

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
          if (item) this.upsertItem(item);
        });
      });

      on("station-updated", ({ station, item }) => {
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

      on("order-completed", ({ order, points, score, userId: who }) => {
        if (typeof score === "number") this.setScore(score);

        const name = order?.name || "dish";

        this.showToast(
          who === user.id
            ? `${name} served! +${points ?? 0}`
            : `Teammate served ${name}! +${points ?? 0}`,
          "#22c55e",
        );
      });

      on("interaction-error", ({ message }) => {
        console.warn("Server:", message);
        this.showToast(message, "#ef4444");
      });

      on("player-position", ({ userId, x, y, t }) => {
        if (userId === user.id) return;
        this.updateOtherPlayer(userId, x, y, t);
      });

      on("player-joined", ({ userId }) => {
        if (userId === user.id) return;
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
        this.heldItemId = null;
      });

      const joinRoom = () => {
        socket.emit("join-room", { roomCode, userId: user.id, mapId });
      };

      on("connect", joinRoom);

      if (!socket.connected) {
        socket.connect();
      } else {
        joinRoom();
      }
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

    blockedByOtherPlayer(x, y) {
      return Object.values(this.otherPlayers).some((other) => {
        const newDx = Math.abs(x - other.curX);
        const newDy = Math.abs(y - other.curY);

        if (newDx >= PLAYER_BLOCK_W || newDy >= PLAYER_BLOCK_H) {
          return false;
        }

        const nowDist = Math.hypot(
          this.player.x - other.curX,
          this.player.y - other.curY,
        );

        return Math.hypot(newDx, newDy) < nowDist;
      });
    }

    // =====================================
    // ITEM HELPERS
    // =====================================

    upsertItem(itemData) {
      if (!itemData?.id) return;

      if (!this.items[itemData.id]) {
        const sprite = this.add
          .image(itemData.x, itemData.y, "items", 0)
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
      item.ingredients = itemData.ingredients || [];
      item.x = itemData.x;
      item.y = itemData.y;

      if (item.state === "held" && item.userId === user.id) {
        this.heldItemId = item.id;
      } else if (this.heldItemId === item.id) {
        this.heldItemId = null;
      }

      item.sprite.setFrame(itemFrame(item.type, item.status, item.ingredients));

      if (item.type === "plate") {
        item.bakeStatus = itemData.bakeStatus || "raw";
        applyBakeTint(item.sprite, item.bakeStatus);
      }

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

      if (this.heldItemId === itemId) this.heldItemId = null;
    }

    setScore(value) {
      this.score = value;

      if (this.hudScore) {
        this.hudScore.textContent = `SCORE  ${value}`;
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

      // far: vừa khít để thấy trọn map
      const fitZoom = Math.min(gw / this.worldW, gh / this.worldH);

      if (this.zoomMode === "far") {
        return fitZoom;
      }

      // near: sát nhân vật, không bao giờ xa hơn mức far
      return Math.max(fitZoom, gw / this.mapCfg.zoomNear) * NEAR_ZOOM_SCALE;
    }

    setZoomMode(mode) {
      if (mode === this.zoomMode) return;

      this.zoomMode = mode;

      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, mode);
      } catch {
        // bỏ qua
      }

      this.cameras.main.setZoom(this.computeZoom());
      this.updateZoomLabel();
    }

    updateZoomLabel() {
      if (this.hudZoom) {
        this.hudZoom.textContent = `Z · Zoom: ${this.zoomMode === "near" ? "Close" : "Wide"}`;
      }
    }

    setupCamera() {
      const cam = this.cameras.main;

      cam.setBackgroundColor(this.mapCfg.background);
      cam.setBounds(0, 0, this.worldW, this.worldH);
      cam.setZoom(this.computeZoom());
      cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);

      const onResize = () => cam.setZoom(this.computeZoom());
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

      document.body.appendChild(root);

      const make = (css) => {
        const el = document.createElement("div");

        el.style.cssText =
          "position:absolute;left:0;top:0;white-space:nowrap;" + css;

        root.appendChild(el);

        return el;
      };

      this.hudRoot = root;
      this.hudHintVisible = false;

      this.hudScore = make(
        "background:#12302e;border-radius:.4em;padding:.2em .8em;transform:translate(-50%,-50%);",
      );
      this.hudScore.textContent = `SCORE  ${this.score}`;

      this.hudHint = make(
        "display:none;background:rgba(18,48,46,.95);border-radius:.6em;padding:.35em .6em;transform:translate(-50%,-100%);",
      );

      this.hudZoom = make(
        "background:rgba(18,48,46,.85);border-radius:.4em;padding:.2em .6em;font-size:.8em;transform:translate(-100%,-100%);",
      );
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

      this.hudScore.style.left = `${rect.left + rect.width / 2}px`;
      this.hudScore.style.top = `${rect.top + fs * 1.6}px`;

      this.hudZoom.style.left = `${rect.right - fs}px`;
      this.hudZoom.style.top = `${rect.bottom - fs}px`;

      if (this.hudHintVisible) {
        const w = this.hudHint.offsetWidth;

        const x = Phaser.Math.Clamp(
          sx(this.player.x),
          rect.left + w / 2 + 4,
          rect.right - w / 2 - 4,
        );

        this.hudHint.style.left = `${x}px`;
        this.hudHint.style.top = `${Math.max(sy(this.player.y - 13), rect.top + fs * 3)}px`;
      }

      this.stationDefs.forEach((cfg) => {
        const label = this.stationLabels[cfg.id];

        if (label && label.visible) {
          label.el.style.left = `${sx(cfg.x)}px`;
          label.el.style.top = `${sy(cfg.y - 16)}px`;
        }
      });
    }

    setHint(entries) {
      const sig = entries
        ? entries.map((e) => `${e.key}:${e.label}`).join("|")
        : "";

      if (sig === this.hintSig) return;

      this.hintSig = sig;

      const box = this.hudHint;
      if (!box) return;

      box.textContent = "";

      if (!entries || entries.length === 0) {
        box.style.display = "none";
        this.hudHintVisible = false;
        return;
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
      this.hudHintVisible = true;
    }

    // =====================================
    // OTHER PLAYERS
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

    distanceTo(x, y) {
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
    }

    findNearbyItem() {
      if (!this.player) return null;

      let closest = null;
      let closestDistance = Infinity;

      Object.values(this.items).forEach((item) => {
        if (item.state !== "available") return;

        const distance = this.distanceTo(item.x, item.y);

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

        document.body.appendChild(el);

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
      foot.textContent = "Press E or ESC to close";
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

    findInteraction() {
      if (!this.player) return null;

      const special = this.layout.stations.filter((s) =>
        ["trash-bin", "order-station", "serving-counter"].includes(s.kind),
      );

      let specialBest = null;

      for (const station of special) {
        const d = this.distanceTo(station.x, station.y);

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

            socket.emit("request-orders", {
              roomCode,
              playerX: this.player.x,
              playerY: this.player.y,
            });
          };
        } else if (station.kind === "trash-bin" && this.heldItemId) {
          label = "Throw item away";

          run = () =>
            socket.emit("use-trash-bin", {
              roomCode,
              userId: user.id,
              itemId: this.heldItemId,
              playerX: this.player.x,
              playerY: this.player.y,
            });
        } else if (
          station.kind === "serving-counter" &&
          this.heldItemId &&
          this.items[this.heldItemId]?.type === "plate"
        ) {
          label = "Serve dish";

          run = () =>
            socket.emit("serve-order", {
              roomCode,
              userId: user.id,
              itemId: this.heldItemId,
              playerX: this.player.x,
              playerY: this.player.y,
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
      if (this.heldItemId) {
        const held = this.items[this.heldItemId];

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

          const d = this.distanceTo(cfg.x, cfg.y);

          if (d > INTERACT_RANGE) continue;

          if (!best || d < best.d) {
            best = {
              d,
              label: cfg.placeLabel,
              run: () => this.placeOnStation(cfg.id),
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
                run: () => this.addToHeldPlate(source),
              };
            }
          };

          // 1) Nguyên liệu nằm dưới đất
          Object.values(this.items).forEach((item) => {
            if (item.type === "plate" || item.state !== "available") return;

            offer(
              this.distanceTo(item.x, item.y),
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
              this.distanceTo(cfg.x, cfg.y),
              `Add ${item.status} ${item.type} to plate`,
              { type: "station", id: cfg.id },
            );
          });

          // 3) Lấy thẳng từ kệ nguyên liệu bỏ vào đĩa
          this.layout.shelves.forEach((shelf) => {
            offer(
              this.distanceTo(shelf.x, shelf.y),
              `Add ${shelf.type} to plate`,
              { type: "shelf", id: shelf.id },
            );
          });
        }

        if (held.type !== "plate") {
          Object.values(this.items).forEach((item) => {
            if (item.type !== "plate" || item.state !== "available") return;

            const d = this.distanceTo(item.x, item.y);

            if (d > INTERACT_RANGE) return;

            if (!best || d < best.d) {
              best = {
                d,
                label: "Add to plate",
                run: () => this.addIngredientToPlate(item.id),
              };
            }
          });
        }

        return best;
      }

      // ---------------------------------
      // TAY TRỐNG
      // ---------------------------------

      const floorItem = this.findNearbyItem();

      if (floorItem) {
        return {
          label: `Pick up ${floorItem.type}`,
          run: () => this.pickUpItem(floorItem.id),
        };
      }

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
          this.distanceTo(cfg.x, cfg.y),
          station.cutState === "paused" ? "Resume chopping" : "Chop",
          () => this.startCutting(cfg.id),
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

        consider(this.distanceTo(cfg.x, cfg.y), takeLabel(item), () =>
          this.takeFromStation(cfg.id),
        );
      });

      if (this.plateStation) {
        consider(
          this.distanceTo(this.plateStation.x, this.plateStation.y),
          "Take plate",
          () => this.takePlate(),
        );
      }

      this.layout.shelves.forEach((shelf) => {
        consider(this.distanceTo(shelf.x, shelf.y), `Take ${shelf.type}`, () =>
          this.takeIngredientFromShelf(shelf),
        );
      });

      return best;
    }
    handleInteract() {
      // Bảng order đang mở: E luôn đóng được, không phụ thuộc khoảng cách
      if (this.ordersEl) {
        this.closeOrders();
        return;
      }

      const action = this.findInteraction();

      console.log(
        "E tại",
        Math.round(this.player.x),
        Math.round(this.player.y),
        "| held:",
        this.heldItemId,
        "| hành động:",
        action ? action.label : "KHÔNG CÓ",
      );

      if (action) action.run();
    }

    // =====================================
    // ACTIONS (emit lên server)
    // =====================================

    takeIngredientFromShelf(shelf) {
      if (!this.player || this.heldItemId) return;

      socket.emit("take-ingredient", {
        roomCode,
        userId: user.id,
        shelfId: shelf.id,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    takePlate() {
      if (!this.player || this.heldItemId) return;

      socket.emit("take-plate", {
        roomCode,
        userId: user.id,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    pickUpItem(itemId) {
      if (!itemId || this.heldItemId) return;

      socket.emit("pick-up-item", {
        roomCode,
        userId: user.id,
        itemId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    placeOnStation(stationId) {
      if (!this.heldItemId) return;

      socket.emit("place-on-station", {
        roomCode,
        userId: user.id,
        stationId,
        itemId: this.heldItemId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    takeFromStation(stationId) {
      if (this.heldItemId) return;

      socket.emit("take-from-station", {
        roomCode,
        userId: user.id,
        stationId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    // Người chơi nhích đi -> thanh thái đứng ngay (server cũng pause ngay)
    freezeMyCutting() {
      for (const cfg of this.stationDefs) {
        if (!cfg.chop) continue;

        const st = this.stations[cfg.id];

        if (!st || st.cutState !== "cutting" || st.cuttingUserId !== user.id) {
          continue;
        }

        st.elapsedMs += Date.now() - st.receivedAt;
        st.receivedAt = Date.now();
        st.cutState = "paused";
      }
    }

    startCutting(stationId) {
      if (this.heldItemId) return;

      socket.emit("start-cutting", {
        roomCode,
        userId: user.id,
        stationId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    addIngredientToPlate(plateId) {
      if (!this.heldItemId || this.pendingPlateAdd) return;

      this.pendingPlateAdd = true;
      this.time.delayedCall(400, () => {
        this.pendingPlateAdd = false;
      });

      socket.emit("add-ingredient-to-plate", {
        roomCode,
        userId: user.id,
        plateId,
        itemId: this.heldItemId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    // Thêm nguyên liệu (dưới đất / trên trạm / ở kệ) vào đĩa đang cầm
    addToHeldPlate(source) {
      if (!this.heldItemId || this.pendingPlateAdd) return;

      const plate = this.items[this.heldItemId];
      if (!plate || plate.type !== "plate") return;

      this.pendingPlateAdd = true;
      this.time.delayedCall(400, () => {
        this.pendingPlateAdd = false;
      });

      socket.emit("add-to-held-plate", {
        roomCode,
        userId: user.id,
        plateId: this.heldItemId,
        sourceType: source.type,
        sourceId: source.id,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    dropItem() {
      if (!this.heldItemId) return;

      socket.emit("drop-item", {
        roomCode,
        userId: user.id,
        itemId: this.heldItemId,
        x: this.player.x,
        y: this.player.y,
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

    updateChefSprites(dx, dy) {
      if (!this.playerSprite) return;

      const moving = dx !== 0 || dy !== 0;

      this.facing = chefFacing(dx, dy, this.facing);

      if (moving && this.facing === "side") {
        this.playerSprite.setFlipX(dx > 0);
      }

      this.playerSprite.x = Math.round(this.player.x);
      this.playerSprite.y = Math.round(this.player.y + CHEF_FOOT_OFFSET);

      this.playerSprite.anims.play(
        `chef-blue-${moving ? "walk" : "idle"}-${this.facing}`,
        true,
      );

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

    sendPosition() {
      if (!socket.connected) return;

      const x = Math.round(this.player.x);
      const y = Math.round(this.player.y);

      if (x === this.lastSentX && y === this.lastSentY) return;

      const nowMs = performance.now();

      if (nowMs - (this.lastSentAt || 0) < POSITION_SEND_INTERVAL) return;

      this.lastSentAt = nowMs;

      this.lastSentX = x;
      this.lastSentY = y;

      socket.volatile.emit("player-position", {
        roomCode,
        userId: user.id,
        x,
        y,
        t: Date.now(),
      });
    }

    // =====================================
    // UPDATE
    // =====================================

    update(time, delta) {
      let dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
      let dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);

      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      const step = PLAYER_SPEED * (delta / 1000);

      const beforeX = this.player.x;
      const beforeY = this.player.y;

      const nextX = this.player.x + dx * step;

      if (
        !this.isBlocked(nextX, this.player.y) &&
        !this.blockedByOtherPlayer(nextX, this.player.y)
      ) {
        this.player.x = nextX;
      }

      const nextY = this.player.y + dy * step;

      if (
        !this.isBlocked(this.player.x, nextY) &&
        !this.blockedByOtherPlayer(this.player.x, nextY)
      ) {
        this.player.y = nextY;
      }

      if (this.player.x !== beforeX || this.player.y !== beforeY) {
        this.freezeMyCutting();
      }

      this.playerShadow.x = this.player.x;
      this.playerShadow.y = this.player.y + 8;

      this.updateChefSprites(dx, dy);

      this.sendPosition();

      if (this.heldItemId && !this.items[this.heldItemId]) {
        this.heldItemId = null;
      }

      const heldItem = this.heldItemId ? this.items[this.heldItemId] : null;

      const hint = [];

      const action = this.findInteraction();

      if (action) {
        hint.push({ key: "E", label: action.label });
      }

      if (heldItem) {
        if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
          this.dropItem();
        }

        hint.push({ key: "Q", label: `Drop ${heldItem.type}` });

        if (!this.heldItemVisual) {
          this.heldItemVisual = this.add
            .image(this.player.x, this.player.y, "items", 0)
            .setDepth(6);
        }

        this.heldItemVisual.setFrame(
          itemFrame(heldItem.type, heldItem.status, heldItem.ingredients),
        );

        if (heldItem.type === "plate") {
          applyBakeTint(this.heldItemVisual, heldItem.bakeStatus);
        } else {
          this.heldItemVisual.clearTint();
        }

        const hold = heldItemOffset(this.facing, this.playerSprite.flipX);

        this.heldItemVisual.setDepth(hold.depth);
        this.heldItemVisual.x = this.player.x + hold.x;
        this.heldItemVisual.y = this.player.y + hold.y;
      } else if (this.heldItemVisual) {
        this.heldItemVisual.destroy();
        this.heldItemVisual = null;
      }

      if (this.ordersEl) {
        const os = this.layout.stations.find(
          (st) => st.kind === "order-station",
        );

        if (!os || this.distanceTo(os.x, os.y) > INTERACT_RANGE * 1.6) {
          this.closeOrders();
        }
      }

      this.updateStationViews();
      this.setHint(hint);
    }
  };
}
