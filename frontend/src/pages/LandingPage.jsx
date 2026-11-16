import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CharacterShop from "../components/CharacterShop";
import PlayHistory from "../components/PlayHistory";
import "./LandingPage.css";

function LandingPage() {
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
  const handlePlay = () => navigate("/play");

  const displayName =
    (profile?.id === userId ? profile?.username : null) || user?.email?.split("@")[0] || "Player";

  return (
    <div className="lp-root">
      {/* Tên game đã có trong ảnh nền nên ẩn h1 (vẫn giữ cho SEO/screen reader) */}
      <h1 className="lp-sr-only">OverNấuĂn</h1>

      {/* ===== Menu góc trên phải ===== */}
      <div className="lp-menu-wrap" ref={menuRef}>
        <button type="button" className="lp-glass lp-shop-trigger" onClick={() => {
          setMenuOpen(false);
          setShopOpen(false);
          if (user) setHistoryOpen(true);
          else navigate("/login");
        }}>History</button>
        <button type="button" className="lp-glass lp-shop-trigger" onClick={() => {
          setMenuOpen(false);
          setHistoryOpen(false);
          if (user) setShopOpen(true);
          else navigate("/login");
        }}>Shop</button>
        <button
          className="lp-glass lp-menu-trigger"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={user ? `User menu: ${displayName}` : "Menu"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {user && <span className="lp-user-name">{displayName}</span>}
          {!user && <span aria-hidden="true">☰</span>}
        </button>

        {menuOpen && (
          <div className="lp-glass lp-menu-panel" role="menu">
            {user ? (
              <div className="lp-menu-user">
                <span className="lp-menu-user-name">{displayName}</span>
              </div>
            ) : (
              <button
                className="lp-menu-item"
                role="menuitem"
                onClick={() => navigate("/login")}
              >
                Login
              </button>
            )}

            <button
              className="lp-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setAboutOpen(true);
              }}
            >
              About us
            </button>

            {user && (
              <button
                className="lp-menu-item lp-menu-item-danger"
                role="menuitem"
                onClick={logout}
              >
                Logout
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== Nút Play ở giữa ===== */}
      {shopOpen && user && (
        <CharacterShop key={user.id} user={user}
          onClose={() => setShopOpen(false)}
          onBalanceChange={(coins) => setProfile((current) => ({ ...current, coins }))}
        />
      )}
      <button className="lp-glass lp-play" onClick={handlePlay}>
        Play
      </button>
      {historyOpen && user && <PlayHistory key={user.id} onClose={() => setHistoryOpen(false)} />}

      {/* ===== About us ===== */}
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
    </div>
  );
}

export default LandingPage;
