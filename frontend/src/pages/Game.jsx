import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";
import { getMatch, getRecipes } from "../services/api";
import { socket } from "../services/socket";

import "./Game.css";

function Game() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const gameRef = useRef(null);

  const [user, setUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);

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

        // =================================
        // OTHER PLAYERS
        // =================================

        this.otherPlayers = {};

        // =================================
        // POSITION SYNC
        // =================================

        this.lastSentX = null;
        this.lastSentY = null;

        // =================================
        // GAME STATE
        // =================================

        this.meatAvailable = true;
        this.cooking = false;
        this.cookedMeat = false;
        this.cookingPlayerId = null;

        // =================================
        // PLAYER ITEM
        // =================================

        this.heldItem = null;
        this.heldMeat = null;

        // =================================
        // COOKING TIMER
        // =================================

        this.localCookingTimer = null;
      }

      // =====================================
      // PRELOAD
      // =====================================

      preload() {}

      // =====================================
      // CREATE
      // =====================================

      create() {
        const { width, height } = this.scale;

        // =================================
        // BACKGROUND
        // =================================

        this.add.rectangle(width / 2, height / 2, width, height, 0xe8e8e8);

        this.add.rectangle(
          width / 2,
          height / 2,
          width - 40,
          height - 40,
          0xffffff,
        );

        // =================================
        // WALL
        // =================================

        this.add.rectangle(width / 2, 30, width - 40, 40, 0x555555);

        // =================================
        // MEAT STATION
        // =================================

        this.add.rectangle(160, 150, 180, 80, 0x8b5a2b);

        this.meat = this.add.circle(160, 150, 20, 0xc0392b);

        this.meatLabel = this.add
          .text(160, 185, "Meat", {
            fontSize: "16px",
            color: "#000000",
          })
          .setOrigin(0.5);

        // =================================
        // GRILL
        // =================================

        this.grill = this.add.rectangle(width / 2, 150, 120, 80, 0x333333);

        this.add
          .text(width / 2, 150, "GRILL", {
            fontSize: "20px",
            color: "#ffffff",
          })
          .setOrigin(0.5);

        this.grillLabel = this.add
          .text(width / 2, 205, "", {
            fontSize: "16px",
            color: "#000000",
            backgroundColor: "#ffffff",
            padding: {
              x: 6,
              y: 4,
            },
          })
          .setOrigin(0.5);

        // =================================
        // TOMATO
        // =================================

        this.tomato = this.add.circle(width - 160, 150, 20, 0xe74c3c);

        this.add
          .text(width - 160, 185, "Tomato", {
            fontSize: "16px",
            color: "#000000",
          })
          .setOrigin(0.5);

        // =================================
        // CURRENT PLAYER
        // =================================

        this.player = this.add.rectangle(
          width / 2,
          height / 2,
          40,
          40,
          0x3498db,
        );

        this.playerLabel = this.add
          .text(width / 2, height / 2 - 35, "YOU", {
            fontSize: "14px",
            color: "#000000",
            fontStyle: "bold",
          })
          .setOrigin(0.5);

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
        // INTERACTION TEXT
        // =================================

        this.interactText = this.add.text(20, height - 40, "", {
          fontSize: "18px",
          color: "#000000",
          backgroundColor: "#ffffff",
          padding: {
            x: 8,
            y: 5,
          },
        });

        // =================================
        // SOCKET CONNECT
        // =================================

        if (!socket.connected) {
          socket.connect();
        }

        // =================================
        // JOIN ROOM
        // =================================

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
            this.grillLabel.setText("");

            if (this.cookedMeatObject) {
              this.cookedMeatObject.destroy();
              this.cookedMeatObject = null;
            }

            if (state.meat.itemType === "cooked-meat") {
              // Thịt chín đang nằm dưới đất
              this.meatAvailable = false;
              this.cookedMeat = true;

              this.meat.setVisible(false);
              this.meatLabel.setVisible(false);

              this.cookedMeatObject = this.add.circle(
                state.meat.x,
                state.meat.y,
                15,
                0x8b4513,
              );
            } else {
              // Thịt sống
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

            if (this.cookedMeatObject) {
              this.cookedMeatObject.destroy();
              this.cookedMeatObject = null;
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

            if (this.cookedMeatObject) {
              this.cookedMeatObject.destroy();
              this.cookedMeatObject = null;
            }

            this.grillLabel.setText("Cooking...");
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

            this.grillLabel.setText("Cooked Meat");
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

        socket.on("meat-dropped", ({ x, y, itemType }) => {
          console.log("Meat dropped:", itemType, x, y);

          // Clear held item
          this.heldItem = null;

          if (this.heldMeat) {
            this.heldMeat.destroy();
            this.heldMeat = null;
          }

          // =================================
          // RAW MEAT DROPPED
          // =================================

          if (itemType === "raw-meat") {
            this.meatAvailable = true;
            this.cooking = false;
            this.cookedMeat = false;

            this.meat.setPosition(x, y);

            this.meat.setFillStyle(0xc0392b);

            this.meat.setVisible(true);
            this.meatLabel.setVisible(true);

            if (this.cookedMeatObject) {
              this.cookedMeatObject.destroy();
              this.cookedMeatObject = null;
            }

            this.grillLabel.setText("");

            return;
          }

          // =================================
          // COOKED MEAT DROPPED
          // =================================

          if (itemType === "cooked-meat") {
            this.meatAvailable = false;
            this.cooking = false;
            this.cookedMeat = true;

            // Hide raw meat object
            this.meat.setVisible(false);
            this.meatLabel.setVisible(false);

            // Remove old cooked meat object
            if (this.cookedMeatObject) {
              this.cookedMeatObject.destroy();
              this.cookedMeatObject = null;
            }

            // Create cooked meat at drop position
            this.cookedMeatObject = this.add.circle(x, y, 15, 0x8b4513);

            this.grillLabel.setText("");

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

            if (this.heldMeat) {
              this.heldMeat.destroy();
              this.heldMeat = null;
            }
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

          if (this.cookedMeatObject) {
            this.cookedMeatObject.destroy();

            this.cookedMeatObject = null;
          }

          this.grillLabel.setText("");

          if (userId === user.id) {
            this.heldItem = "cooked-meat";

            this.interactText.setText("Holding Cooked Meat");
          }
        });
      }

      // =====================================
      // HIDE MEAT
      // =====================================

      hideMeat() {
        this.meatAvailable = false;

        this.meat.setVisible(false);

        this.meatLabel.setVisible(false);
      }

      // =====================================
      // SHOW COOKED MEAT
      // =====================================

      showCookedMeat() {
        if (this.cookedMeatObject) {
          return;
        }

        this.cookedMeatObject = this.add.circle(
          this.grill.x,
          this.grill.y,
          15,
          0x8b4513,
        );
      }

      // =====================================
      // START COOKING VISUAL
      // =====================================

      startCookingVisual(userId, duration) {
        this.cooking = true;
        this.cookedMeat = false;
        this.cookingPlayerId = userId;

        this.hideMeat();

        if (this.cookedMeatObject) {
          this.cookedMeatObject.destroy();

          this.cookedMeatObject = null;
        }

        let remaining = Math.ceil(duration / 1000);

        this.grillLabel.setText(`Cooking: ${remaining}s`);

        if (this.localCookingTimer) {
          this.localCookingTimer.remove();
        }

        this.localCookingTimer = this.time.addEvent({
          delay: 1000,

          repeat: remaining - 1,

          callback: () => {
            remaining--;

            if (remaining > 0) {
              this.grillLabel.setText(`Cooking: ${remaining}s`);
            }
          },
        });
      }

      // =====================================
      // FINISH COOKING VISUAL
      // =====================================

      finishCookingVisual(userId) {
        this.cooking = false;
        this.cookedMeat = true;
        this.cookingPlayerId = null;

        if (this.localCookingTimer) {
          this.localCookingTimer.remove();

          this.localCookingTimer = null;
        }

        this.grillLabel.setText("Cooked Meat");

        this.interactText.setText("Cooked Meat is ready");

        this.showCookedMeat();
      }

      // =====================================
      // UPDATE OTHER PLAYER
      // =====================================

      updateOtherPlayer(userId, x, y) {
        if (!this.otherPlayers[userId]) {
          const player = this.add.rectangle(x, y, 40, 40, 0xe67e22);

          const label = this.add
            .text(x, y - 35, "PLAYER", {
              fontSize: "14px",
              color: "#000000",
              fontStyle: "bold",
            })
            .setOrigin(0.5);

          this.otherPlayers[userId] = {
            player,
            label,
          };
        }

        const other = this.otherPlayers[userId];

        other.player.x = x;
        other.player.y = y;

        other.label.x = x;
        other.label.y = y - 35;
      }

      // =====================================
      // PICK RAW MEAT
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

      // =====================================
      // DROP ITEM
      // =====================================

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

      // =====================================
      // START COOKING
      // =====================================

      startCooking() {
        if (this.heldItem !== "meat") {
          return;
        }

        socket.emit("start-cooking", {
          roomCode,
          userId: user.id,
        });
      }

      // =====================================
      // PICK COOKED MEAT
      // =====================================

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

      // =====================================
      // SEND POSITION
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

        // =================================
        // BOUNDARY
        // =================================

        this.player.x = Phaser.Math.Clamp(
          this.player.x,
          60,
          this.scale.width - 60,
        );

        this.player.y = Phaser.Math.Clamp(
          this.player.y,
          80,
          this.scale.height - 60,
        );

        // =================================
        // PLAYER LABEL
        // =================================

        this.playerLabel.x = this.player.x;
        this.playerLabel.y = this.player.y - 35;

        // =================================
        // SEND POSITION
        // =================================

        this.sendPosition();

        // =================================
        // HELD ITEM
        // =================================

        if (this.heldItem) {
          // =================================
          // Q = DROP
          // =================================

          if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
            this.dropItem();

            return;
          }

          // -----------------------------
          // RAW MEAT
          // -----------------------------

          if (this.heldItem === "meat") {
            const distanceToGrill = Phaser.Math.Distance.Between(
              this.player.x,
              this.player.y,
              this.grill.x,
              this.grill.y,
            );

            if (distanceToGrill < 90) {
              this.interactText.setText("E: Grill Meat | Q: Drop");

              if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
                this.startCooking();
              }
            } else {
              this.interactText.setText("Q: Drop Meat");
            }

            // Show held raw meat
            if (!this.heldMeat) {
              this.heldMeat = this.add.circle(
                this.player.x,
                this.player.y - 25,
                10,
                0xc0392b,
              );
            }

            this.heldMeat.x = this.player.x;

            this.heldMeat.y = this.player.y - 25;

            return;
          }

          // -----------------------------
          // COOKED MEAT
          // -----------------------------

          if (this.heldItem === "cooked-meat") {
            this.interactText.setText("Q: Drop Cooked Meat");

            // Show held cooked meat
            if (!this.heldMeat) {
              this.heldMeat = this.add.circle(
                this.player.x,
                this.player.y - 25,
                10,
                0x8b4513,
              );
            }

            this.heldMeat.x = this.player.x;

            this.heldMeat.y = this.player.y - 25;

            return;
          }
        }

        // =================================
        // COOKING STATUS
        // =================================

        if (this.cooking) {
          this.interactText.setText("Meat is cooking...");

          return;
        }

        // =================================
        // PICK COOKED MEAT
        // =================================

        if (!this.heldItem && this.cookedMeat) {
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
            this.interactText.setText("E: Pick Cooked Meat");

            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
              this.pickCookedMeat();
            }

            return;
          }
        }

        // =================================
        // PICK RAW MEAT
        // =================================

        if (!this.heldItem && this.meatAvailable && !this.cookedMeat) {
          const distanceToMeat = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            this.meat.x,
            this.meat.y,
          );

          if (distanceToMeat < 70) {
            this.interactText.setText("E: Pick up Meat");

            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
              this.pickMeat();
            }
          } else {
            this.interactText.setText("");
          }
        }
      }
    }

    // =====================================
    // PHASER CONFIG
    // =====================================

    const config = {
      type: Phaser.AUTO,

      width: 900,

      height: 600,

      parent: gameRef.current,

      backgroundColor: "#ffffff",

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
      {/* =================================
          HEADER
      ================================= */}

      <div className="game-header">
        <div>
          <h1>Kitchen Panic</h1>

          <p>Room: {roomCode}</p>

          <p>
            Players: {match?.players?.length || 0}/{match?.max_players || 0}
          </p>
        </div>

        <div>
          <strong>Score: 0</strong>
        </div>
      </div>

      {/* =================================
          GAME CONTAINER
      ================================= */}

      <div className="game-container">
        {/* =================================
            PHASER BOARD
        ================================= */}

        <div className="game-board">
          <div ref={gameRef} className="phaser-container" />
        </div>

        {/* =================================
            SIDEBAR
        ================================= */}

        <div className="game-sidebar">
          {/* =================================
              ORDERS
          ================================= */}

          <div className="order-panel">
            <h2>Orders</h2>

            {recipes.map((recipe) => (
              <div className="recipe-card" key={recipe.id}>
                <h3>{recipe.name}</h3>

                <p>Score: {recipe.base_score}</p>

                <p>Time: {recipe.time_limit}s</p>
              </div>
            ))}
          </div>

          {/* =================================
              PLAYER
          ================================= */}

          <div className="player-panel">
            <h2>Player</h2>

            <p>You: {user?.email}</p>

            <p>Score: 0</p>

            <p>Coins: 0</p>
          </div>
        </div>
      </div>

      {/* =================================
          CONTROLS
      ================================= */}

      <div
        style={{
          marginTop: "10px",
          textAlign: "center",
        }}
      >
        <p>
          <strong>W A S D</strong> Move
          {" | "}
          <strong>E</strong> Pick / Grill
          {" | "}
          <strong>Q</strong> Drop
        </p>
      </div>

      {/* =================================
          LEAVE
      ================================= */}

      <button className="leave-button" onClick={() => navigate("/")}>
        Leave Game
      </button>
    </div>
  );
}

export default Game;
