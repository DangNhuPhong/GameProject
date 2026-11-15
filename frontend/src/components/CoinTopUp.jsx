import { useEffect, useRef, useState } from "react";
import { getCoinTopups, topUpDemoCoins } from "../services/shopApi";

const number = (value) => Number(value).toLocaleString("en-US");

export default function CoinTopUp({ userId, onComplete, onBusyChange, busy }) {
  const storageKey = `kitchen-demo-topup:${userId}`;
  const [pendingRequest, setPendingRequest] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      return saved?.id && saved?.packageId ? saved : null;
    } catch { return null; }
  });
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(pendingRequest?.packageId || null);
  const [submitting, setSubmitting] = useState(false);
  const [reload, setReload] = useState(0);
  const requestRef = useRef(pendingRequest);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getCoinTopups().then((data) => {
      if (active) { setInfo(data); setError(""); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [reload]);

  const confirm = async () => {
    if (!selected || busy || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      // Reuse the request ID after a lost response to prevent duplicate credit.
      requestRef.current ||= { id: crypto.randomUUID(), packageId: selected };
      setPendingRequest(requestRef.current);
      try { sessionStorage.setItem(storageKey, JSON.stringify(requestRef.current)); } catch { /* Storage is optional. */ }
      const result = await topUpDemoCoins(requestRef.current.packageId, requestRef.current.id);
      setInfo(result.topups);
      onComplete(result.shop);
      setNotice("Demo top-up completed. Your coin balance has been updated.");
      requestRef.current = null;
      setPendingRequest(null);
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="coin-topup" aria-labelledby="topup-title">
      <h3 id="topup-title">Top up coins</h3>
      <p className="topup-demo-label">DEMO ONLY · No real payment</p>
      <p className="topup-description">Choose a package to add test coins. Prices below are illustrative; no money is charged.</p>
      {!info && !error && <p role="status">Loading coin packages…</p>}
      {info && !info.enabled && <p role="status">Demo top-ups are disabled.</p>}
      <div className="topup-packages" role="group" aria-label="Coin packages">
        {(info?.packages || []).map((pack) => (
          <button type="button" key={pack.id} aria-pressed={selected === pack.id}
            disabled={busy || submitting || !info.enabled || !!pendingRequest}
            onClick={() => { setSelected(pack.id); setNotice(""); }}>
            <strong>{number(pack.coins)} coins</strong>
            <span>{number(pack.amount_vnd)} VND</span>
          </button>
        ))}
      </div>
      {selected && <button className="topup-confirm" type="button" disabled={busy || submitting || !info?.enabled} onClick={confirm}>
        {submitting ? "Adding coins…" : pendingRequest ? "Retry demo top-up" : "Confirm demo top-up"}
      </button>}
      {error && <p className="shop-error" role="alert">{error}
        {!info && <button type="button" onClick={() => setReload((value) => value + 1)}>Retry loading</button>}
      </p>}
      <p className="shop-notice" role="status">{notice}</p>
      {info && <div className="topup-history">
        <h4>Recent demo top-ups</h4>
        {info.history.length === 0 ? <p>No top-ups yet.</p> : <ul>
          {info.history.map((entry) => <li key={entry.id}>
            <span>+{number(entry.coins)} coins <small>Demo</small></span>
            <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
          </li>)}
        </ul>}
      </div>}
    </section>
  );
}
