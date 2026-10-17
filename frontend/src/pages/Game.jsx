import { useEffect, useRef, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";

import { getMatch, getRecipes } from "../services/api";
import { createKitchenScene, WORLD_H, WORLD_W } from "./KitchenScene";
import { socket } from "../services/socket";

import "./Game.css";

// =====================================

// WORLD

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

    const KitchenScene = createKitchenScene({ user, roomCode });

    // Phóng nguyên số lần (1x, 2x, 3x...) để mọi pixel to bằng nhau và nét.
    const zoom = Math.max(
      1,
      Math.floor(
        Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H),
      ),
    );

    const config = {
      type: Phaser.AUTO,

      width: WORLD_W,

      height: WORLD_H,

      parent: gameRef.current,

      backgroundColor: "#12302e",

      // Pixel art: tắt làm mịn ảnh, làm tròn vị trí vẽ
      pixelArt: true,

      roundPixels: true,

      antialias: false,

      scale: {
        mode: Phaser.Scale.NONE,

        zoom,

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
