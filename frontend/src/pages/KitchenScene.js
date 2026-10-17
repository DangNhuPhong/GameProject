import Phaser from "phaser";
import { socket } from "../services/socket";

// File trong src/assets: import để Vite tự xử lý đường dẫn.
// (Nếu KitchenScene.js nằm sâu hơn, chỉnh lại "../assets/" cho đúng.)
import kitchenMapUrl from "../assets/kitchen.json?url";
import kitchenTilesUrl from "../assets/kitchen-tiles.png";
import chefBlueUrl from "../assets/chef-blue.png";
import chefOrangeUrl from "../assets/chef-orange.png";

// =====================================
// KÍCH THƯỚC THẾ GIỚI (khớp với kitchen.json: 16 x 11 tile, mỗi tile 16px)
// =====================================

export const WORLD_W = 256;
export const WORLD_H = 176;

const FONT = "monospace";
const TEXT_RES = 1;

// Hitbox chân người chơi (nửa rộng, lệch dưới tâm)
const FEET_HALF_W = 5;
const FEET_TOP = 1;
const FEET_BOTTOM = 7;

// gid của các ô "tủ gỗ" (mặt trước quầy) trong layer counters
const CABINET_GIDS = new Set([12, 13, 15]);

// Chỉ chặn phần trên của ô tủ (tính từ mép trên ô, đơn vị px).
// 8 = nửa trên (ô cao 16px). Phần dưới còn lại đi xuyên qua được.
const CABINET_BLOCK_H = 8;

// Tốc độ (pixel / giây)
const PLAYER_SPEED = 75;

// near: số càng nhỏ = zoom càng sát.
// far : để null, tính trong computeZoom() để thấy TRỌN map.
const CAMERA_VIEW_W = { near: 190, far: null };

const ZOOM_STORAGE_KEY = "kitchen-zoom-mode";

function loadZoomMode() {
  try {
    return localStorage.getItem(ZOOM_STORAGE_KEY) === "near" ? "near" : "far";
  } catch {
    return "far";
  }
}

// Độ "mượt" khi camera đuổi theo nhân vật (0.05 chậm → 1 dính cứng)
const CAMERA_LERP = 0.15;

// Hộp va chạm giữa 2 người chơi (2 người phải cách nhau ít nhất từng này pixel)
const PLAYER_BLOCK_W = 10;
const PLAYER_BLOCK_H = 8;

// Người chơi khác được vẽ "chậm" hơn thực tế ngần này ms để luôn có 2 mốc vị trí
// để nội suy đều (lớn = mượt hơn nhưng trễ hơn; nên >= 2 lần POSITION_SEND_INTERVAL)
const INTERP_DELAY_MS = 100;

// Gửi vị trí lên server tối đa mỗi ngần này ms (50ms = 20 lần/giây)
const POSITION_SEND_INTERVAL = 50;

// ⚠ Phải khớp với server (Station.range, IngredientShelf.canTake, PLATE_RANGE)
const INTERACT_RANGE = 20;

// ⚠ Phải nhỏ hơn hoặc bằng PICKUP_RANGE của server
const PICKUP_RANGE = 24;

// =====================================
// LAYOUT  (lấy từ layer "objects" của kitchen.json: centerX / centerY)
// ⚠ GameRoom.js phía server phải dùng đúng các toạ độ này
// =====================================

const SHELVES = [
  { id: "meat-shelf", type: "meat", name: "Meat", x: 32, y: 24 },
  { id: "tomato-shelf", type: "tomato", name: "Tomato", x: 128, y: 24 },
  { id: "salad-shelf", type: "salad", name: "Salad", x: 224, y: 24 },
  { id: "bread-shelf", type: "bread", name: "Bread", x: 80, y: 88 },
  { id: "dough-shelf", type: "dough", name: "Dough", x: 128, y: 88 },
];

const PLATE_STATION = { id: "plate-station", x: 176, y: 88 };
const GRILL = { id: "grill", x: 80, y: 24 };
const CUTTING_BOARD = { id: "cutting-board", x: 176, y: 24 };

// (Chưa có logic server) Lò nướng và khu phục vụ
// const OVEN = { id: "oven", x: 48, y: 152 };
// const SERVING = { id: "serving-counter", x: 160, y: 152 };

