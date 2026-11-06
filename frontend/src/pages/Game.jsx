import { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";
import Phaser from "phaser";

import { supabase } from "../lib/supabase";

import { quitRound } from "../services/storyApi";
import { getMatch, getRecipes } from "../services/api";
import { createKitchenScene } from "../game/KitchenScene";
import { loadControlMode, saveControlMode } from "../game/gameControls";
import { socket } from "../services/socket";


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



function Game({ mode = "coop-online" }) {
  const { roomCode, mapId: routeMapId } = useParams();
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
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  // ----- Menu -----
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState("main"); // "main" | "settings" | "tutorial"
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

  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const returnToSelection = () => navigate(offline ? `/world/${mode}` :
    match?.game_mode === "STORY" ? `/world-online/${roomCode}` : `/lobby/${roomCode}`);
  const handleQuit = async () => {
    if (quitting) return;
    setQuitting(true);
    setQuitError("");
    try {
      if (!offline) await quitRound(roomCode);
      returnToSelection();
    } catch (e) {
      setQuitError(e.message);
      setQuitting(false);
    }
  };

  useEffect(() => {
    if (offline || !match) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const { data } = await getMatch(roomCode);
        if (active && (data.status === "WAITING" || data.round_status === "IDLE")) {
          navigate(data.status !== "WAITING" && data.game_mode === "STORY" ? `/world-online/${roomCode}` : `/lobby/${roomCode}`, { replace: true });
        }
      } catch { /* Retry on next refresh. */ }
    }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [offline, match, roomCode, navigate]);

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
      mapId: offline ? routeMapId : match.current_map || "bistro",
      durationMs: offline ? (routeMapId === "farm" ? 180000 : 180000) : null,
      onRoundFinished: setResult,
      onClockSync: setClock,
      mode,
      ui,
    });

    const getSize = () => {
      const dpr = window.devicePixelRatio || 1;

      const bounds = gameRef.current.getBoundingClientRect();
      return {
        dpr,
        w: Math.max(1, Math.round(bounds.width * dpr)),
        h: Math.max(1, Math.round(bounds.height * dpr)),
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

    const resizeGame = () => {
      if (!game) return;

      const size = getSize();

      game.scale.setZoom(1 / size.dpr);
      game.scale.resize(size.w, size.h);
    };

    // Fullscreen can finish layout after its event; measure on the next frame.
    let resizeFrame;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resizeGame);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(gameRef.current);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    document.addEventListener("webkitfullscreenchange", onResize);

    return () => {
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
      document.removeEventListener("webkitfullscreenchange", onResize);

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
          "order-expired",
          "map-finished",
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
      {Number.isFinite(clock) && !result && (
        <div
          className={`gm-round-clock${clock - now <= 30000 ? " gm-round-clock-urgent" : ""}`}
          role="timer"
          aria-label="Map time remaining"
        >
          <span className="gm-round-clock-label">Time left</span>
          <span>
            {String(
              Math.floor(Math.max(0, Math.ceil((clock - now) / 1000)) / 60),
            ).padStart(2, "0")}
            :
            {String(Math.max(0, Math.ceil((clock - now) / 1000)) % 60).padStart(
              2,
              "0",
            )}
          </span>
        </div>
      )}

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

                <button className="gm-btn" onClick={() => setMenuView("tutorial")}>
                  Tutorial
                </button>

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
                  onClick={handleQuit}
                  disabled={quitting}
                >
                  {quitting ? "Leaving..." : "Quit game"}
                </button>
                {quitError && <p role="alert" className="gm-note">{quitError}</p>}
              </>
            ) : menuView === "tutorial" ? (
              <>
                <div className="gm-title">Tutorial</div>
                <div className="gm-controls" aria-label="Controls">
                  <div><kbd>W A S D</kbd><span>Move up / left / down / right</span></div>
                  <div><kbd>E</kbd><span>Interact / pick up</span></div>
                  <div><kbd>Q</kbd><span>Drop item</span></div>
                  {mode === "coop-local" ? (
                    <div><kbd>↑ ← ↓ →</kbd><span>Player 2 · Enter: interact · Shift: drop</span></div>
                  ) : (
                    <div><kbd>Z</kbd><span>Near / Far zoom · or mouse wheel</span></div>
                  )}
                  <div><kbd>F</kbd><span>Toggle fullscreen</span></div>
                  <div><kbd>Esc</kbd><span>Open / close menu</span></div>
                </div>
                {controlMode === "joystick" && mode !== "coop-local" && (
                  <p className="gm-note">Drag the joystick to move. Use the E and Q buttons to interact and drop items.</p>
                )}
                <button className="gm-btn" onClick={() => setMenuView("main")}>
                  Back
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



                <button className="gm-btn" onClick={() => setMenuView("main")}>
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="gm-overlay" style={{ zIndex: 9999 }}>
          <div className="gm-panel gm-glass">
            <h2>Map Finished</h2>
            <p>Map: {result.mapId}</p>
            <h1>Score: {result.score}</h1>
            <p>Expired penalties: {result.expiredPenalties}</p>
            <button
              className="gm-btn"
              onClick={() => {
                if (offline) {
                  const key = `kitchen-story:${mode}`;
                  const progress = JSON.parse(
                    sessionStorage.getItem(key) || '{"total":0,"completed":[]}',
                  );
                  const id = result.roundId;
                  if (!progress.completed.includes(id)) {
                    progress.completed.push(id);
                    progress.total += Math.max(0, Math.floor(result.score));
                    sessionStorage.setItem(key, JSON.stringify(progress));
                  }
                  navigate(`/world/${mode}`);
                } else {
                  navigate(
                    match.game_mode === "STORY"
                      ? `/world-online/${roomCode}`
                      : `/lobby/${roomCode}`,
                  );
                }
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;
