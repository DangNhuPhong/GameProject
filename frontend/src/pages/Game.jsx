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

// =====================================
// STATIONS
// =====================================

const MEAT_SHELF = {
  id: "meat-shelf",
  type: "meat",
  x: 160,
  y: 150,
};

const GRILL = {
  id: "grill",
  x: 450,
  y: 150,
};

// Phải khớp với range của Station phía server (90)
const INTERACT_RANGE = 90;

// Màu item theo trạng thái nấu
function itemColor(type, status) {
  if (status === "burnt") return 0x1f1f1f;
  if (status === "cooked") return 0x8b4513;

  return type === "meat" ? 0xc0392b : 0x8b4513;
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

        // Dynamic items
        this.items = {};

        // Trạng thái các trạm (grill...) do server gửi
        this.stations = {};

        // Item currently held by local player
        this.heldItemId = null;

        // Interaction
        this.hintSig = null;
        this.hintWidth = 0;
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
        // MEAT SHELF
        // =================================

        g.fillStyle(0x6b3f1c, 1);

        g.fillRoundedRect(MEAT_SHELF.x - 95, MEAT_SHELF.y - 42, 190, 84, 12);

        g.fillStyle(0x8b5a2b, 1);

        g.fillRoundedRect(MEAT_SHELF.x - 88, MEAT_SHELF.y - 35, 176, 70, 8);

        this.meatShelf = this.add
          .rectangle(MEAT_SHELF.x, MEAT_SHELF.y, 176, 70, 0x8b5a2b)
          .setStrokeStyle(3, 0x6b3f1c)
          .setDepth(2);

        this.meatShelfLabel = this.makeLabel(MEAT_SHELF.x, 228, "Meat Shelf");

        // =================================
        // GRILL
        // =================================

        g.fillStyle(0x2b333a, 1);

        g.fillRoundedRect(450 - 68, 150 - 44, 136, 88, 12);

        this.grill = this.add
          .rectangle(450, 150, 120, 76, 0x3d474f)
          .setStrokeStyle(3, 0x5b6771)
          .setDepth(1);

        for (let i = 0; i < 5; i++) {
          this.add
            .rectangle(450 - 40 + i * 20, 150, 4, 60, 0x4f5a64)
            .setDepth(1);
        }

        this.add
          .text(450, 150, "GRILL", {
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

        this.grillLabel = this.makeLabel(450, 228, "");

        this.grillLabel.setVisible(false);

        // Thanh tiến độ nướng
        this.grillBar = this.add.graphics().setDepth(7);

        // =================================
        // TOMATO STATION
        // =================================

        g.fillStyle(0x6b3f1c, 1);

        g.fillRoundedRect(740 - 95, 150 - 42, 190, 84, 12);

        g.fillStyle(0x8b5a2b, 1);

        g.fillRoundedRect(740 - 88, 150 - 35, 176, 70, 8);

        this.add
          .circle(706, 154, 16, 0xe63946)
          .setStrokeStyle(3, 0xa4161a)
          .setDepth(3);

        this.add
          .circle(774, 154, 16, 0xe63946)
          .setStrokeStyle(3, 0xa4161a)
          .setDepth(3);

        this.tomato = this.add
          .circle(740, 146, 18, 0xef4b57)
          .setStrokeStyle(3, 0xa4161a)
          .setDepth(3);

        this.makeLabel(740, 228, "Tomato");

        // =================================
        // CURRENT PLAYER
        // =================================

        this.playerShadow = this.add
          .ellipse(W / 2, H / 2 + 24, 44, 12, 0x000000, 0.2)
          .setDepth(4);

        this.player = this.add
          .rectangle(W / 2, H / 2, 40, 40, 0x2563eb)
          .setStrokeStyle(4, 0x1e3a8a)
          .setDepth(5);

        this.playerLabel = this.add
          .text(W / 2, H / 2 - 34, "YOU", {
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

        this.interactKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.E,
        );
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
          console.log("SOCKET URL:", socket.io.uri);
          console.log("SOCKET CONNECTED:", socket.connected);
          console.log("SOCKET ID:", socket.id);
        }

        // =================================
        // GAME STATE
        // =================================

        socket.on("game-state", (state) => {
          console.log("Received game state:", state);

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

          // Rebuild items from server
          if (Array.isArray(state.items)) {
            state.items.forEach((itemData) => {
              this.createItemVisual(itemData);
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
        // ITEM CREATED
        // =================================

        socket.on("item-created", ({ item }) => {
          console.log("Item created:", item);

          if (!item) {
            return;
          }

          this.createItemVisual(item);

          if (item.userId === user.id && item.state === "held") {
            this.heldItemId = item.id;
          }
        });

        // =================================
        // ITEM PICKED
        // =================================

        socket.on("item-picked", ({ item }) => {
          console.log("Item picked:", item);

          if (!item) {
            return;
          }

          if (!this.items[item.id]) {
            this.createItemVisual(item);
          } else {
            this.updateItemVisual(item);
          }

          if (item.userId === user.id && item.state === "held") {
            this.heldItemId = item.id;
          }
        });

        // =================================
        // ITEM DROPPED
        // =================================

        socket.on("item-dropped", ({ item }) => {
          console.log("Item dropped:", item);

          if (!item) {
            return;
          }

          const existing = this.items[item.id];

          if (!existing) {
            this.createItemVisual(item);
          } else {
            this.updateItemVisual(item);
          }

          if (this.heldItemId === item.id && item.userId !== user.id) {
            this.heldItemId = null;
          }

          if (this.heldItemId === item.id && item.state === "available") {
            this.heldItemId = null;
          }
        });

        // =================================
        // STATION UPDATED
        // =================================

        socket.on("station-updated", ({ station, item }) => {
          console.log("Station updated:", station, item);

          if (item) {
            // Tạo mới hoặc cập nhật visual của item
            this.createItemVisual(item);

            if (item.userId === user.id && item.state === "held") {
              this.heldItemId = item.id;
            } else if (this.heldItemId === item.id) {
              // Item đã được đặt lên trạm
              this.heldItemId = null;
            }
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
      // ITEM HELPERS
      // =====================================

      createItemVisual(itemData) {
        if (!itemData?.id) {
          return;
        }

        // Update existing item
        if (this.items[itemData.id]) {
          this.updateItemVisual(itemData);
          return;
        }

        const color = itemColor(itemData.type, itemData.status);

        const sprite = this.add
          .circle(itemData.x, itemData.y, 15, color)
          .setStrokeStyle(3, 0x4e2a0b)
          .setDepth(6);

        this.items[itemData.id] = {
          id: itemData.id,
          type: itemData.type,
          state: itemData.state,
          status: itemData.status || "raw",
          stationId: itemData.stationId || null,
          userId: itemData.userId,
          x: itemData.x,
          y: itemData.y,
          sprite,
        };

        if (itemData.userId === user.id && itemData.state === "held") {
          this.heldItemId = itemData.id;

          sprite.setVisible(false);
        }

        this.updateItemVisual(itemData);
      }

      updateItemVisual(itemData) {
        const item = this.items[itemData.id];

        if (!item) {
          return;
        }

        item.state = itemData.state;

        item.userId = itemData.userId;

        item.status = itemData.status || item.status || "raw";

        item.stationId = itemData.stationId || null;

        item.x = itemData.x;
        item.y = itemData.y;

        if (!item.sprite) {
          return;
        }

        // Màu theo trạng thái: sống / chín / cháy
        item.sprite.setFillStyle(itemColor(item.type, item.status));

        // Held by current player
        if (itemData.state === "held" && itemData.userId === user.id) {
          item.sprite.setVisible(false);
          return;
        }

        // Held by another player
        if (itemData.state === "held") {
          item.sprite.setVisible(false);
          return;
        }

        // Available on floor
        item.sprite.setVisible(true);

        item.sprite.x = itemData.x;

        item.sprite.y = itemData.y;
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

      // =====================================
      // LABEL
      // =====================================

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

      setGrillText(text) {
        this.grillLabel.setText(text);

        this.grillLabel.setVisible(Boolean(text));
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
      // ACTIONS
      // =====================================

      takeMeatFromShelf() {
        console.log("===== TAKE MEAT START =====");

        if (!this.player) {
          console.log("NO PLAYER");
          return;
        }

        console.log("PLAYER:", this.player.x, this.player.y);
        console.log("SHELF:", this.meatShelf.x, this.meatShelf.y);

        const distance = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          this.meatShelf.x,
          this.meatShelf.y,
        );

        console.log("DISTANCE:", distance);

        if (distance > 90) {
          console.log("TOO FAR");
          return;
        }

        if (this.heldItemId) {
          console.log("ALREADY HOLDING:", this.heldItemId);
          return;
        }

        console.log("SENDING TAKE INGREDIENT");
        console.log("SOCKET CONNECTED:", socket.connected);
        console.log("SOCKET ID:", socket.id);

        socket.emit("take-ingredient", {
          roomCode,
          userId: user.id,
          shelfId: "meat-shelf",
          playerX: this.player.x,
          playerY: this.player.y,
        });
      }

      findNearbyItem() {
        if (!this.player) {
          return null;
        }

        // Phải nhỏ hơn hoặc bằng PICKUP_RANGE của server (60)
        const PICKUP_RANGE = 60;

        let closest = null;
        let closestDistance = Infinity;

        Object.values(this.items).forEach((item) => {
          if (item.state !== "available") {
            return;
          }

          const distance = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            item.x,
            item.y,
          );

          if (distance <= PICKUP_RANGE && distance < closestDistance) {
            closest = item;
            closestDistance = distance;
          }
        });

        return closest;
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

      setStationState(stationData) {
        if (!stationData?.id) {
          return;
        }

        this.stations[stationData.id] = {
          id: stationData.id,
          itemId: stationData.itemId || null,
          cookTime: stationData.cookTime || 5000,
          burnTime: stationData.burnTime || 10000,
          elapsedMs: stationData.elapsedMs || 0,
          receivedAt: Date.now(),
        };
      }

      distanceTo(x, y) {
        return Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
      }

      // Đang cầm thịt sống, gần grill và grill còn trống
      canPlaceOnGrill() {
        if (!this.player || !this.heldItemId) {
          return false;
        }

        const heldItem = this.items[this.heldItemId];

        const station = this.stations[GRILL.id];

        if (
          !heldItem ||
          heldItem.type !== "meat" ||
          heldItem.status !== "raw"
        ) {
          return false;
        }

        if (station && station.itemId) {
          return false;
        }

        return this.distanceTo(GRILL.x, GRILL.y) <= INTERACT_RANGE;
      }

      // Tay trống, gần grill và grill đang có món
      canTakeFromGrill() {
        if (!this.player || this.heldItemId) {
          return false;
        }

        const station = this.stations[GRILL.id];

        if (!station || !station.itemId) {
          return false;
        }

        return this.distanceTo(GRILL.x, GRILL.y) <= INTERACT_RANGE;
      }

      // Xử lý phím E theo thứ tự ưu tiên
      handleInteract() {
        if (!this.player) {
          return;
        }

        // 1. Đang cầm item: đặt lên trạm nếu hợp lệ
        if (this.heldItemId) {
          if (this.canPlaceOnGrill()) {
            this.placeOnStation(GRILL.id);
          }

          return;
        }

        // 2. Nhặt item rơi dưới đất
        const nearbyItem = this.findNearbyItem();

        if (nearbyItem) {
          this.pickUpItem(nearbyItem.id);
          return;
        }

        // 3. Lấy món từ grill
        if (this.canTakeFromGrill()) {
          this.takeFromStation(GRILL.id);
          return;
        }

        // 4. Lấy thịt từ shelf
        this.takeMeatFromShelf();
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

      // Vẽ thanh tiến độ + chữ trạng thái của grill
      updateGrillView() {
        if (!this.grillBar) {
          return;
        }

        this.grillBar.clear();

        const station = this.stations[GRILL.id];

        const item =
          station && station.itemId ? this.items[station.itemId] : null;

        if (!station || !item) {
          this.setGrillText("");

          return;
        }

        const elapsed = station.elapsedMs + (Date.now() - station.receivedAt);

        let progress = 0;
        let color = 0x22c55e;
        let text = "Cooking...";

        if (item.status === "burnt") {
          progress = 1;
          color = 0x111827;
          text = "Burnt!";
        } else if (item.status === "cooked") {
          // Thanh cam: còn bao lâu nữa thì cháy
          progress = Phaser.Math.Clamp(
            (elapsed - station.cookTime) /
              (station.burnTime - station.cookTime),
            0,
            1,
          );
          color = 0xf59e0b;
          text = "Cooked! Take it out";
        } else {
          progress = Phaser.Math.Clamp(elapsed / station.cookTime, 0, 1);
        }

        const barW = 100;
        const barH = 10;
        const barX = GRILL.x - barW / 2;
        const barY = GRILL.y - 42;

        this.grillBar.fillStyle(0x000000, 0.55);
        this.grillBar.fillRoundedRect(
          barX - 2,
          barY - 2,
          barW + 4,
          barH + 4,
          4,
        );

        this.grillBar.fillStyle(color, 1);
        this.grillBar.fillRect(barX, barY, barW * progress, barH);

        if (this.grillLabel.text !== text) {
          this.setGrillText(text);
        }
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
          80,
          this.scale.height - 40,
        );

        // Player label
        this.playerLabel.x = this.player.x;

        this.playerLabel.y = this.player.y - 34;

        // Player shadow
        this.playerShadow.x = this.player.x;

        this.playerShadow.y = this.player.y + 24;

        // Send multiplayer position
        this.sendPosition();

        // =================================
        // INTERACTION
        // =================================

        let hint = null;

        // ---------------------------------
        // PLAYER IS HOLDING ITEM
        // ---------------------------------

        if (this.heldItemId) {
          const heldItem = this.items[this.heldItemId];

          // Q = drop
          if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
            this.dropItem();
          }

          hint = [];

          if (this.canPlaceOnGrill()) {
            hint.push({
              key: "E",
              label: "Cook meat",
            });
          }

          hint.push({
            key: "Q",
            label: "Drop meat",
          });

          // Held item follows player
          if (heldItem) {
            const color = itemColor(heldItem.type, heldItem.status);

            if (heldItem.sprite) {
              heldItem.sprite.setVisible(false);
            }

            // Draw held item
            if (!this.heldItemVisual) {
              this.heldItemVisual = this.add
                .circle(this.player.x, this.player.y - 25, 10, color)
                .setStrokeStyle(2, 0x3b1a0a)
                .setDepth(6);
            }

            this.heldItemVisual.setFillStyle(color);

            this.heldItemVisual.x = this.player.x;

            this.heldItemVisual.y = this.player.y - 25;
          }
        }

        // ---------------------------------
        // PLAYER IS NOT HOLDING ITEM
        // ---------------------------------
        else {
          // Hide held visual
          if (this.heldItemVisual) {
            this.heldItemVisual.destroy();

            this.heldItemVisual = null;
          }

          // --------------------------------
          // MEAT SHELF
          // --------------------------------

          const distanceToShelf = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            this.meatShelf.x,
            this.meatShelf.y,
          );

          if (distanceToShelf < 90) {
            hint = [
              {
                key: "E",
                label: "Take meat",
              },
            ];
          }

          // --------------------------------
          // GRILL
          // --------------------------------

          if (this.canTakeFromGrill()) {
            const grillStation = this.stations[GRILL.id];

            const grillItem = this.items[grillStation.itemId];

            const status = grillItem ? grillItem.status : "raw";

            const label =
              status === "cooked"
                ? "Take cooked meat"
                : status === "burnt"
                  ? "Take burnt meat"
                  : "Take raw meat";

            hint = [
              {
                key: "E",
                label,
              },
            ];
          }
        }

        // =================================
        // HINT POSITION
        // =================================

        this.updateGrillView();

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
      socket.off("station-updated");
      socket.off("item-dropped");
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

      {/* Top bar */}
      <header className="hud-top">
        <div className="hud-panel hud-brand">
          <h1>Kitchen Panic</h1>

          <span className="hud-room">Room {roomCode}</span>
        </div>

        <div className="hud-panel hud-score">
          <span className="hud-score-label">Score</span>

          <strong>0</strong>
        </div>

        <div className="hud-right">
          <div className="hud-panel hud-players">
            Players {match?.players?.length || 0}/{match?.max_players || 0}
          </div>

          <button className="leave-button" onClick={() => navigate("/")}>
            Leave game
          </button>
        </div>
      </header>

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

      {/* Player */}
      <div className="hud-panel hud-player">
        <span className="hud-player-name">{user?.email}</span>

        <span>Score 0</span>

        <span>Coins 0</span>
      </div>

      {/* Controls */}
      <footer className="hud-panel hud-controls">
        <span>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
          Move
        </span>

        <span>
          <kbd>E</kbd>
          Interact
        </span>

        <span>
          <kbd>Q</kbd>
          Drop
        </span>
      </footer>
    </div>
  );
}

export default Game;
