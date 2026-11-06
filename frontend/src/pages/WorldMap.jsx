import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { STORY_MAPS, canPlayStoryMap } from "../game/storyConfig";
import { getMatch } from "../services/api";
import { startStoryRound, returnRoomToLobby } from "../services/storyApi";
import worldMapImage from "../assets/world-map-clean.png";
import { socket } from "../services/socket";
import "./WorldMap.css";
import { supabase } from "../lib/supabase";

const REGIONS = [
  { id: "farm", name: "Farm", points: "1003,254 1046,233 1110,214 1187,191 1270,174 1359,167 1438,180 1497,209 1556,247 1601,290 1625,331 1625,373 1602,410 1560,444 1511,467 1454,477 1408,469 1365,447 1327,419 1276,394 1216,369 1153,347 1091,327 1038,307 1008,288 997,270", x: 1320, y: 310 },
  { id: "hall", name: "Library", points: "607,400 646,370 700,346 757,329 797,321 830,333 855,351 860,391 857,435 834,469 799,497 772,525 735,533 695,526 666,509 647,479 620,451 603,427", x: 735, y: 425 },
  { id: "dorm", name: "Computer Room", points: "865,375 892,355 930,352 973,363 1028,382 1093,390 1165,391 1235,402 1280,425 1312,458 1338,505 1358,552 1364,584 1353,610 1327,630 1280,642 1212,643 1137,640 1070,633 1029,619 996,592 962,569 920,550 884,536 863,516 856,474 859,421", x: 1110, y: 510 },
  { id: "bistro", name: "Classroom", points: "365,504 384,489 416,483 454,489 463,467 456,412 458,364 471,336 493,328 522,336 553,352 577,384 599,413 602,441 594,474 596,512 608,532 645,546 701,561 764,578 829,598 893,618 948,629 982,648 1002,678 1014,714 1026,752 1024,774 1005,786 966,791 915,787 859,780 802,772 745,758 694,741 647,719 610,694 584,677 541,662 497,649 457,632 423,610 395,580 378,550", x: 685, y: 650 },
  { id: "sports", name: "Sports Ground", points: "7,660 25,613 55,581 101,573 154,564 203,555 249,564 278,580 284,611 307,631 340,647 375,652 405,674 424,707 436,748 438,790 423,834 393,879 363,888 318,889 271,871 221,850 168,830 115,812 62,793 24,775 6,752", x: 220, y: 715 },
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
  const canControl = !online || (Boolean(userId) && match?.host_id === userId);
  const activeRegion = REGIONS.find((region) => region.id === selected);
  useEffect(() => {
    if (!online || !userId) return;
    const sync = ({ regionId, selectedId }) => { setHovered(regionId); setSelected(selectedId || null); };
    const join = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) socket.emit("world-map-join", { roomCode, token: session.access_token });
    };
    socket.on("world-map-hover", sync);
    socket.on("connect", join);
    if (socket.connected) join(); else socket.connect();
    return () => {
      socket.emit("world-map-leave");
      socket.off("world-map-hover", sync);
      socket.off("connect", join);
    };
  }, [online, userId, roomCode]);
  const changeRegion = useCallback((id, choose = false) => {
    if (!canControl || busy) return;
    const selectedId = choose ? id : selected;
    setHovered(id);
    if (choose) setSelected(id);
    if (online) socket.emit("world-map-hover", { regionId: id, selectedId });
  }, [canControl, busy, online, selected]);

  useEffect(() => {
    if (!canControl) return;
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey ||
          e.target?.closest?.("input, select, textarea, [contenteditable=true]")) return;
      const directions = { w: [0,-1], a: [-1,0], s: [0,1], d: [1,0] };
      const direction = directions[e.key.toLowerCase()];
      if (!direction) return;
      e.preventDefault();
      const current = REGIONS.find((region) => region.id === selected);
      if (!current) { changeRegion("bistro", true); return; }
      const candidates = REGIONS.filter((region) => region !== current).map((region) => {
        const dx = region.x - current.x, dy = region.y - current.y;
        const forward = dx * direction[0] + dy * direction[1];
        const sideways = Math.abs(dx * direction[1] - dy * direction[0]);
        return { region, forward, distance: Math.hypot(dx,dy) + sideways * 2 };
      }).filter((candidate) => candidate.forward > 0).sort((a,b) => a.distance - b.distance);
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
  return (
    <main className="wm-page">
      <header className="wm-header wm-header-compact">
        <p className="wm-score">Score · {total}</p>
        <p>{canControl ? "W A S D · Select region" : "W A S D · Host selects"}</p>
      </header>
      {error && <p role="alert" className="wm-error">{error}</p>}
      <div className="wm-map">
        <svg viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" aria-label="Choose a map region">
          <image href={worldMapImage} width="1672" height="941" />
          {REGIONS.map((region) => {
            const unlocked = canPlayStoryMap(region.id, total);
            return <g key={region.id}>
              <polygon points={region.points}
                className={`wm-region${hovered === region.id ? " wm-active" : ""}${selected === region.id ? " wm-selected" : ""}`}
                role={canControl ? "button" : undefined} tabIndex={canControl ? 0 : -1}
                aria-label={`${region.name}${unlocked ? "" : " — Locked"}`}
                onPointerEnter={() => changeRegion(region.id)} onPointerLeave={() => changeRegion(null)} 
                onFocus={() => changeRegion(region.id)} onBlur={() => changeRegion(null)}
                onClick={() => changeRegion(region.id, true)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); changeRegion(region.id, true); } }}
                style={{ pointerEvents: canControl ? "auto" : "none" }} />
              <text x={region.x} y={region.y} className="wm-region-label">{unlocked ? "" : "🔒 "}{region.name}</text>
            </g>;
          })}
        </svg>
      </div>
      <section className="wm-info" aria-live="polite">
        {activeRegion ? <>
          <div><h2>{activeRegion.name}</h2><p>{canPlayStoryMap(activeRegion.id, total) ? "Unlocked" :
            STORY_MAPS.find((map) => map.id === activeRegion.id)?.available ? `Locked · Requires ${STORY_MAPS.find((map) => map.id === activeRegion.id).unlockScore} points` : "Locked"}</p></div>
          {canControl && <button disabled={busy || !canPlayStoryMap(activeRegion.id, total)}
            onClick={() => selectMap(activeRegion)}>Play</button>}
        </> : <p>{canControl ? "Choose a region on the map" : "Waiting for the host to point to a region"}</p>}
      </section>
      <button
        className="wm-back"
        disabled={busy}
        onClick={async () => {
          if (!online) { navigate("/play"); return; }
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
