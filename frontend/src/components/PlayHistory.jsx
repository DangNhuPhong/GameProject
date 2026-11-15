import { useEffect, useRef, useState } from "react";
import { getOnlinePlayHistory } from "../services/historyApi";
import { historyCredits, historyMapName, historyRoomStatus } from "../game/historyDetails";
import "./PlayHistory.css";

const date = (value) => value ? new Date(value).toLocaleString() : "Not recorded";

export default function PlayHistory({ onClose }) {
  const dialogRef = useRef(null);
  const [page, setPage] = useState({ offset: 0, request: 0 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    let active = true;
    getOnlinePlayHistory(page.offset).then((data) => {
      if (active) setResult(data);
    }).catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  const loadPage = (offset) => {
    setLoading(true);
    setError("");
    setResult(null);
    setPage((current) => ({ offset, request: current.request + 1 }));
    dialogRef.current.scrollTop = 0;
  };

  return (
    <dialog ref={dialogRef} className="play-history" aria-labelledby="history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="history-content">
        <header className="history-header">
          <div><p className="history-eyebrow">YOUR ONLINE JOURNEY</p>
            <h2 id="history-title">Play History</h2>
            <p>Rooms you created or joined, newest first.</p></div>
          <button type="button" className="history-close" onClick={onClose} aria-label="Close history" autoFocus>×</button>
        </header>
        <p className="history-note">Room records include everyone who joined. Story credits are shared room totals; Free Play shows the latest finished round. These are current room records, not individual round snapshots.</p>
        {loading && <p className="history-empty" role="status">Loading online history…</p>}
        {error && <div className="history-error" role="alert">{error}
          <button type="button" onClick={() => loadPage(page.offset)}>Retry</button></div>}
        {!loading && !error && result?.rooms.length === 0 && <p className="history-empty">No online rooms found on this page.</p>}
        <div className="history-rooms" aria-busy={loading}>
          {(result?.rooms || []).map((room) => {
            const credits = historyCredits(room);
            return <article key={room.id} className="history-room">
              <div className="history-room-top">
                <div><span className="history-role">{room.role === "HOST" ? "Created by you" : "Joined by you"}</span>
                  <h3>Room {room.room_code}</h3></div>
                <div className="history-credits"><strong>{credits ? `${credits.value}${credits.cap ? ` / ${credits.cap}` : ""}` : "—"}</strong>
                  <span>{credits?.label || "No finished credits recorded"}</span></div>
              </div>
              <dl className="history-details">
                <div><dt>Host</dt><dd>{room.host_name}</dd></div>
                <div><dt>Mode</dt><dd>{room.game_mode === "STORY" ? "Story" : room.game_mode === "FREE" ? "Free Play" : "Not recorded"}</dd></div>
                <div><dt>Current / latest map</dt><dd>{historyMapName(room.current_map)}</dd></div>
                <div><dt>Last recorded status</dt><dd>{historyRoomStatus(room)}</dd></div>
                <div><dt>{room.role === "HOST" ? "Created" : "First joined"}</dt><dd>{date(room.role === "HOST" ? room.created_at : room.joined_at)}</dd></div>
                {room.started_at && <div><dt>Started</dt><dd>{date(room.started_at)}</dd></div>}
              </dl>
              <div className="history-players"><h4>Room members ({room.players.length})</h4>
                <ul>{room.players.map((player) => <li key={player.user_id}>
                  {player.username}{player.is_you && <small>You</small>}{player.is_host && <small>Host</small>}
                </li>)}</ul>
              </div>
            </article>;
          })}
        </div>
        <nav className="history-pagination" aria-label="History pages">
          <button type="button" disabled={loading || page.offset === 0} onClick={() => loadPage(Math.max(0, page.offset - 20))}>Previous</button>
          <span>Page {Math.floor(page.offset / 20) + 1}</span>
          <button type="button" disabled={loading || !result?.has_more || !!error} onClick={() => loadPage(page.offset + 20)}>Next</button>
        </nav>
        <button type="button" className="history-refresh" disabled={loading} onClick={() => loadPage(0)}>Refresh history</button>
      </div>
    </dialog>
  );
}
