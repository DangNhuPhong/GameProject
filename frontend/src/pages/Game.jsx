import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";
import { getRecipes } from "../services/api";

import "./Game.css";

function Game() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const gameRef = useRef(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGame = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        // Load recipes only once
        const data = await getRecipes();
        setRecipes(data);

        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };

    loadGame();
  }, [navigate]);

  useEffect(() => {
    if (loading) return;
    if (!gameRef.current) return;

    class KitchenScene extends Phaser.Scene {
      constructor() {
        super("KitchenScene");
      }

      preload() {}

      create() {
        const { width, height } = this.scale;

        // =========================
        // BACKGROUND
        // =========================

        this.add.rectangle(width / 2, height / 2, width, height, 0xe8e8e8);

        // Floor
        this.add.rectangle(
          width / 2,
          height / 2,
          width - 40,
          height - 40,
          0xffffff,
        );

        // Kitchen wall
        this.add.rectangle(width / 2, 30, width - 40, 40, 0x555555);

        // =========================
        // COUNTERS
        // =========================

        this.add.rectangle(160, 150, 180, 80, 0x8b5a2b);

        this.add.rectangle(width - 160, 150, 180, 80, 0x8b5a2b);

        // =========================
        // GRILL
        // =========================

        this.grill = this.add.rectangle(width / 2, 150, 120, 80, 0x333333);

        this.add
          .text(width / 2, 150, "GRILL", {
            fontSize: "20px",
            color: "#ffffff",
          })
          .setOrigin(0.5);

        // =========================
        // MEAT
        // =========================

        this.meat = this.add.circle(160, 150, 20, 0xc0392b);

        this.meatLabel = this.add
          .text(160, 185, "Meat", {
            fontSize: "16px",
            color: "#000000",
          })
          .setOrigin(0.5);

        // =========================
        // TOMATO
        // =========================

        this.tomato = this.add.circle(width - 160, 150, 20, 0xe74c3c);

        this.add
          .text(width - 160, 185, "Tomato", {
            fontSize: "16px",
            color: "#000000",
          })
          .setOrigin(0.5);

        // =========================
        // PLAYER
        // =========================

        this.player = this.add.rectangle(
          width / 2,
          height / 2,
          40,
          40,
          0x3498db,
        );

        this.playerLabel = this.add
          .text(width / 2, height / 2 - 35, "PLAYER", {
            fontSize: "14px",
            color: "#000000",
          })
          .setOrigin(0.5);

        // =========================
        // PLAYER STATE
        // =========================

        this.heldItem = null;

        // =========================
        // KEYBOARD
        // =========================

        this.keys = this.input.keyboard.addKeys({
          W: Phaser.Input.Keyboard.KeyCodes.W,
          A: Phaser.Input.Keyboard.KeyCodes.A,
          S: Phaser.Input.Keyboard.KeyCodes.S,
          D: Phaser.Input.Keyboard.KeyCodes.D,
        });

        this.interactKey = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.E,
        );

        // =========================
        // INTERACTION TEXT
        // =========================

        this.interactText = this.add.text(20, height - 40, "", {
          fontSize: "18px",
          color: "#000000",
          backgroundColor: "#ffffff",
          padding: {
            x: 8,
            y: 5,
          },
        });
      }

      update() {
        const speed = 4;

        // =========================
        // PLAYER MOVEMENT
        // =========================

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

        // =========================
        // KEEP PLAYER INSIDE MAP
        // =========================

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

        // Player label follows player
        this.playerLabel.x = this.player.x;
        this.playerLabel.y = this.player.y - 35;

        // =========================
        // MEAT INTERACTION
        // =========================

        if (!this.heldItem) {
          const distanceToMeat = Phaser.Math.Distance.Between(
            this.player.x,
            this.player.y,
            this.meat.x,
            this.meat.y,
          );

          if (distanceToMeat < 70) {
            this.interactText.setText("Press E to pick up Meat");

            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
              this.heldItem = "meat";

              this.meat.setVisible(false);
              this.meatLabel.setVisible(false);

              this.interactText.setText("Holding Meat");
            }
          } else {
            this.interactText.setText("");
          }
        }

        // =========================
        // HOLDING MEAT
        // =========================

        if (this.heldItem === "meat") {
          this.interactText.setText("Holding Meat");

          // Create a small meat icon above player
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
        }
      }
    }

    const config = {
      type: Phaser.AUTO,

      width: 900,
      height: 600,

      parent: gameRef.current,

      backgroundColor: "#ffffff",

      scene: KitchenScene,
    };

    const game = new Phaser.Game(config);

    return () => {
      game.destroy(true);
    };
  }, [loading]);

  if (loading) {
    return <div className="game-loading">Loading game...</div>;
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <div>
          <h1>Kitchen Panic</h1>
          <p>Room: {roomCode}</p>
        </div>

        <div>
          <strong>Score: 0</strong>
        </div>
      </div>

      <div className="game-container">
        <div className="game-board">
          <div ref={gameRef} className="phaser-container" />
        </div>

        <div className="game-sidebar">
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

          <div className="player-panel">
            <h2>Player</h2>

            <p>Score: 0</p>
            <p>Coins: 0</p>
          </div>
        </div>
      </div>

      <button className="leave-button" onClick={() => navigate("/")}>
        Leave Game
      </button>
    </div>
  );
}

export default Game;
