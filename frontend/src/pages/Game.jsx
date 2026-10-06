import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";
import { getMatch, getRecipes } from "../services/api";
import { socket } from "../services/socket";

import "./Game.css";

// =====================================
// WORLD
// =====================================

const WORLD_W = 1200;
const WORLD_H = 675;
const TILE = 60;

const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";

const TEXT_RES = 2;

// Người chơi chỉ đi được ở khu vực phía trước quầy
const PLAYER_MIN_Y = 225;

// Phải khớp với range phía server (Station.range, IngredientShelf.canTake)
const INTERACT_RANGE = 100;

// Phải nhỏ hơn hoặc bằng PICKUP_RANGE của server (60)
const PICKUP_RANGE = 60;

// =====================================
// LAYOUT  (phải khớp với GameRoom.js)
//
//  Quầy tường (y = 150)
//  Meat → Grill   |   Tomato → Cutting   |   Salad
//
//  Đảo giữa phòng (y = 400)
//  Bread, Dough   |   Plates
// =====================================

const COUNTER_Y = 150;
const ISLAND_Y = 400;

const SHELVES = [
  { id: "meat-shelf", type: "meat", name: "Meat", x: 110, y: COUNTER_Y },
  { id: "tomato-shelf", type: "tomato", name: "Tomato", x: 470, y: COUNTER_Y },
  { id: "salad-shelf", type: "salad", name: "Salad", x: 830, y: COUNTER_Y },
  { id: "bread-shelf", type: "bread", name: "Bread", x: 300, y: ISLAND_Y },
  { id: "dough-shelf", type: "dough", name: "Dough", x: 470, y: ISLAND_Y },
];

const PLATE_STATION = {
  id: "plate-station",
  x: 800,
  y: ISLAND_Y,
};

const GRILL = {
  id: "grill",
  x: 280,
  y: COUNTER_Y,
};

const CUTTING_BOARD = {
  id: "cutting-board",
  x: 640,
  y: COUNTER_Y,
};

