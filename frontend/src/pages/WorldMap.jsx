import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { STORY_MAPS, canPlayStoryMap } from "../game/storyConfig";
import { getMatch } from "../services/api";
import { startStoryRound, returnRoomToLobby } from "../services/storyApi";
import worldMapImage from "../assets/world-map-clean.png";
import { socket } from "../services/socket";
import "./WorldMap.css";
import { supabase } from "../lib/supabase";
import CharacterPicker from "../components/CharacterPicker";
import {
  readCharacter,
  readStoryCharacters,
  confirmStoryCharacters,
  getCharacter,
} from "../game/characters";

const REGIONS = [
  {
    id: "farm",
    name: "Farm",
    points:
      "1003,254 1046,233 1110,214 1187,191 1270,174 1359,167 1438,180 1497,209 1556,247 1601,290 1625,331 1625,373 1602,410 1560,444 1511,467 1454,477 1408,469 1365,447 1327,419 1276,394 1216,369 1153,347 1091,327 1038,307 1008,288 997,270",
    x: 1320,
    y: 310,
  },
  {
    id: "library",
    name: "Library",
    points:
      "610.5864,408.7925 646.6963,386.9319 700,346 761.5916,349.769 795.5131,335.5596 829.4346,338.8387 856.7906,355.2341 845.8482,389.118 863.356,419.7228 861.1675,475.4672 838.1885,497.3278 780.1937,520.2813 735,533 695,526 664.2042,517.0023 624.8115,498.4208 600.7382,482.0254 603,427",
    x: 735,
    y: 425,
  },
  {
    id: "computer-room",
    name: "Computer Room",
    points:
      "868.8272,378.1877 892,355 932.2932,343.2108 971.6859,349.769 1028.5864,363.9783 1095.3351,381.4668 1166.4607,394.5831 1231.0209,416.4437 1276.9791,431.7461 1312,458 1333.8796,489.6766 1337.1623,522.4674 1339.3508,547.607 1334.9738,573.8397 1325.1257,600.0724 1267.1309,615.3748 1199.288,620.8399 1142.3874,636.1423 1078.9215,641.6075 1029,619 996,592 959.6492,573.8397 923.5393,562.9094 875.3927,542.1419 868.8272,520.2813 866.6387,476.5602 869.9215,425.1879",
    x: 1110,
    y: 510,
  },
  {
    id: "classroom",
    name: "Classroom",
    points:
      "365,504 385.1728,484.2114 407.0576,474.3742 422.377,464.5369 453.0157,459.0718 456,412 458,364 462.8639,332.2805 498.9738,322.4433 525.2356,327.9084 565.7225,338.8387 594.1728,355.2341 596.3613,382.5598 595.267,441.5833 594,474 591.9843,513.7232 616.0576,525.7465 653.2618,536.6768 709.0681,553.0722 767.0628,569.4676 809.7382,539.9559 839.2827,545.421 845.8482,568.3746 849.1309,588.0491 904.9372,602.2585 937.7644,608.8166 970.5916,615.3748 973.8743,642.7005 1007.7958,652.5377 1046.0942,687.5146 1057.0366,706.0961 1074.5445,749.8172 1059.2251,784.7941 1041.7173,809.9338 1016.5497,841.6316 985.911,855.841 947.6126,855.841 896.1832,842.7246 779.0995,814.3059 680.6178,783.7011 588.7016,742.166 494.5969,686.4216 378.6073,605.5375 329.3665,571.6537",
    x: 685,
    y: 650,
  },
  {
    id: "sports",
    name: "Sports Ground",
    points:
      "97.9099,502.3285 135.5675,482.7685 183.7693,469.227 216.9081,482.7685 233.4774,503.8331 251.5531,526.4022 250.0942,564 279.0942,580 308.7928,606.1466 332.8937,622.6973 355.4882,637.7434 376.0942,652 406.0942,674 454.1099,714.8403 423.4712,731.2358 378.6073,749.8172 326.0837,773.8639 273.5602,797.9105 167.2,852.9028 146.1117,809.2691 106.9477,801.746 72.3027,809.2691 43.6828,783.6907 4.5189,755.1031 6.0252,673.8541 6.0252,561.0083 48.2018,536.9345",
    x: 220,
    y: 715,
  },
];

