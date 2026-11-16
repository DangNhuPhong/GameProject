import { useEffect, useRef, useState } from "react";
import { CHARACTERS } from "../game/characters";
import { buyCharacter, getShop } from "../services/shopApi";
import "./CharacterShop.css";
import CoinTopUp from "./CoinTopUp";
import CustomCharacterCreator from './CustomCharacterCreator';

const formatCoins = (value) => Number(value).toLocaleString("en-US");

export default function CharacterShop({ user, onClose, onBalanceChange }) {
  const dialogRef = useRef(null);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [buying, setBuying] = useState(null);
  const [reload, setReload] = useState(0);
  const [topupOpen, setTopupOpen] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const balanceCallback = useRef(onBalanceChange);

  useEffect(() => { balanceCallback.current = onBalanceChange; }, [onBalanceChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    let active = true;
    getShop().then((data) => {
      if (!active) return;
      setShop(data);
      balanceCallback.current(data.coins);
    }).catch((err) => {
      if (active) setError(err.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user.id, reload]);

  const purchase = async (character) => {
    if (buying || toppingUp) return;
    setBuying(character.id);
    setError("");
    setNotice("");
    try {
      const data = await buyCharacter(character.id);
      setShop(data);
      balanceCallback.current(data.coins);
      setNotice(`${character.name} is now in your collection!`);
    } catch (err) {
      setError(err.message);
      // Refresh after errors too: another tab may have spent coins or completed the purchase.
      setReload((value) => value + 1);
    } finally {
      setBuying(null);
    }
  };

  const catalog = (shop?.characters || []).map((entry) => ({
    ...CHARACTERS.find((character) => character.id === entry.id), ...entry,
  })).filter((character) => character.portrait);
  const ownedCount = catalog.filter((character) => character.owned).length;
  const visible = catalog.filter((character) => filter === "all" ||
    (filter === "owned" ? character.owned : !character.owned));

  return (
    <dialog ref={dialogRef} className="character-shop" aria-labelledby="shop-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="shop-content">
        <header className="shop-header">
          <div><p className="shop-eyebrow">CHEF COLLECTION</p><h2 id="shop-title">Character Shop</h2>
            <p>Find your next kitchen companion.</p></div>
          <button type="button" className="shop-close" onClick={onClose} aria-label="Close shop" autoFocus>×</button>
        </header>
        <section className="shop-wallet" aria-label="Wallet">
          <div><span>Your balance</span><strong>{shop ? `${formatCoins(shop.coins)} coins` : "— coins"}</strong></div>
          <span>{shop ? `${ownedCount} / ${catalog.length} owned` : "Loading collection…"}</span>
          <button type="button" className="shop-topup-trigger" aria-expanded={topupOpen}
            disabled={loading || !shop || !!buying || toppingUp}
            onClick={() => setTopupOpen((open) => !open)}>{topupOpen ? "Hide top-up" : "+ Top up coins"}</button>
        </section>
        {topupOpen && <CoinTopUp userId={user.id} busy={!!buying || toppingUp} onBusyChange={setToppingUp}
          onComplete={(data) => { setShop(data); balanceCallback.current(data.coins); }} />}
        <CustomCharacterCreator key={user.id}
          onBalanceChange={coins=>{setShop(current=>current?{...current,coins}:current);balanceCallback.current(coins);}}
          onComplete={()=>setReload(value=>value+1)}/>
        <div className="shop-filters" role="group" aria-label="Filter characters">
          {[["all", "All characters"], ["owned", "Owned"], ["unowned", "Not owned"]].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {error && <div className="shop-error" role="alert">{error}
          <button type="button" disabled={loading || !!buying || toppingUp} onClick={() => {
            setError(""); setLoading(true); setReload((value) => value + 1);
          }}>Retry</button></div>}
        <p className="shop-notice" role="status">{loading ? "Loading characters and balance…" : notice}</p>
        <div className="shop-grid" aria-busy={loading || !!buying}>
          {visible.map((character) => (
            <article key={character.id} className={`shop-card${character.owned ? " is-owned" : ""}`}
              style={{ "--chef-color": character.color }}>
              <span className="shop-badge">{character.owned ? "✓ Owned" : "Not owned"}</span>
              <div className="shop-portrait"><img src={character.portrait} alt={character.name} /></div>
              <h3>{character.name}</h3><p>{character.description}</p>
              <strong className="shop-price">{character.price === 0 ? "Free" : `${formatCoins(character.price)} coins`}</strong>
              <button type="button" disabled={character.owned || !!buying || toppingUp || shop.coins < character.price}
                onClick={() => purchase(character)}>
                {character.owned ? "In your collection" : buying === character.id ? "Buying…" :
                  shop.coins < character.price ? "Not enough coins" : "Buy character"}
              </button>
            </article>
          ))}
        </div>
        {!loading && shop && visible.length === 0 && <p className="shop-empty">No characters in this category yet.</p>}
      </div>
    </dialog>
  );
}
