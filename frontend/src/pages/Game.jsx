import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";
import { getMatch, getRecipes } from "../services/api";
import { socket } from "../services/socket";

import "./Game.css";

// World size (16:9). Scaled to fit the whole screen.
// Station coordinates (meat 160,150 / grill 450,150) match the server.
const WORLD_W = 1200;
const WORLD_H = 675;
const TILE = 60;
const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";
const TEXT_RES = 2;

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

        this.otherPlayers = {};

        this.lastSentX = null;
        this.lastSentY = null;

        this.meatAvailable = true;
        this.cooking = false;
        this.cookedMeat = false;
        this.cookingPlayerId = null;

        this.heldItem = null;
        this.heldMeat = null;

        this.cookedMeatObject = null;
        this.localCookingTimer = null;

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

        // counter shadow
        g.fillStyle(0x000000, 0.12);
        g.fillRect(0, 206, W, 12);

        // counter top + front
        g.fillStyle(0xdcae72, 1);
        g.fillRect(0, 96, W, 94);

        g.fillStyle(0xeac38a, 1);
        g.fillRect(0, 96, W, 4);

        g.fillStyle(0xa8743b, 1);
        g.fillRect(0, 190, W, 16);

        // =================================
        // MEAT STATION
        // =================================

        g.fillStyle(0x6b3f1c, 1);
        g.fillRoundedRect(160 - 95, 150 - 42, 190, 84, 12);
        g.fillStyle(0x8b5a2b, 1);
        g.fillRoundedRect(160 - 88, 150 - 35, 176, 70, 8);

        this.meat = this.add
          .circle(160, 150, 20, 0xc0392b)
          .setStrokeStyle(3, 0x7b241c)
          .setDepth(3);

        this.meatLabel = this.makeLabel(160, 228, "Meat");

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
        // HINT BUBBLE (next to the player)
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

        // E = interaction
        this.interactKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.E,
        );

        // Q = drop
        this.dropKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.Q,
        );

        // =================================
        // SOCKET CONNECT
        // =================================

        if (!socket.connected) {
          socket.connect();
        }

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });

        // =================================
        // GAME STATE
        // =================================

        socket.on("game-state", (state) => {
          console.log("Received game state:", state);

          if (!state?.meat) {
            return;
          }

          const meatState = state.meat.state;

          // -----------------------------
          // AVAILABLE
          // -----------------------------

          if (meatState === "available") {
            this.cooking = false;
            this.cookingPlayerId = null;
            this.setGrillText("");

            this.clearCookedMeatObject();

            if (state.meat.itemType === "cooked-meat") {
              // Cooked meat lying on the floor
              this.meatAvailable = false;
              this.cookedMeat = true;

              this.meat.setVisible(false);
              this.meatLabel.setVisible(false);

              this.cookedMeatObject = this.createCookedMeat(
                state.meat.x,
                state.meat.y,
              );
            } else {
              // Raw meat
              this.meatAvailable = true;
              this.cookedMeat = false;

              this.meat.setPosition(state.meat.x, state.meat.y);
              this.meat.setVisible(true);
              this.meatLabel.setVisible(true);
            }
          }

          // -----------------------------
          // HELD
          // -----------------------------

          if (meatState === "held") {
            this.meatAvailable = false;
            this.cooking = false;
            this.cookedMeat = false;

            this.meat.setVisible(false);
            this.meatLabel.setVisible(false);

            this.clearCookedMeatObject();

            if (state.meat.userId === user.id) {
              this.heldItem =
                state.meat.itemType === "cooked-meat"
                  ? "cooked-meat"
                  : "meat";
            } else if (this.heldItem) {
              this.heldItem = null;
              this.destroyHeldMeat();
            }
          }

          // -----------------------------
          // COOKING
          // -----------------------------

          if (meatState === "cooking") {
            this.meatAvailable = false;
            this.cooking = true;
            this.cookedMeat = false;

            this.meat.setVisible(false);
            this.meatLabel.setVisible(false);

            this.clearCookedMeatObject();

            this.setGrillText("Cooking...");
          }

          // -----------------------------
          // COOKED
          // -----------------------------

          if (meatState === "cooked") {
            this.meatAvailable = false;
            this.cooking = false;
            this.cookedMeat = true;
            this.cookingPlayerId = null;

            this.meat.setVisible(false);
            this.meatLabel.setVisible(false);

            this.showCookedMeat();

            this.setGrillText("Cooked meat");
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
        // MEAT PICKED
        // =================================

        socket.on("meat-picked", ({ userId }) => {
          console.log("Meat picked by:", userId);

          this.meatAvailable = false;
          this.meat.setVisible(false);
          this.meatLabel.setVisible(false);

          if (userId === user.id) {
            this.heldItem = "meat";
          }
        });

        // =================================
        // MEAT DROPPED
        // =================================

        socket.on("meat-dropped", ({ userId, x, y, itemType }) => {
          console.log("Meat dropped:", itemType, x, y);

          // Only the player who dropped it loses the item
          if (!userId || userId === user.id) {
            this.heldItem = null;
            this.destroyHeldMeat();
          }

          // -------- RAW MEAT DROPPED --------

          if (itemType === "raw-meat") {
            this.meatAvailable = true;
            this.cooking = false;
            this.cookedMeat = false;

            this.meat.setPosition(x, y);
            this.meat.setFillStyle(0xc0392b);
            this.meat.setVisible(true);
            this.meatLabel.setVisible(true);

            this.clearCookedMeatObject();

            this.setGrillText("");

            return;
          }

          // -------- COOKED MEAT DROPPED --------

          if (itemType === "cooked-meat") {
            this.meatAvailable = false;
            this.cooking = false;
            this.cookedMeat = true;

            this.meat.setVisible(false);
            this.meatLabel.setVisible(false);

            this.clearCookedMeatObject();

            this.cookedMeatObject = this.createCookedMeat(x, y);

            this.setGrillText("");

            return;
          }
        });

        // =================================
        // COOKING STARTED
        // =================================

        socket.on("cooking-started", ({ userId, duration }) => {
          this.startCookingVisual(userId, duration);

          if (userId === user.id) {
            this.heldItem = null;
            this.destroyHeldMeat();
          }
        });

        // =================================
        // COOKING FINISHED
        // =================================

        socket.on("cooking-finished", ({ userId }) => {
          console.log("Cooking finished:", userId);

          this.finishCookingVisual(userId);
        });

        // =================================
        // COOKED MEAT PICKED
        // =================================

        socket.on("cooked-meat-picked", ({ userId }) => {
          console.log("Cooked meat picked by:", userId);

          this.cookedMeat = false;
          this.cooking = false;

          this.clearCookedMeatObject();

          this.setGrillText("");

          if (userId === user.id) {
            this.heldItem = "cooked-meat";
          }
        });
      }

      // =====================================
      // HELPERS
      // =====================================

      makeLabel(x, y, text) {
        return this.add
          .text(x, y, text, {
            fontFamily: FONT,
            fontSize: "15px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "#12302e",
            padding: { x: 10, y: 4 },
            resolution: TEXT_RES,
          })
          .setOrigin(0.5)
          .setDepth(2);
      }

      setGrillText(text) {
        this.grillLabel.setText(text);
        this.grillLabel.setVisible(Boolean(text));
      }

      createCookedMeat(x, y) {
        return this.add
          .circle(x, y, 15, 0x8b4513)
          .setStrokeStyle(3, 0x4e2a0b)
          .setDepth(3);
      }

      clearCookedMeatObject() {
        if (this.cookedMeatObject) {
          this.cookedMeatObject.destroy();
          this.cookedMeatObject = null;
        }
      }

      destroyHeldMeat() {
        if (this.heldMeat) {
          this.heldMeat.destroy();
          this.heldMeat = null;
        }
      }

      // =====================================
      // HINT BUBBLE
      // entries: [{ key: "E", label: "Pick up meat" }]
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
      // SHOW COOKED MEAT (on the grill)
      // =====================================

      showCookedMeat() {
        if (this.cookedMeatObject) {
          return;
        }

        this.cookedMeatObject = this.createCookedMeat(this.grill.x, this.grill.y);
      }

      hideMeat() {
        this.meatAvailable = false;
        this.meat.setVisible(false);
        this.meatLabel.setVisible(false);
      }

      // =====================================
      // COOKING VISUALS
      // =====================================

      startCookingVisual(userId, duration) {
        this.cooking = true;
        this.cookedMeat = false;
        this.cookingPlayerId = userId;

        this.hideMeat();

        this.clearCookedMeatObject();

        let remaining = Math.ceil(duration / 1000);

        this.setGrillText(`Cooking: ${remaining}s`);

        if (this.localCookingTimer) {
          this.localCookingTimer.remove();
        }

        this.localCookingTimer = this.time.addEvent({
          delay: 1000,
          repeat: remaining - 1,
          callback: () => {
            remaining--;

            if (remaining > 0) {
              this.setGrillText(`Cooking: ${remaining}s`);
            }
          },
        });
      }

      finishCookingVisual(userId) {
        this.cooking = false;
        this.cookedMeat = true;
        this.cookingPlayerId = null;

        if (this.localCookingTimer) {
          this.localCookingTimer.remove();
          this.localCookingTimer = null;
        }

        this.setGrillText("Cooked meat");

        this.showCookedMeat();
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

      pickMeat() {
        if (!this.meatAvailable) {
          return;
        }

        if (this.heldItem) {
          return;
        }

        socket.emit("pick-meat", {
          roomCode,
          userId: user.id,
        });
      }

      dropItem() {
        if (!this.heldItem) {
          return;
        }

        socket.emit("drop-meat", {
          roomCode,
          userId: user.id,
          x: this.player.x,
          y: this.player.y,
        });
      }

      startCooking() {
        if (this.heldItem !== "meat") {
          return;
        }

        socket.emit("start-cooking", {
          roomCode,
          userId: user.id,
        });
      }

      pickCookedMeat() {
        if (!this.cookedMeat) {
          return;
        }

        if (this.heldItem) {
          return;
        }

        socket.emit("pick-cooked-meat", {
          roomCode,
          userId: user.id,
        });
      }

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

        this.playerLabel.x = this.player.x;
        this.playerLabel.y = this.player.y - 34;

        this.playerShadow.x = this.player.x;
        this.playerShadow.y = this.player.y + 24;

        this.sendPosition();

        // =================================
        // INTERACTION
        // =================================

        let hint = null;

        if (this.heldItem) {
          // Q = drop
          if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
            this.dropItem();
          }

          if (this.heldItem === "meat") {
            const distanceToGrill = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              this.grill.x,
              this.grill.y,
            );

            if (distanceToGrill < 90) {
              hint = [
                { key: "E", label: "Grill meat" },
                { key: "Q", label: "Drop" },
              ];

              if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
                this.startCooking();
              }
            } else {
              hint = [{ key: "Q", label: "Drop meat" }];
            }
          } else if (this.heldItem === "cooked-meat") {
            hint = [{ key: "Q", label: "Drop cooked meat" }];
          }

          // Held item follows the player
          const heldColor = this.heldItem === "meat" ? 0xc0392b : 0x8b4513;

          if (!this.heldMeat) {
            this.heldMeat = this.add
              .circle(this.player.x, this.player.y - 25, 10, heldColor)
              .setStrokeStyle(2, 0x3b1a0a)
              .setDepth(6);
          }

          this.heldMeat.setFillStyle(heldColor);
          this.heldMeat.x = this.player.x;
          this.heldMeat.y = this.player.y - 25;
        } else if (this.cooking) {
          hint = null;
        } else if (this.cookedMeat) {
          let cookedX = this.grill.x;
          let cookedY = this.grill.y;

          if (this.cookedMeatObject) {
            cookedX = this.cookedMeatObject.x;
            cookedY = this.cookedMeatObject.y;
          }

          const distanceToCookedMeat = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            cookedX,
            cookedY,
          );

          if (distanceToCookedMeat < 70) {
            hint = [{ key: "E", label: "Pick up cooked meat" }];

            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
              this.pickCookedMeat();
            }
          }
        } else if (this.meatAvailable) {
          const distanceToMeat = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            this.meat.x,
            this.meat.y,
          );

          if (distanceToMeat < 70) {
            hint = [{ key: "E", label: "Pick up meat" }];

            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
              this.pickMeat();
            }
          }
        }

        // =================================
        // HINT BUBBLE POSITION
        // =================================

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
      socket.off("player-position");
      socket.off("player-joined");
      socket.off("meat-picked");
      socket.off("meat-dropped");
      socket.off("cooking-started");
      socket.off("cooking-finished");
      socket.off("cooked-meat-picked");

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
  // GAME
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
