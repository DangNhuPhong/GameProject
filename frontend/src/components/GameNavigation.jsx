import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CharacterShop from "../components/CharacterShop";
import PlayHistory from "../components/PlayHistory";
import "../pages/LandingPage.css";
import "./GameNavigation.css";

function GameNavigation({ expanded = false }) {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const menuRef = useRef(null);
  const userId = user?.id;

  // ===== Trạng thái đăng nhập (tự cập nhật khi login/logout) =====
  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ===== Hồ sơ người chơi (chỉ tải khi đã đăng nhập) =====
  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;

    supabase
      .from("profiles")
      .select("id, username, level, coins, avatar")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;

        if (error) {
          console.error("Profile error:", error);
          return;
        }

        setProfile(data);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // ===== Đóng menu khi bấm ra ngoài / nhấn Esc =====
  useEffect(() => {
    if (!menuOpen && !aboutOpen) return;

    const onPointerDown = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setAboutOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, aboutOpen]);

  const logout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
  };

  // Vào màn chọn chế độ. Single / Local chơi offline nên không cần đăng nhập;
  // chỉ chế độ Online mới yêu cầu đăng nhập (kiểm tra ở trang Play).


  const displayName =
    (profile?.id === userId ? profile?.username : null) || user?.email?.split("@")[0] || "Player";


  const openSection = (section) => {
    setMenuOpen(false);
    setShopOpen(false);
    setHistoryOpen(false);
    if (!user) { navigate("/login"); return; }
    if (section === "shop") setShopOpen(true);
    else setHistoryOpen(true);
  };
  const actions = (
    <>
      {expanded && <button type="button" className="lp-menu-item" onClick={() => navigate("/")}>Home</button>}
      <button type="button" className="lp-menu-item" role={expanded ? undefined : "menuitem"} onClick={() => openSection("shop")}>Shop</button>
      <button type="button" className="lp-menu-item" role={expanded ? undefined : "menuitem"} onClick={() => openSection("history")}>History</button>
      <button type="button" className="lp-menu-item" role={expanded ? undefined : "menuitem"} onClick={() => { setMenuOpen(false); setAboutOpen(true); }}>About us</button>
      {user ? <button type="button" className="lp-menu-item lp-menu-item-danger" role={expanded ? undefined : "menuitem"} onClick={logout}>Logout</button>
        : <button type="button" className="lp-menu-item" role={expanded ? undefined : "menuitem"} onClick={() => navigate("/login")}>Login</button>}
    </>
  );
  return (
    <>
      {expanded ? (
        <nav className="gn-toolbar lp-glass" aria-label="Main navigation">
          <a className="gn-brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>OverNấuĂn<span>LET’S COOK TOGETHER</span></a>
          <div className="gn-actions">{actions}</div>
          {user && <span className="gn-player" title={displayName}><span className="gn-player-dot" />{displayName}</span>}
        </nav>
      ) : (
        <div className="lp-menu-wrap" ref={menuRef}>
          <button type="button" className="lp-glass lp-menu-trigger gn-menu-trigger" aria-label="Menu" aria-haspopup="menu" aria-controls="landing-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Menu
          </button>
          {menuOpen && <div id="landing-menu" className="lp-glass lp-menu-panel" role="menu">
            {user && <div className="lp-menu-user"><span className="lp-menu-user-name">{displayName}</span></div>}
            {actions}
          </div>}
        </div>
      )}
      {shopOpen && user && <CharacterShop key={user.id} user={user} onClose={() => setShopOpen(false)} onBalanceChange={(coins) => setProfile(current => ({ ...current, coins }))} />}
      {historyOpen && user && <PlayHistory key={user.id} onClose={() => setHistoryOpen(false)} />}
      {aboutOpen && (
        <div
          className="lp-about-overlay"
          onClick={() => setAboutOpen(false)}
          role="presentation"
        >
          <div
            className="lp-glass lp-about-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="about-title">About us</h2>
            <p>
              We are a student team from MSIS207.R12.CTTT, developing this
              multiplayer cooking game as a final project for the Web
              Application Development course. Our game allows players to work
              together, prepare ingredients, cook dishes, and enjoy a fun
              cooperative gaming experience.
            </p>

            <p>
              This website and game are created for educational purposes only.
              This is a non-commercial student project and is not affiliated
              with or endorsed by any official game, company, or brand. All
              third-party trademarks and assets belong to their respective
              owners.
            </p>

            <p className="lp-about-author">Đặng Như Phong</p>
            <p className="lp-about-author">Tô Huyền Châu</p>
            <button
              className="lp-glass lp-btn"
              onClick={() => setAboutOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default GameNavigation;