// Mô tả các trạm nấu / sơ chế.
//   accepts(item)  : item đang cầm có đặt lên trạm được không
//   placeLabel     : chữ gợi ý khi đặt lên
//   progress(...)  : thanh tiến độ + chữ trạng thái
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
          text: "Cooked! Take it out",
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
    accepts: (item) =>
      (item.type === "tomato" || item.type === "salad") &&
      item.status === "raw",
    placeLabel: "Chop",
    progress: (item, st, elapsed) => {
      if (item.status === "chopped") {
        return { progress: 1, color: 0x22c55e, text: "Chopped! Take it out" };
      }

      return {
        progress: Phaser.Math.Clamp(elapsed / st.cutTime, 0, 1),
        color: 0x38bdf8,
        text: "Chopping...",
      };
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
    if (type === "tomato") {
      return 0xff6b6b;
    }

    return 0x86efac;
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
// GAME
// =====================================

function Game() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const gameRef = useRef(null);

  const [user, setUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersOpen, setOrdersOpen] = useState(true);

  // =====================================
  // LOAD GAME DATA
  // =====================================

  useEffect(() => {
    let mounted = true;

    const loadGame = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const matchResult = await getMatch(roomCode);
        const recipeData = await getRecipes();

        if (!mounted) {
          return;
        }

        setUser(user);
        setMatch(matchResult.data);
        setRecipes(recipeData);
        setLoading(false);
      } catch (error) {
        console.error("Game loading error:", error);

        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadGame();

    return () => {
      mounted = false;
    };
  }, [navigate, roomCode]);

  // =====================================
  // PHASER GAME
  // =====================================

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!match) return;
    if (!gameRef.current) return;

    let game;

    class KitchenScene extends Phaser.Scene {
      constructor() {
        super("KitchenScene");

        // Other players
        this.otherPlayers = {};

        // Position synchronization
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

        // Score hiển thị trong map
        this.score = 0;
      }

      preload() {}

      // =====================================
      // CREATE
      // =====================================

      create() {
        const W = WORLD_W;
        const H = WORLD_H;

        // =================================
        // FLOOR
        // =================================

        const g = this.add.graphics().setDepth(0);

        for (let r = 0; r < Math.ceil(H / TILE); r++) {
          for (let c = 0; c < Math.ceil(W / TILE); c++) {
            g.fillStyle((r + c) % 2 === 0 ? 0xe3ece9 : 0xd5e2de, 1);

            g.fillRect(c * TILE, r * TILE, TILE, TILE);
          }
        }

        // =================================
        // WALL + COUNTER
        // =================================

        g.fillStyle(0x1f4d4a, 1);
        g.fillRect(0, 0, W, 96);

        g.fillStyle(0x17403d, 1);
        g.fillRect(0, 84, W, 12);

        // Counter shadow
        g.fillStyle(0x000000, 0.12);
        g.fillRect(0, 206, W, 12);

        // Counter top
        g.fillStyle(0xdcae72, 1);
        g.fillRect(0, 96, W, 94);

        g.fillStyle(0xeac38a, 1);
        g.fillRect(0, 96, W, 4);

        // Counter front
        g.fillStyle(0xa8743b, 1);
        g.fillRect(0, 190, W, 16);

        // =================================
        // ISLAND (bread / dough / plates)
        // =================================

        const islandX = 215;
        const islandW = 670;
        const islandTop = ISLAND_Y - 60;

        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(islandX, islandTop + 10, islandW, 130, 14);

        g.fillStyle(0xa8743b, 1);
        g.fillRoundedRect(islandX, islandTop, islandW, 130, 14);

        g.fillStyle(0xdcae72, 1);
        g.fillRoundedRect(islandX, islandTop, islandW, 112, 14);

        g.fillStyle(0xeac38a, 1);
        g.fillRoundedRect(islandX + 6, islandTop + 4, islandW - 12, 6, 3);

        // =================================
        // SCORE (in map)
        // =================================

        this.scoreText = this.add
          .text(W / 2, 44, "SCORE  0", {
            fontFamily: FONT,
            fontSize: "28px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "#12302e",
            padding: {
              x: 22,
              y: 6,
            },
            resolution: TEXT_RES,
          })
          .setOrigin(0.5)
          .setDepth(10);

        // =================================
        // INGREDIENT SHELVES
        // =================================

        SHELVES.forEach((shelf) => {
          this.drawBlock(g, shelf.x, shelf.y, 150, 80, 0x6b3f1c, 0x8b5a2b);

          this.drawShelfIcons(shelf.type, shelf.x, shelf.y);

          this.makeLabel(shelf.x, shelf.y + 60, `${shelf.name} Shelf`);
        });

        // =================================
        // GRILL
        // =================================

        this.drawBlock(g, GRILL.x, GRILL.y, 140, 80, 0x2b333a, 0x3d474f);

        for (let i = 0; i < 5; i++) {
          this.add
            .rectangle(GRILL.x - 40 + i * 20, GRILL.y, 4, 54, 0x4f5a64)
            .setDepth(1);
        }

        this.add
          .text(GRILL.x, GRILL.y, "GRILL", {
            fontFamily: FONT,
            fontSize: "20px",
            fontStyle: "bold",
            color: "#ffffff",
            stroke: "#2b333a",
            strokeThickness: 4,
            resolution: TEXT_RES,
          })
          .setOrigin(0.5)
          .setDepth(2);

        this.makeLabel(GRILL.x, GRILL.y + 60, "Grill");

        // =================================
        // CUTTING BOARD
        // =================================

        this.drawBlock(
          g,
          CUTTING_BOARD.x,
          CUTTING_BOARD.y,
          140,
          80,
          0x8b5a2b,
          0xd9b47a,
        );

        // Knife
        g.lineStyle(5, 0xd9d9d9, 1);
        g.beginPath();
        g.moveTo(CUTTING_BOARD.x - 18, CUTTING_BOARD.y - 10);
        g.lineTo(CUTTING_BOARD.x + 15, CUTTING_BOARD.y + 10);
        g.strokePath();

        g.lineStyle(6, 0x3b2415, 1);
        g.beginPath();
        g.moveTo(CUTTING_BOARD.x + 15, CUTTING_BOARD.y + 10);
        g.lineTo(CUTTING_BOARD.x + 27, CUTTING_BOARD.y + 18);
        g.strokePath();

        this.makeLabel(CUTTING_BOARD.x, CUTTING_BOARD.y + 60, "Cutting Board");

        // =================================
        // PLATE STATION
        // =================================

        this.drawBlock(
          g,
          PLATE_STATION.x,
          PLATE_STATION.y,
          140,
          80,
          0x475569,
          0x64748b,
        );

        for (let i = 0; i < 3; i++) {
          this.add
            .ellipse(
              PLATE_STATION.x,
              PLATE_STATION.y + 8 - i * 6,
              54,
              26,
              0xffffff,
            )
            .setStrokeStyle(2, 0x94a3b8)
            .setDepth(3);
        }

        this.makeLabel(PLATE_STATION.x, PLATE_STATION.y + 60, "Plates");

        // =================================
        // STATION PROGRESS (grill + cutting board)
        // =================================

        this.stationBar = this.add.graphics().setDepth(7);

        this.stationLabels = {};

        STATIONS.forEach((cfg) => {
          const label = this.makeLabel(cfg.x, cfg.y - 72, "");

          label.setDepth(8);
          label.setVisible(false);

          this.stationLabels[cfg.id] = label;
        });

        // =================================
        // CURRENT PLAYER
        // =================================

        const spawnX = W / 2 + 20;
        const spawnY = 290;

        this.playerShadow = this.add
          .ellipse(spawnX, spawnY + 24, 44, 12, 0x000000, 0.2)
          .setDepth(4);

        this.player = this.add
          .rectangle(spawnX, spawnY, 40, 40, 0x2563eb)
          .setStrokeStyle(4, 0x1e3a8a)
          .setDepth(5);

        this.playerLabel = this.add
          .text(spawnX, spawnY - 34, "YOU", {
            fontFamily: FONT,
            fontSize: "14px",
            fontStyle: "bold",
            color: "#1e3a8a",
            resolution: TEXT_RES,
          })
          .setOrigin(0.5)
          .setDepth(5);

        // =================================
        // HINT BUBBLE
        // =================================

        this.hintContainer = this.add.container(0, 0).setDepth(20);

        this.hintContainer.setVisible(false);

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

        // =================================
        // SOCKET CONNECT
        // =================================

        if (!socket.connected) {
          socket.connect();
        }

        // =================================
        // GAME STATE
        // =================================

        socket.on("game-state", (state) => {
          if (!state) {
            return;
          }

          // Remove old item visuals
          Object.values(this.items).forEach((item) => {
            if (item.sprite) {
              item.sprite.destroy();
            }
          });

          this.items = {};
          this.heldItemId = null;

          // Rebuild items from server (gồm cả đĩa)
          if (Array.isArray(state.items)) {
            state.items.forEach((itemData) => {
              this.upsertItem(itemData);
            });
          }

          // Rebuild stations from server
          this.stations = {};

          if (Array.isArray(state.stations)) {
            state.stations.forEach((stationData) => {
              this.setStationState(stationData);
            });
          }
        });

        // =================================
        // ITEM EVENTS
        //
        // item / plate đều đi qua upsertItem,
        // heldItemId được cập nhật ở đó.
        // =================================

        this.itemEvents = [
          "item-created",
          "item-picked",
          "item-dropped",
          "plate-created",
          "plate-picked",
          "plate-dropped",
        ];

        this.itemEvents.forEach((eventName) => {
          socket.on(eventName, (payload) => {
            const item = payload?.item || payload?.plate;

            if (!item) {
              return;
            }

            this.upsertItem(item);
          });
        });

        // =================================
        // STATION UPDATED
        // =================================

        socket.on("station-updated", ({ station, item }) => {
          if (item) {
            this.upsertItem(item);
          }

          if (station) {
            this.setStationState(station);
          }
        });

        // =================================
        // PLAYER POSITION
        // =================================

        socket.on("player-position", ({ userId, x, y }) => {
          if (userId === user.id) {
            return;
          }

          this.updateOtherPlayer(userId, x, y);
        });

        // =================================
        // PLAYER JOINED
        // =================================

        socket.on("player-joined", ({ userId }) => {
          if (userId === user.id) {
            return;
          }

          console.log("Player joined:", userId);
        });

        // =================================
        // JOIN ROOM
        // =================================

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });
      }

      // =====================================
      // DRAW HELPERS
      // =====================================

      drawBlock(g, x, y, w, h, outer, inner) {
        // Bóng
        g.fillStyle(0x000000, 0.15);
        g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 5, w, h, 12);

        g.fillStyle(outer, 1);
        g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);

        g.fillStyle(inner, 1);
        g.fillRoundedRect(x - w / 2 + 7, y - h / 2 + 7, w - 14, h - 14, 8);
      }

      drawShelfIcons(type, x, y) {
        switch (type) {
          case "meat":
            [-1, 0, 1].forEach((i) => {
              this.add
                .ellipse(x + i * 38, y + (i === 0 ? -6 : 5), 32, 22, 0xc0392b)
                .setStrokeStyle(2, 0x7f1d1d)
                .setDepth(3);
            });
            break;

          case "tomato":
            this.add
              .circle(x - 34, y + 5, 16, 0xef4444)
              .setStrokeStyle(3, 0xa4161a)
              .setDepth(3);

            this.add
              .circle(x + 34, y + 5, 16, 0xef4444)
              .setStrokeStyle(3, 0xa4161a)
              .setDepth(3);

            this.add
              .circle(x, y - 8, 18, 0xf87171)
              .setStrokeStyle(3, 0xa4161a)
              .setDepth(3);
            break;

          case "salad":
            for (let i = 0; i < 5; i++) {
              const angle = (i / 5) * Math.PI * 2;

              this.add
                .ellipse(
                  x + Math.cos(angle) * 28,
                  y + Math.sin(angle) * 16,
                  30,
                  20,
                  0x22c55e,
                )
                .setStrokeStyle(2, 0x15803d)
                .setDepth(3);
            }
            break;

          case "bread":
            [-1, 1].forEach((i) => {
              this.add
                .ellipse(x + i * 32, y, 50, 28, 0xd9a441)
                .setStrokeStyle(3, 0x92400e)
                .setDepth(3);
            });
            break;

          case "dough":
            [-1, 1].forEach((i) => {
              this.add
                .circle(x + i * 30, y, 18, 0xf5d6a6)
                .setStrokeStyle(3, 0xc9a36b)
                .setDepth(3);
            });
            break;

          default:
            break;
        }
      }

      makeLabel(x, y, text) {
        return this.add
          .text(x, y, text, {
            fontFamily: FONT,
            fontSize: "15px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "#12302e",
            padding: {
              x: 10,
              y: 4,
            },
            resolution: TEXT_RES,
          })
          .setOrigin(0.5)
          .setDepth(2);
      }

      // =====================================
      // ITEM HELPERS
      //
      // Item thường và đĩa dùng chung một cấu trúc
      // (type, state, status, x, y, userId, stationId)
      // nên findNearbyItem / heldItemId hoạt động như nhau.
      // =====================================

      upsertItem(itemData) {
        if (!itemData?.id) {
          return;
        }

        if (!this.items[itemData.id]) {
          const isPlate = itemData.type === "plate";

          const sprite = isPlate
            ? this.add
                .ellipse(itemData.x, itemData.y, 44, 30, 0xffffff)
                .setStrokeStyle(3, 0x94a3b8)
                .setDepth(6)
            : this.add
                .circle(itemData.x, itemData.y, 15, 0xffffff)
                .setStrokeStyle(3, 0x4e2a0b)
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

        // Màu: sống / chín / cháy / đã thái
        item.sprite.setFillStyle(itemColor(item.type, item.status));

        // Đang được cầm (mình hoặc người khác) → ẩn, vẽ ở chỗ người cầm
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

        if (this.scoreText) {
          this.scoreText.setText(`SCORE  ${value}`);
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
          receivedAt: Date.now(),
        };
      }

      // =====================================
      // HINT BUBBLE
      // =====================================

      setHint(entries) {
        const sig = entries
          ? entries.map((e) => `${e.key}:${e.label}`).join("|")
          : "";

        if (sig === this.hintSig) {
          return;
        }

        this.hintSig = sig;

        this.hintContainer.removeAll(true);

        if (!entries || entries.length === 0) {
          this.hintContainer.setVisible(false);

          this.hintWidth = 0;

          return;
        }

        const capW = 24;
        const capH = 24;
        const labelGap = 8;
        const itemGap = 16;
        const padX = 12;
        const h = 36;

        const items = entries.map((e) => ({
          key: this.add
            .text(0, 0, e.key, {
              fontFamily: FONT,
              fontSize: "14px",
              fontStyle: "bold",
              color: "#12302e",
              resolution: TEXT_RES,
            })
            .setOrigin(0.5),

          label: this.add
            .text(0, 0, e.label, {
              fontFamily: FONT,
              fontSize: "15px",
              fontStyle: "bold",
              color: "#ffffff",
              resolution: TEXT_RES,
            })
            .setOrigin(0, 0.5),
        }));

        const total =
          padX * 2 +
          items.reduce((sum, i) => sum + capW + labelGap + i.label.width, 0) +
          itemGap * (items.length - 1);

        const bg = this.add.graphics();

        bg.fillStyle(0x12302e, 0.94);

        bg.fillRoundedRect(-total / 2, -h / 2, total, h, 12);

        bg.fillTriangle(-7, h / 2 - 1, 7, h / 2 - 1, 0, h / 2 + 7);

        this.hintContainer.add(bg);

        let x = -total / 2 + padX;

        items.forEach((i) => {
          bg.fillStyle(0xa8743b, 1);

          bg.fillRoundedRect(x, -capH / 2 + 2, capW, capH, 6);

          bg.fillStyle(0xfff3d6, 1);

          bg.fillRoundedRect(x, -capH / 2, capW, capH, 6);

          i.key.setPosition(x + capW / 2, -1);

          i.label.setPosition(x + capW + labelGap, 0);

          this.hintContainer.add([i.key, i.label]);

          x += capW + labelGap + i.label.width + itemGap;
        });

        this.hintWidth = total;

        this.hintContainer.setVisible(true);
      }

      // =====================================
      // OTHER PLAYERS
      // =====================================

      updateOtherPlayer(userId, x, y) {
        if (!this.otherPlayers[userId]) {
          const shadow = this.add
            .ellipse(x, y + 24, 44, 12, 0x000000, 0.2)
            .setDepth(4);

          const player = this.add
            .rectangle(x, y, 40, 40, 0xf59e0b)
            .setStrokeStyle(4, 0x92400e)
            .setDepth(5);

          const label = this.add
            .text(x, y - 34, "PLAYER", {
              fontFamily: FONT,
              fontSize: "14px",
              fontStyle: "bold",
              color: "#92400e",
              resolution: TEXT_RES,
            })
            .setOrigin(0.5)
            .setDepth(5);

          this.otherPlayers[userId] = {
            shadow,
            player,
            label,
          };
        }

        const other = this.otherPlayers[userId];

        other.player.x = x;
        other.player.y = y;

        other.shadow.x = x;
        other.shadow.y = y + 24;

        other.label.x = x;
        other.label.y = y - 34;
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
        // ĐANG CẦM ITEM → đặt lên trạm gần nhất phù hợp
        // ---------------------------------

        if (this.heldItemId) {
          const held = this.items[this.heldItemId];

          if (!held) {
            return null;
          }

          let best = null;

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

          return best;
        }

        // ---------------------------------
        // TAY TRỐNG
        // ---------------------------------

        // 1. Item / đĩa đang nằm dưới đất → ưu tiên cao nhất
        const floorItem = this.findNearbyItem();

        if (floorItem) {
          return {
            label: `Pick up ${floorItem.type}`,
            run: () => this.pickUpItem(floorItem.id),
          };
        }

        // 2. Lấy từ trạm / bàn đĩa / kệ → chọn cái gần nhất
        let best = null;

        const consider = (d, label, run) => {
          if (d > INTERACT_RANGE) {
            return;
          }

          if (!best || d < best.d) {
            best = { d, label, run };
          }
        };

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
          consider(
            this.distanceTo(shelf.x, shelf.y),
            `Take ${shelf.type}`,
            () => this.takeIngredientFromShelf(shelf),
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

      takeIngredientFromShelf(shelf) {
        if (!this.player || this.heldItemId) {
          return;
        }

        socket.emit("take-ingredient", {
          roomCode,
          userId: user.id,
          shelfId: shelf.id,
          playerX: this.player.x,
          playerY: this.player.y,
        });
      }

      takePlate() {
        if (!this.player || this.heldItemId) {
          return;
        }

        socket.emit("take-plate", {
          roomCode,
          userId: user.id,
          playerX: this.player.x,
          playerY: this.player.y,
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
          playerX: this.player.x,
          playerY: this.player.y,
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

          const elapsed = station.elapsedMs + (Date.now() - station.receivedAt);

          const { progress, color, text } = cfg.progress(
            item,
            station,
            elapsed,
          );

          const barW = 100;
          const barH = 10;
          const barX = cfg.x - barW / 2;
          const barY = cfg.y - 56;

          this.stationBar.fillStyle(0x000000, 0.55);
          this.stationBar.fillRoundedRect(
            barX - 2,
            barY - 2,
            barW + 4,
            barH + 4,
            4,
          );

          this.stationBar.fillStyle(color, 1);
          this.stationBar.fillRect(barX, barY, barW * progress, barH);

          if (label.text !== text) {
            label.setText(text);
          }

          label.setVisible(true);
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

        this.lastSentX = x;
        this.lastSentY = y;

        socket.emit("player-position", {
          roomCode,
          userId: user.id,
          x,
          y,
        });
      }

      // =====================================
      // UPDATE
      // =====================================

      update() {
        const speed = 4;

        // =================================
        // MOVEMENT
        // =================================

        if (this.keys.W.isDown) {
          this.player.y -= speed;
        }

        if (this.keys.S.isDown) {
          this.player.y += speed;
        }

        if (this.keys.A.isDown) {
          this.player.x -= speed;
        }

        if (this.keys.D.isDown) {
          this.player.x += speed;
        }

        // World bounds
        this.player.x = Phaser.Math.Clamp(
          this.player.x,
          40,
          this.scale.width - 40,
        );

        this.player.y = Phaser.Math.Clamp(
          this.player.y,
          PLAYER_MIN_Y,
          this.scale.height - 40,
        );

        this.playerLabel.x = this.player.x;
        this.playerLabel.y = this.player.y - 34;

        this.playerShadow.x = this.player.x;
        this.playerShadow.y = this.player.y + 24;

        this.sendPosition();

        // =================================
        // TỰ SỬA heldItemId BỊ KẸT
        // (trỏ tới item không còn tồn tại → E sẽ không bao giờ nhặt được)
        // =================================

        if (this.heldItemId && !this.items[this.heldItemId]) {
          this.heldItemId = null;
        }

        // =================================
        // INTERACTION HINT
        // =================================

        const heldItem = this.heldItemId ? this.items[this.heldItemId] : null;

        let hint = [];

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
              .circle(this.player.x, this.player.y - 25, 10, color)
              .setStrokeStyle(2, 0x3b1a0a)
              .setDepth(6);
          }

          this.heldItemVisual.setFillStyle(color);

          this.heldItemVisual.x = this.player.x;
          this.heldItemVisual.y = this.player.y - 25;
        } else if (this.heldItemVisual) {
          this.heldItemVisual.destroy();

          this.heldItemVisual = null;
        }

        this.updateStationViews();

        this.setHint(hint);

        if (this.hintContainer.visible) {
          const half = this.hintWidth / 2 + 8;

          this.hintContainer.x = Phaser.Math.Clamp(
            this.player.x,
            half,
            this.scale.width - half,
          );

          this.hintContainer.y = Math.max(this.player.y - 74, 28);
        }
      }
    }

    // =====================================
    // PHASER CONFIG
    // =====================================

    const config = {
      type: Phaser.AUTO,

      width: WORLD_W,
      height: WORLD_H,

      parent: gameRef.current,

      backgroundColor: "#12302e",

      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },

      scene: KitchenScene,
    };

    game = new Phaser.Game(config);

    // =====================================
    // CLEANUP
    // =====================================

    return () => {
      socket.off("game-state");
      socket.off("item-created");
      socket.off("item-picked");
      socket.off("item-dropped");
      socket.off("plate-created");
      socket.off("plate-picked");
      socket.off("plate-dropped");
      socket.off("station-updated");
      socket.off("player-position");
      socket.off("player-joined");

      socket.disconnect();

      if (game) {
        game.destroy(true);
      }
    };
  }, [loading, user, match, roomCode]);

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return <div className="game-loading">Loading game...</div>;
  }

  // =====================================
  // GAME UI
  // =====================================

  return (
    <div className="game-page">
      {/* Full-screen Phaser map */}
      <div ref={gameRef} className="phaser-container" />

      {/* Leave */}
      <button className="leave-button" onClick={() => navigate("/")}>
        Leave game
      </button>

      {/* Orders */}
      <aside className="hud-orders">
        <button
          className="orders-toggle"
          onClick={() => setOrdersOpen((open) => !open)}
          aria-expanded={ordersOpen}
        >
          Orders ({recipes.length})
        </button>

        {ordersOpen && (
          <div className="orders-list">
            {recipes.map((recipe) => (
              <div className="ticket" key={recipe.id}>
                <h3>{recipe.name}</h3>

                <div className="ticket-meta">
                  <span>{recipe.base_score} pts</span>

                  <span>{recipe.time_limit}s</span>
                </div>

                <div className="ticket-bar">
                  <span />
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default Game;
