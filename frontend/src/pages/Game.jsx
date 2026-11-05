import { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";

import { getMatch, getRecipes } from "../services/api";
import { createKitchenScene } from "../game/KitchenScene";
import { loadControlMode, saveControlMode } from "../game/gameControls";
import { socket } from "../services/socket";

import FullscreenButton from "./Fullscreenhint";

import "./Game.css";

import {
  useEscapeLockInFullscreen,
  toggleFullscreen,
  useIsFullscreen,
} from "../useFullscreenHotkey";

// Chế độ chơi:
//   "single"      : 1 người, offline
//   "coop-local"  : 2 người chung máy, offline
//   "coop-online" : qua server (mặc định, route /game/:roomCode)
const MODE_TITLES = {
  single: "Single player",
  "coop-local": "Local co-op",
  "coop-online": "Online co-op",
};

const CONTROL_NOTES = {
  single:
    "Move: W A S D or arrow keys · Interact: E · Drop: Q · Zoom: Z or mouse wheel · Menu: Esc · Fullscreen: F",
  "coop-local":
    "Player 1 (blue): W A S D · E interact · Q drop.   Player 2 (orange): arrow keys · Enter interact · Shift drop.   Menu: Esc · Fullscreen: F",
  "coop-online":
    "Move: W A S D · Interact: E · Drop: Q · Zoom: Z or mouse wheel · Menu: Esc · Fullscreen: F",
};

function Game({ mode = "coop-online" }) {
  const { roomCode } = useParams();
  const offline = mode !== "coop-online";

  const navigate = useNavigate();

  const gameRef = useRef(null);

  // Chỉ khóa ESC trong trang game; nhớ gọi trước mọi return sớm
  useEscapeLockInFullscreen();
  const isFs = useIsFullscreen();

  const [user, setUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);

  // ----- Menu -----
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState("main"); // "main" | "settings"
  const [controlMode, setControlMode] = useState(loadControlMode);

  // Scene đọc trạng thái menu qua ref (không bị kẹt giá trị cũ)
  const menuOpenRef = useRef(false);
  const modeRef = useRef(controlMode);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    modeRef.current = controlMode;
  }, [controlMode]);

  const ui = useMemo(
    () => ({
      getMode: () => modeRef.current,
      isMenuOpen: () => menuOpenRef.current,
      toggleMenu: () => {
        setMenuView("main");
        setMenuOpen((open) => !open);
      },
    }),
    [],
  );

  const closeMenu = () => setMenuOpen(false);

  const changeMode = (mode) => {
    setControlMode(mode);
    saveControlMode(mode);
  };

  // =====================================
  // LOAD GAME DATA
  // =====================================

  useEffect(() => {
    let mounted = true;

    const loadGame = async () => {
      // Single / Co-op cùng máy: chạy hoàn toàn offline, không cần đăng nhập
      if (offline) {
        setUser({ id: "local" });
        setMatch({ offline: true });
        setLoading(false);
        return;
      }

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

        if (!mounted) return;

        setUser(user);
        setMatch(matchResult.data);
        setRecipes(recipeData);
        setLoading(false);
      } catch (error) {
        console.error("Game loading error:", error);

        if (mounted) setLoading(false);
      }
    };

    loadGame();

    return () => {
      mounted = false;
    };
  }, [navigate, roomCode, offline]);

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
      mapId: "farm",
      mode,
      ui,
    });

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

    const onResize = () => {
      if (!game) return;

      const size = getSize();

      game.scale.setZoom(1 / size.dpr);
      game.scale.resize(size.w, size.h);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);

      // Online: gỡ listener + ngắt socket. Offline: scene tự dừng LocalTransport.
      if (!offline) {
        [
          "game-state",
          "item-created",
          "item-picked",
          "item-dropped",
          "plate-created",
          "plate-picked",
          "plate-dropped",
          "station-updated",
          "player-position",
          "player-joined",
          "player-left",
          "orders-updated",
          "orders-list",
          "item-removed",
          "order-completed",
          "interaction-error",
          "disconnect",
        ].forEach((ev) => socket.off(ev));
      }

      document
        .querySelectorAll("[data-orders-panel]")
        .forEach((n) => n.remove());

      if (!offline) socket.disconnect();

      if (game) game.destroy(true);
    };
  }, [loading, user, match, roomCode, ui, mode, offline]);

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
      <div ref={gameRef} className="phaser-container" />

      {/* Nút menu */}
      <button
        type="button"
        className="gm-menu-btn gm-glass"
        aria-label="Menu"
        onClick={(e) => {
          e.currentTarget.blur(); // tránh phím Enter (người chơi 2) bấm lại nút này
          ui.toggleMenu();
        }}
      >
        ☰
      </button>

      {/* Menu / Settings */}
      {menuOpen && (
        <div
          className="gm-overlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) closeMenu();
          }}
        >
          <div className="gm-panel gm-glass">
            {menuView === "main" ? (
              <>
                <div className="gm-title">Menu</div>
                <div className="gm-note">{MODE_TITLES[mode]}</div>

                <button className="gm-btn" onClick={closeMenu}>
                  Resume
                </button>

                <button
                  className="gm-btn"
                  onClick={() => setMenuView("settings")}
                >
                  Settings
                </button>

                <button className="gm-btn" onClick={toggleFullscreen}>
                  {isFs ? "Exit fullscreen" : "Fullscreen"}
                </button>

                <button
                  className="gm-btn gm-danger"
                  onClick={() => navigate("/play")}
                >
                  {offline ? "Quit game" : "Leave room"}
                </button>
              </>
            ) : (
              <>
                <div className="gm-title">Settings</div>
                <div className="gm-label">Controls</div>

                {/* Co-op cùng máy chỉ dùng bàn phím */}
                {mode !== "coop-local" && (
                  <div className="gm-seg">
                    {[
                      ["keyboard", "Keyboard"],
                      ["joystick", "Joystick"],
                    ].map(([value, text]) => (
                      <button
                        key={value}
                        className={`gm-seg-btn${controlMode === value ? " gm-on" : ""}`}
                        onClick={() => changeMode(value)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}

                <div className="gm-note">
                  {mode === "coop-local" || controlMode === "keyboard"
                    ? CONTROL_NOTES[mode]
                    : "Drag the joystick to move. Use the E and Q buttons on the right, and 🔍 to zoom."}
                </div>

                <button className="gm-btn" onClick={() => setMenuView("main")}>
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <FullscreenButton />
    </div>
  );
}

export default Game;