export default function WorldMap({ online = false }) {
  const { mode, roomCode } = useParams();
  const navigate = useNavigate();
  const [total, setTotal] = useState(0);
  const [match, setMatch] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [storyCharacters, setStoryCharacters] = useState(() =>
    online ? null : readStoryCharacters(mode),
  );
  const [characterSelections, setCharacterSelections] = useState(() => ({
    p1: readCharacter("p1"),
    p2: readCharacter("p2"),
  }));
  const canControl = online
    ? Boolean(userId) && match?.host_id === userId
    : Boolean(storyCharacters);
  const activeRegion = REGIONS.find((region) => region.id === selected);
  useEffect(() => {
    if (!online || !userId) return;
    const sync = ({ regionId, selectedId }) => {
      setHovered(regionId);
      setSelected(selectedId || null);
    };
    const join = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session)
        socket.emit("world-map-join", {
          roomCode,
          token: session.access_token,
        });
    };
    socket.on("world-map-hover", sync);
    socket.on("connect", join);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.emit("world-map-leave");
      socket.off("world-map-hover", sync);
      socket.off("connect", join);
    };
  }, [online, userId, roomCode]);
  const changeRegion = useCallback(
    (id, choose = false) => {
      if (!canControl || busy) return;
      const selectedId = choose ? id : selected;
      setHovered(id);
      if (choose) setSelected(id);
      if (online) socket.emit("world-map-hover", { regionId: id, selectedId });
    },
    [canControl, busy, online, selected],
  );

  useEffect(() => {
    if (!canControl) return;
    const onKey = (e) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.target?.closest?.("input, select, textarea, [contenteditable=true]")
      )
        return;
      const directions = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
      const direction = directions[e.key.toLowerCase()];
      if (!direction) return;
      e.preventDefault();
      const current = REGIONS.find((region) => region.id === selected);
      if (!current) {
        changeRegion("classroom", true);
        return;
      }
      const candidates = REGIONS.filter((region) => region !== current)
        .map((region) => {
          const dx = region.x - current.x,
            dy = region.y - current.y;
          const forward = dx * direction[0] + dy * direction[1];
          const sideways = Math.abs(dx * direction[1] - dy * direction[0]);
          return {
            region,
            forward,
            distance: Math.hypot(dx, dy) + sideways * 2,
          };
        })
        .filter((candidate) => candidate.forward > 0)
        .sort((a, b) => a.distance - b.distance);
      if (candidates[0]) changeRegion(candidates[0].region.id, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, selected, changeRegion]);

  useEffect(() => {
    if (!online) {
      const data = JSON.parse(
        sessionStorage.getItem(`kitchen-story:${mode}`) ||
          '{"total":0,"completed":[]}',
      );
      setTotal(data.total || 0);
      return;
    }
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id);
    });
    const refresh = async () => {
      try {
        const response = await getMatch(roomCode);
        if (!alive) return;
        const m = response.data;
        setMatch(m);
        setTotal(m.story_total || 0);
        if (m.status === "WAITING") {
          navigate(`/lobby/${roomCode}`, { replace: true });
          return;
        }
        if (m.round_status === "PLAYING")
          navigate(`/game/${roomCode}`, { replace: true });
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [online, mode, roomCode, navigate]);

  async function selectMap(map) {
    if (!canPlayStoryMap(map.id, total) || busy) return;
    if (!online) {
      navigate(
        mode === "coop-local"
          ? `/story-local/${map.id}`
          : `/story/${mode}/${map.id}`,
      );
      return;
    }
    if (match?.host_id !== userId) return;
    setBusy(true);
    setError("");
    try {
      await startStoryRound(roomCode, map.id);
      navigate(`/game/${roomCode}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!online && !storyCharacters) {
    return (
      <div className="character-offline">
        <div className="character-offline-panel">
          <h1>Choose your chef</h1>
          <CharacterPicker
            label={mode === "coop-local" ? "Player 1 · WASD" : ""}
            value={characterSelections.p1}
            onChange={(id) =>
              setCharacterSelections((current) => ({ ...current, p1: id }))
            }
          />
          {mode === "coop-local" && (
            <CharacterPicker
              label="Payer 2 · Arrow button"
              value={characterSelections.p2}
              onChange={(id) =>
                setCharacterSelections((current) => ({ ...current, p2: id }))
              }
            />
          )}
          {error && <p role="alert">{error}</p>}
          <div className="character-offline-actions">
            <button onClick={() => navigate("/play")}>Quay lại</button>
            <button
              onClick={() => {
                try {
                  setStoryCharacters(
                    confirmStoryCharacters(mode, characterSelections),
                  );
                } catch {
                  setError(
                    "Không thể lưu lựa chọn. Vui lòng kiểm tra bộ nhớ trình duyệt.",
                  );
                }
              }}
            >
              Chọn map
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <main className="wm-page">
      <header className="wm-header wm-header-compact">
        <p className="wm-score">Score · {total}</p>
        {!online && (
          <div
            className="story-character-lineup"
            aria-label="Nhân vật trong story"
          >
            {Object.entries(storyCharacters).map(([slot, id]) => (
              <span key={slot}>
                <img src={getCharacter(id).portrait} alt="" />
                {slot.toUpperCase()} · {getCharacter(id).name}
              </span>
            ))}
          </div>
        )}
        <p>
          {canControl ? "W A S D · Select region" : "W A S D · Host selects"}
        </p>
      </header>
      {error && (
        <p role="alert" className="wm-error">
          {error}
        </p>
      )}
      <div className="wm-map">
        <svg
          viewBox="0 0 1672 941"
          preserveAspectRatio="xMidYMid slice"
          aria-label="Choose a map region"
        >
          <image href={worldMapImage} width="1672" height="941" />
          {REGIONS.map((region) => {
            const unlocked = canPlayStoryMap(region.id, total);
            return (
              <g key={region.id}>
                <polygon
                  points={region.points}
                  className={`wm-region${hovered === region.id ? " wm-active" : ""}${selected === region.id ? " wm-selected" : ""}`}
                  role={canControl ? "button" : undefined}
                  tabIndex={canControl ? 0 : -1}
                  aria-label={`${region.name}${unlocked ? "" : " — Locked"}`}
                  onPointerEnter={() => changeRegion(region.id)}
                  onPointerLeave={() => changeRegion(null)}
                  onFocus={() => changeRegion(region.id)}
                  onBlur={() => changeRegion(null)}
                  onClick={() => changeRegion(region.id, true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      changeRegion(region.id, true);
                    }
                  }}
                  style={{ pointerEvents: canControl ? "auto" : "none" }}
                />
                <text x={region.x} y={region.y} className="wm-region-label">
                  {unlocked ? "" : "🔒 "}
                  {region.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <section className="wm-info" aria-live="polite">
        {activeRegion ? (
          <>
            <div>
              <h2>{activeRegion.name}</h2>
              <p>
                {canPlayStoryMap(activeRegion.id, total)
                  ? "Unlocked"
                  : STORY_MAPS.find((map) => map.id === activeRegion.id)
                        ?.available
                    ? `Locked · Requires ${STORY_MAPS.find((map) => map.id === activeRegion.id).unlockScore} points`
                    : "Locked"}
              </p>
            </div>
            {canControl && (
              <button
                disabled={busy || !canPlayStoryMap(activeRegion.id, total)}
                onClick={() => selectMap(activeRegion)}
              >
                Play
              </button>
            )}
          </>
        ) : (
          <p>
            {canControl
              ? "Choose a region on the map"
              : "Waiting for the host to point to a region"}
          </p>
        )}
      </section>
      <button
        className="wm-back"
        disabled={busy}
        onClick={async () => {
          if (!online) {
            navigate("/play");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await returnRoomToLobby(roomCode);
            navigate(`/lobby/${roomCode}`, { replace: true });
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        Back
      </button>
    </main>
  );
}
