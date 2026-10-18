import { useEffect, useRef, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";

import { getMatch, getRecipes } from "../services/api";
import { createKitchenScene } from "../game/KitchenScene";
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

    const KitchenScene = createKitchenScene({
      user,
      roomCode,
      mapId: "bistro",
    });

    // Canvas có kích thước đúng bằng số PIXEL VẬT LÝ của cửa sổ
    // (CSS px x devicePixelRatio), rồi thu lại bằng zoom = 1 / dpr.
    // => 1 pixel canvas = 1 pixel màn hình thật, trình duyệt không phải
    //    kéo giãn nên không bị mờ, kể cả khi Windows đặt tỉ lệ 125% / 150%.
    // Việc phóng to pixel-art do camera trong KitchenScene lo (zoom số nguyên).
    const getSize = () => {
      const dpr = window.devicePixelRatio || 1;

      return {
        dpr,
        w: Math.max(1, Math.floor(window.innerWidth * dpr)),
        h: Math.max(1, Math.floor(window.innerHeight * dpr)),
      };
    };

    const { dpr, w, h } = getSize();

    const config = {
      type: Phaser.AUTO,

      parent: gameRef.current,

      backgroundColor: "#12302e",

      // Pixel art: tắt làm mịn ảnh, làm tròn vị trí vẽ
      pixelArt: true,

      roundPixels: true,

      antialias: false,

      scale: {
        mode: Phaser.Scale.NONE,

        width: w,

        height: h,

        zoom: 1 / dpr,
      },

      scene: KitchenScene,
    };

    game = new Phaser.Game(config);
    window.__game = game;
    // Đổi kích thước cửa sổ / F11 / Ctrl +- → canvas cập nhật theo
    const onResize = () => {
      if (!game) return;

      const size = getSize();

      game.scale.setZoom(1 / size.dpr);

      game.scale.resize(size.w, size.h);
    };

    window.addEventListener("resize", onResize);

    // =====================================

    // CLEANUP

    // =====================================

    return () => {
      window.removeEventListener("resize", onResize);

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