const SPAWN = { x: 128, y: 120 };

// =====================================
// CẦU NỐI TOẠ ĐỘ CŨ (TẠM THỜI)
//
// Server đã chuyển sang toạ độ mới (GameRoom.js) nên cờ này = false.
// Nếu server quay lại toạ độ cũ thì đổi thành true.
// =====================================

const SERVER_USES_OLD_COORDS = false;

const SERVER_POS = {
  "meat-shelf": { x: 110, y: 150 },
  "tomato-shelf": { x: 470, y: 150 },
  "salad-shelf": { x: 830, y: 150 },
  "bread-shelf": { x: 300, y: 400 },
  "dough-shelf": { x: 470, y: 400 },
  "plate-station": { x: 800, y: 400 },
  grill: { x: 280, y: 150 },
  "cutting-board": { x: 640, y: 150 },
};

// Mô tả các trạm nấu / sơ chế.
const STATIONS = [
  {
    ...GRILL,
    accepts: (item) => item.type === "meat" && item.status === "raw",
    placeLabel: "Cook meat",
    progress: (item, st, elapsed) => {
      if (item.status === "burnt") {
        return { progress: 1, color: 0x111827, text: "Burnt!" };
      }

      if (item.status === "cooked") {
        return {
          progress: Phaser.Math.Clamp(
            (elapsed - st.cookTime) / (st.burnTime - st.cookTime),
            0,
            1,
          ),
          color: 0xf59e0b,
          text: "Take it out!",
        };
      }

      return {
        progress: Phaser.Math.Clamp(elapsed / st.cookTime, 0, 1),
        color: 0x22c55e,
        text: "Cooking...",
      };
    },
  },
  {
    ...CUTTING_BOARD,
    chop: true,
    accepts: (item) =>
      (item.type === "tomato" || item.type === "salad") &&
      item.status === "raw",
    placeLabel: "Place to chop",
    progress: (item, st, elapsed) => {
      if (item.status === "chopped") {
        return { progress: 1, color: 0x22c55e, text: "Take it out!" };
      }

      const p = Phaser.Math.Clamp(elapsed / st.cutTime, 0, 1);

      if (st.cutState === "cutting") {
        return { progress: p, color: 0x38bdf8, text: "Chopping..." };
      }

      if (st.cutState === "paused") {
        return { progress: p, color: 0xf59e0b, text: "Press E to resume" };
      }

      return { progress: p, color: 0x38bdf8, text: "Press E to chop" };
    },
  },
];

// Màu item theo trạng thái nấu
function itemColor(type, status) {
  if (type === "plate") {
    return 0xffffff;
  }

  if (status === "burnt") {
    return 0x1f1f1f;
  }

  if (status === "cooked") {
    return 0x8b4513;
  }

  if (status === "chopped") {
    return type === "tomato" ? 0xff6b6b : 0x86efac;
  }

  switch (type) {
    case "meat":
      return 0xc0392b;
    case "tomato":
      return 0xef4444;
    case "salad":
      return 0x22c55e;
    case "bread":
      return 0xd9a441;
    case "dough":
      return 0xf5d6a6;
    default:
      return 0x94a3b8;
  }
}

// =====================================
// NHÂN VẬT PIXEL (spritesheet 4 cột x 3 hàng, mỗi khung 16 x 20)
//   hàng 0: nhìn xuống | hàng 1: nhìn lên | hàng 2: nhìn sang trái
//   cột   : 0 đứng, 1 bước, 2 đứng, 3 bước
//   Nhìn sang phải = lật ngang (flipX) hàng 2.
// =====================================

const CHEF_FRAME_W = 16;
const CHEF_FRAME_H = 20;

// Chân nhân vật nằm cách tâm logic (this.player) bao nhiêu pixel
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

// Vị trí món đang cầm so với tâm nhân vật (this.player), theo hướng nhìn
//  - nhìn xuống: trước bụng, vẽ đè lên người
//  - nhìn lên  : sau lưng, vẽ dưới người (chỉ ló ra mép)
//  - nhìn ngang: đưa ra phía trước
function heldItemOffset(facing, facingRight) {
  if (facing === "up") {
    return { x: 5, y: 3, depth: 4 };
  }

  if (facing === "side") {
    return { x: facingRight ? 6 : -6, y: 3, depth: 6 };
  }

  return { x: 0, y: 3, depth: 6 };
}

// Hướng nhìn theo vector di chuyển
function chefFacing(dx, dy, current) {
  if (dx !== 0) {
    return "side";
  }

  if (dy !== 0) {
    return dy > 0 ? "down" : "up";
  }

  return current;
}

// =====================================
// GAME
// =====================================

/** Creates the Phaser scene with the current player and room context. */
export function createKitchenScene({ user, roomCode }) {
  return class KitchenScene extends Phaser.Scene {
    constructor() {
      super("KitchenScene");

      this.otherPlayers = {};

      this.facing = "down";
      this.zoomMode = "far";

      this.lastSentX = null;
      this.lastSentY = null;

      // Dynamic items (kể cả đĩa)
      this.items = {};

      // Trạng thái các trạm do server gửi
      this.stations = {};

      // Item currently held by local player
      this.heldItemId = null;

      // Interaction
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
      this.load.image("kitchen-tiles", kitchenTilesUrl);
      this.load.tilemapTiledJSON("kitchen", kitchenMapUrl);

      this.load.spritesheet("chef-blue", chefBlueUrl, {
        frameWidth: CHEF_FRAME_W,
        frameHeight: CHEF_FRAME_H,
      });

      this.load.spritesheet("chef-orange", chefOrangeUrl, {
        frameWidth: CHEF_FRAME_W,
        frameHeight: CHEF_FRAME_H,
      });
    }

    // =====================================
    // CREATE
    // =====================================

    create() {
      this.zoomMode = loadZoomMode();
      // =================================
      // TILEMAP
      // =================================

      const map = this.make.tilemap({ key: "kitchen" });

      // Tên đầu tiên phải trùng "name" của tileset trong kitchen.json
      const tileset = map.addTilesetImage("kitchen-tiles", "kitchen-tiles");

      map.createLayer("floor", tileset).setDepth(0);
      map.createLayer("walls", tileset).setDepth(1);

      // Layer quầy / đảo / lò: dùng để chặn đường đi
      this.counters = map.createLayer("counters", tileset).setDepth(2);

      // =================================
      // HUD (DOM overlay: chữ sắc nét, không bị phóng pixel)
      // =================================

      this.createHud();

      this.stationBar = this.add.graphics().setDepth(7);

      // =================================
      // CURRENT PLAYER (tạm là hình chữ nhật, sau này thay bằng sprite)
      // =================================

      this.playerShadow = this.add
        .ellipse(SPAWN.x, SPAWN.y + 8, 12, 4, 0x000000, 0.25)
        .setDepth(4);

      // this.player = điểm logic (di chuyển, va chạm, khoảng cách) - ẩn đi.
      // Hình hiển thị là this.playerSprite, bám theo this.player.
      this.player = this.add
        .rectangle(SPAWN.x, SPAWN.y, 12, 14, 0x2563eb)
        .setVisible(false);

      createChefAnims(this, "chef-blue");
      createChefAnims(this, "chef-orange");

      this.playerSprite = this.add
        .sprite(SPAWN.x, SPAWN.y + CHEF_FOOT_OFFSET, "chef-blue", 0)
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
        // Bỏ qua khi giữ phím E (key repeat)
        if (event && event.repeat) {
          return;
        }

        this.handleInteract();
      });

      this.dropKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q,
      );

      this.input.keyboard.on("keydown-Z", (event) => {
        if (event && event.repeat) {
          return;
        }

        this.setZoomMode(this.zoomMode === "near" ? "far" : "near");
      });

      this.input.on("wheel", (pointer, over, dx, dy) => {
        this.setZoomMode(dy < 0 ? "near" : "far");
      });

      // =================================
      // SOCKET
      // =================================

      // Đăng ký listener qua on() để gỡ sạch khi scene tắt
      // (tránh bị đăng ký trùng khi scene khởi động lại).
      const on = (eventName, handler) => {
        socket.on(eventName, handler);
        this.socketHandlers.push([eventName, handler]);
      };

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.socketHandlers.forEach(([eventName, handler]) => {
          socket.off(eventName, handler);
        });

        this.socketHandlers = [];
      });

      // Full state
      on("game-state", (state) => {
        if (!state) {
          return;
        }

        Object.values(this.items).forEach((item) => {
          if (item.sprite) {
            item.sprite.destroy();
          }
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

      // Item / plate
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

          if (item) {
            this.upsertItem(item);
          }
        });
      });

      on("station-updated", ({ station, item }) => {
        if (item) {
          this.upsertItem(item);
        }

        if (station) {
          this.setStationState(station);
        }
      });

      on("interaction-error", ({ message }) => {
        console.warn("Server:", message);
      });

      on("player-position", ({ userId, x, y, t }) => {
        if (userId === user.id) {
          return;
        }

        this.updateOtherPlayer(userId, x, y, t);
      });

      on("player-joined", ({ userId }) => {
        if (userId === user.id) {
          return;
        }

        console.log("Player joined:", userId);
      });

      on("player-left", ({ userId }) => {
        const other = this.otherPlayers[userId];

        if (!other) {
          return;
        }

        other.player.destroy();
        other.shadow.destroy();

        delete this.otherPlayers[userId];
      });

      // Rớt mạng: bỏ trạng thái "đang cầm" để không bị kẹt tay
      on("disconnect", () => {
        this.heldItemId = null;
      });

      // Kết nối (hoặc nối lại) → vào phòng để nhận game-state mới
      const joinRoom = () => {
        socket.emit("join-room", { roomCode, userId: user.id });
      };

      on("connect", joinRoom);

      if (!socket.connected) {
        socket.connect();
      } else {
        joinRoom();
      }
    }

    // =====================================
    // COLLISION (đọc từ layer "counters")
    // =====================================

    isBlocked(x, y) {
      const points = [
        [x - FEET_HALF_W, y + FEET_TOP],
        [x + FEET_HALF_W, y + FEET_TOP],
        [x - FEET_HALF_W, y + FEET_BOTTOM],
        [x + FEET_HALF_W, y + FEET_BOTTOM],
      ];

      return points.some(([px, py]) => {
        if (px < 0 || px > WORLD_W || py > WORLD_H) {
          return true;
        }

        const tile = this.counters.getTileAtWorldXY(px, py);

        if (!tile) {
          return false;
        }

        // Tủ gỗ: chỉ chặn nửa trên (phía gần mặt bàn)
        if (CABINET_GIDS.has(tile.index)) {
          return py - tile.pixelY < CABINET_BLOCK_H;
        }

        // Mặt bàn, lò...: chặn cả ô
        return true;
      });
    }

    // =====================================
    // COLLISION GIỮA NGƯỜI CHƠI
    //
    // Chặn bước đi nếu vị trí mới chạm người khác.
    // Nếu đang chồng nhau sẵn (vd. cùng điểm spawn) thì vẫn cho bước
    // khi bước đó làm 2 người xa nhau hơn -> tự tách ra, không bị kẹt.
    // =====================================

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
      if (!itemData?.id) {
        return;
      }

      if (!this.items[itemData.id]) {
        const isPlate = itemData.type === "plate";

        const sprite = isPlate
          ? this.add
              .ellipse(itemData.x, itemData.y, 14, 9, 0xffffff)
              .setStrokeStyle(1, 0x94a3b8)
              .setDepth(6)
          : this.add
              .circle(itemData.x, itemData.y, 4, 0xffffff)
              .setStrokeStyle(1, 0x4e2a0b)
              .setDepth(6);

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

      // Theo dõi item đang cầm của mình
      if (item.state === "held" && item.userId === user.id) {
        this.heldItemId = item.id;
      } else if (this.heldItemId === item.id) {
        this.heldItemId = null;
      }

      // Màu: sống / chín / cháy / đã thái (đĩa có đồ thì ngả vàng)
      if (item.type === "plate") {
        item.sprite.setFillStyle(item.ingredients.length ? 0xfde68a : 0xffffff);
      } else {
        item.sprite.setFillStyle(itemColor(item.type, item.status));
      }

      // Đang được cầm → ẩn, vẽ trên đầu người cầm
      if (item.state === "held") {
        item.sprite.setVisible(false);
        return;
      }

      // Dưới đất hoặc trên trạm
      item.sprite.setVisible(true);
      item.sprite.x = item.x;
      item.sprite.y = item.y;
    }

    removeItemVisual(itemId) {
      const item = this.items[itemId];

      if (!item) {
        return;
      }

      if (item.sprite) {
        item.sprite.destroy();
      }

      delete this.items[itemId];

      if (this.heldItemId === itemId) {
        this.heldItemId = null;
      }
    }

    setScore(value) {
      this.score = value;

      if (this.hudScore) {
        this.hudScore.textContent = `SCORE  ${value}`;
      }
    }

    setStationState(stationData) {
      if (!stationData?.id) {
        return;
      }

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

    // Zoom nguyên: đủ sát, nhưng không bao giờ để vùng nhìn lớn hơn map
    computeZoom() {
      const gw = this.scale.width;
      const gh = this.scale.height;

      // Zoom vừa khít để thấy trọn map ("contain")
      const fitZoom = Math.min(gw / WORLD_W, gh / WORLD_H);

      if (this.zoomMode === "far") {
        return fitZoom;
      }

      // near: sát nhân vật, nhưng không bao giờ xa hơn mức far
      return Math.max(fitZoom, gw / CAMERA_VIEW_W.near);
    }

    setZoomMode(mode) {
      if (mode === this.zoomMode) {
        return;
      }

      this.zoomMode = mode;

      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, mode);
      } catch {
        // trình duyệt chặn localStorage thì bỏ qua, chỉ không nhớ được lựa chọn
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
      cam.setBackgroundColor("#12302e");
      cam.setBounds(0, 0, WORLD_W, WORLD_H);
      cam.setZoom(this.computeZoom());
      cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);

      // Đổi kích thước cửa sổ → tính lại zoom
      const onResize = () => cam.setZoom(this.computeZoom());
      this.scale.on(Phaser.Scale.Events.RESIZE, onResize);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      });

      // Đặt HUD SAU khi camera vẽ xong để không bị lệch một nhịp so với nhân vật
      cam.on(Phaser.Cameras.Scene2D.Events.POST_RENDER, () => this.layoutHud());
    }
    // =====================================
    // HUD  (score / gợi ý phím / chữ trạng thái trạm)
    //
    // Vẽ bằng HTML đặt đè lên canvas để chữ luôn sắc nét,
    // vị trí được tính lại theo kích thước canvas mỗi khung hình.
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

      // Score
      this.hudScore = make(
        "background:#12302e;border-radius:.4em;padding:.2em .8em;transform:translate(-50%,-50%);",
      );
      this.hudScore.textContent = `SCORE  ${this.score}`;

      // Hint (phím E / Q)
      this.hudHint = make(
        "display:none;background:rgba(18,48,46,.95);border-radius:.6em;padding:.35em .6em;transform:translate(-50%,-100%);",
      );

      // Nhãn zoom (góc dưới bên phải)
      this.hudZoom = make(
        "background:rgba(18,48,46,.85);border-radius:.4em;padding:.2em .6em;font-size:.8em;transform:translate(-100%,-100%);",
      );
      this.updateZoomLabel();

      // Chữ trạng thái của trạm (Chopping..., Take it out!...)
      this.stationLabels = {};

      STATIONS.forEach((cfg) => {
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
      if (!this.hudRoot || !this.game.canvas) {
        return;
      }

      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();

      // số pixel màn hình cho mỗi pixel của map
      const k = cam.zoom * (rect.width / this.scale.width);
      const view = cam.worldView;

      const sx = (x) => rect.left + (x - view.x) * k;
      const sy = (y) => rect.top + (y - view.y) * k;

      // Cỡ chữ theo chiều cao cửa sổ, không phụ thuộc zoom
      const fs = Phaser.Math.Clamp(Math.round(rect.height / 50), 12, 20);
      this.hudRoot.style.fontSize = `${fs}px`;

      // Score: cố định giữa phía trên màn hình
      this.hudScore.style.left = `${rect.left + rect.width / 2}px`;
      this.hudScore.style.top = `${rect.top + fs * 1.6}px`;

      this.hudZoom.style.left = `${rect.right - fs}px`;
      this.hudZoom.style.top = `${rect.bottom - fs}px`;

      // Hint: ngay trên đầu người chơi
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

      // Chữ trạng thái trạm: phía trên thanh tiến độ
      STATIONS.forEach((cfg) => {
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

      if (sig === this.hintSig) {
        return;
      }

      this.hintSig = sig;

      const box = this.hudHint;

      if (!box) {
        return;
      }

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

      // Mũi tên nhỏ chỉ xuống người chơi
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
          .ellipse(x, y + 8, 12, 4, 0x000000, 0.25)
          .setDepth(4);

        const player = this.add
          .sprite(x, y + CHEF_FOOT_OFFSET, "chef-orange", 0)
          .setOrigin(0.5, 1)
          .setDepth(5);

        // samples = các mốc vị trí {t, x, y} theo giờ của người gửi
        // clockOffset = chênh lệch đồng hồ (giờ nhận - giờ gửi), lấy mức nhỏ nhất
        // cur = vị trí đang vẽ, prev = vị trí khung hình trước
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

      // Ước lượng chênh lệch đồng hồ giữa 2 máy
      const sentAt = typeof t === "number" ? t : Date.now();
      const sample = Date.now() - sentAt;

      other.clockOffset =
        other.clockOffset === null
          ? sample
          : Math.min(sample, other.clockOffset + 1);

      // Hướng nhìn theo hướng di chuyển giữa 2 mốc vị trí
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
    // INTERACTION  (một nguồn duy nhất cho phím E + gợi ý)
    // =====================================

    distanceTo(x, y) {
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
    }

    // Item nằm dưới đất gần nhất (item thường và đĩa)
    findNearbyItem() {
      if (!this.player) {
        return null;
      }

      let closest = null;
      let closestDistance = Infinity;

      Object.values(this.items).forEach((item) => {
        if (item.state !== "available") {
          return;
        }

        const distance = this.distanceTo(item.x, item.y);

        if (distance <= PICKUP_RANGE && distance < closestDistance) {
          closest = item;
          closestDistance = distance;
        }
      });

      return closest;
    }

    // Trả về { label, run } cho hành động E hiện tại, hoặc null.
    findInteraction() {
      if (!this.player) {
        return null;
      }

      // ---------------------------------
      // ĐANG CẦM ITEM
      // ---------------------------------
      if (this.heldItemId) {
        const held = this.items[this.heldItemId];

        if (!held) {
          return null;
        }

        let best = null;

        // 1. Đặt item lên trạm phù hợp
        for (const cfg of STATIONS) {
          const station = this.stations[cfg.id];

          if (station && station.itemId) {
            continue;
          }

          if (!cfg.accepts(held)) {
            continue;
          }

          const d = this.distanceTo(cfg.x, cfg.y);

          if (d > INTERACT_RANGE) {
            continue;
          }

          if (!best || d < best.d) {
            best = {
              d,
              label: cfg.placeLabel,
              run: () => this.placeOnStation(cfg.id),
            };
          }
        }

        // 2. Đặt nguyên liệu đang cầm lên đĩa dưới đất
        if (held.type !== "plate") {
          Object.values(this.items).forEach((item) => {
            if (item.type !== "plate" || item.state !== "available") {
              return;
            }

            const d = this.distanceTo(item.x, item.y);

            if (d > INTERACT_RANGE) {
              return;
            }

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

      // 1. Nhặt item hoặc đĩa đang nằm dưới đất
      const floorItem = this.findNearbyItem();

      if (floorItem) {
        return {
          label: `Pick up ${floorItem.type}`,
          run: () => this.pickUpItem(floorItem.id),
        };
      }

      // 2. Lấy từ trạm / bàn đĩa / kệ
      let best = null;

      const consider = (d, label, run) => {
        if (d > INTERACT_RANGE) {
          return;
        }

        if (!best || d < best.d) {
          best = { d, label, run };
        }
      };

      // Thớt: bấm E để thái / thái tiếp
      // (đặt TRƯỚC nhánh "Take" để thắng khi khoảng cách bằng nhau)
      STATIONS.forEach((cfg) => {
        if (!cfg.chop) {
          return;
        }

        const station = this.stations[cfg.id];
        const item = station && station.itemId && this.items[station.itemId];

        if (!item || item.status !== "raw") {
          return;
        }

        if (!["idle", "paused"].includes(station.cutState)) {
          return;
        }

        consider(
          this.distanceTo(cfg.x, cfg.y),
          station.cutState === "paused" ? "Resume chopping" : "Chop",
          () => this.startCutting(cfg.id),
        );
      });

      STATIONS.forEach((cfg) => {
        const station = this.stations[cfg.id];
        const item = station && station.itemId && this.items[station.itemId];

        if (!item) {
          return;
        }

        consider(
          this.distanceTo(cfg.x, cfg.y),
          `Take ${item.status} ${item.type}`,
          () => this.takeFromStation(cfg.id),
        );
      });

      consider(
        this.distanceTo(PLATE_STATION.x, PLATE_STATION.y),
        "Take plate",
        () => this.takePlate(),
      );

      SHELVES.forEach((shelf) => {
        consider(this.distanceTo(shelf.x, shelf.y), `Take ${shelf.type}`, () =>
          this.takeIngredientFromShelf(shelf),
        );
      });

      return best;
    }

    handleInteract() {
      const action = this.findInteraction();

      if (action) {
        action.run();
      }
    }

    // =====================================
    // ACTIONS (emit lên server)
    // =====================================

    // Toạ độ gửi lên server khi tương tác với một kệ / trạm
    serverPos(targetId) {
      if (SERVER_USES_OLD_COORDS && SERVER_POS[targetId]) {
        return SERVER_POS[targetId];
      }

      return { x: this.player.x, y: this.player.y };
    }

    takeIngredientFromShelf(shelf) {
      if (!this.player || this.heldItemId) {
        return;
      }

      socket.emit("take-ingredient", {
        roomCode,
        userId: user.id,
        shelfId: shelf.id,
        playerX: this.serverPos(shelf.id).x,
        playerY: this.serverPos(shelf.id).y,
      });
    }

    takePlate() {
      if (!this.player || this.heldItemId) {
        return;
      }

      socket.emit("take-plate", {
        roomCode,
        userId: user.id,
        playerX: this.serverPos(PLATE_STATION.id).x,
        playerY: this.serverPos(PLATE_STATION.id).y,
      });
    }

    pickUpItem(itemId) {
      if (!itemId || this.heldItemId) {
        return;
      }

      socket.emit("pick-up-item", {
        roomCode,
        userId: user.id,
        itemId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    placeOnStation(stationId) {
      if (!this.heldItemId) {
        return;
      }

      socket.emit("place-on-station", {
        roomCode,
        userId: user.id,
        stationId,
        itemId: this.heldItemId,
        playerX: this.serverPos(stationId).x,
        playerY: this.serverPos(stationId).y,
      });
    }

    takeFromStation(stationId) {
      if (this.heldItemId) {
        return;
      }

      socket.emit("take-from-station", {
        roomCode,
        userId: user.id,
        stationId,
        playerX: this.serverPos(stationId).x,
        playerY: this.serverPos(stationId).y,
      });
    }

    // Bấm E ở thớt: bắt đầu thái / thái tiếp
    startCutting(stationId) {
      if (this.heldItemId) {
        return;
      }

      socket.emit("start-cutting", {
        roomCode,
        userId: user.id,
        stationId,
        playerX: this.player.x,
        playerY: this.player.y,
      });
    }

    addIngredientToPlate(plateId) {
      if (!this.heldItemId || this.pendingPlateAdd) {
        return;
      }

      // Chặn bấm E liên tục gửi trùng
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

    dropItem() {
      if (!this.heldItemId) {
        return;
      }

      socket.emit("drop-item", {
        roomCode,
        userId: user.id,
        itemId: this.heldItemId,
        x: this.player.x,
        y: this.player.y,
      });
    }

    // =====================================
    // STATION VIEW (thanh tiến độ + chữ trạng thái)
    // =====================================

    updateStationViews() {
      this.stationBar.clear();

      STATIONS.forEach((cfg) => {
        const label = this.stationLabels[cfg.id];
        const station = this.stations[cfg.id];
        const item =
          station && station.itemId ? this.items[station.itemId] : null;

        if (!station || !item) {
          label.setVisible(false);
          return;
        }

        // Item trên trạm: server có thể đặt ở toạ độ cũ → luôn vẽ tại trạm
        if (item.sprite && item.sprite.visible) {
          item.sprite.x = cfg.x;
          item.sprite.y = cfg.y;
        }

        // Thớt chỉ cho thanh chạy khi đang thái; grill luôn chạy
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

        if (label.text !== text) {
          label.setText(text);
        }

        label.setVisible(true);
      });
    }

    // =====================================
    // NHÂN VẬT: vị trí + animation
    // =====================================

    updateChefSprites(dx, dy, delta) {
      if (!this.playerSprite) {
        return;
      }

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

      // Người chơi khác: nội suy giữa các mốc vị trí theo thời gian người gửi,
      // vẽ chậm INTERP_DELAY_MS để luôn có mốc kế tiếp -> tốc độ đều, không giật
      Object.values(this.otherPlayers).forEach((other) => {
        const buf = other.samples;

        if (buf.length > 0 && other.clockOffset !== null) {
          const renderT = Date.now() - other.clockOffset - INTERP_DELAY_MS;

          // Bỏ các mốc đã qua (luôn giữ ít nhất 2 mốc)
          while (buf.length > 2 && buf[1].t <= renderT) {
            buf.shift();
          }

          const a = buf[0];
          const b = buf[1];

          if (!b || renderT <= a.t) {
            other.curX = a.x;
            other.curY = a.y;
          } else if (renderT >= b.t || b.t - a.t > 400) {
            // Đã tới mốc cuối, hoặc 2 mốc cách nhau quá lâu (tab bị treo): đặt thẳng
            other.curX = b.x;
            other.curY = b.y;
          } else {
            const k = (renderT - a.t) / (b.t - a.t);

            other.curX = a.x + (b.x - a.x) * k;
            other.curY = a.y + (b.y - a.y) * k;
          }
        }

        // Có dịch chuyển trong khung hình này -> đang đi bộ
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
      if (!socket.connected) {
        return;
      }

      const x = Math.round(this.player.x);
      const y = Math.round(this.player.y);

      if (x === this.lastSentX && y === this.lastSentY) {
        return;
      }

      // Giới hạn ~20 lần/giây. Khi dừng lại, vị trí cuối vẫn được gửi
      // ở lần kiểm tra kế tiếp vì nó vẫn khác lần gửi trước.
      const nowMs = performance.now();

      if (nowMs - (this.lastSentAt || 0) < POSITION_SEND_INTERVAL) {
        return;
      }

      this.lastSentAt = nowMs;

      this.lastSentX = x;
      this.lastSentY = y;

      // volatile: nếu mạng nghẽn thì bỏ gói cũ thay vì xếp hàng rồi dồn cục
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
      // =================================
      // MOVEMENT (chặn bởi quầy / đảo / lò trong tilemap)
      // =================================

      let dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
      let dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);

      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      const step = PLAYER_SPEED * (delta / 1000);

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

      this.playerShadow.x = this.player.x;
      this.playerShadow.y = this.player.y + 8;

      this.updateChefSprites(dx, dy, delta);

      this.sendPosition();

      // =================================
      // TỰ SỬA heldItemId BỊ KẸT
      // =================================

      if (this.heldItemId && !this.items[this.heldItemId]) {
        this.heldItemId = null;
      }

      // =================================
      // INTERACTION HINT
      // =================================

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

        // Hình item đang cầm trên đầu người chơi
        const color = itemColor(heldItem.type, heldItem.status);

        if (!this.heldItemVisual) {
          this.heldItemVisual = this.add
            .circle(this.player.x, this.player.y, 3, color)
            .setStrokeStyle(1, 0x3b1a0a)
            .setDepth(6);
        }

        const hold = heldItemOffset(this.facing, this.playerSprite.flipX);

        this.heldItemVisual.setFillStyle(color);
        this.heldItemVisual.setDepth(hold.depth);
        this.heldItemVisual.x = this.player.x + hold.x;
        this.heldItemVisual.y = this.player.y + hold.y;
      } else if (this.heldItemVisual) {
        this.heldItemVisual.destroy();
        this.heldItemVisual = null;
      }

      this.updateStationViews();
      this.setHint(hint);
    }
  };
}
