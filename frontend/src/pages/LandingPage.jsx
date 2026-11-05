import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./LandingPage.css";

function LandingPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
      setProfile(null);
      return;
    }

    let active = true;

    supabase
      .from("profiles")
      .select("username, level, coins, avatar")
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
    profile?.username || user?.email?.split("@")[0] || "Player";

  return (
    <div className="lp-root">
      {/* Tên game đã có trong ảnh nền nên ẩn h1 (vẫn giữ cho SEO/screen reader) */}
      <h1 className="lp-sr-only">OverNấuĂn</h1>

      {/* ===== Menu góc trên phải ===== */}
      <div className="lp-menu-wrap" ref={menuRef}>
        <button
          className="lp-glass lp-menu-trigger"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {user ? displayName.charAt(0).toUpperCase() : "👤"}
        </button>

        {menuOpen && (
          <div className="lp-glass lp-menu-panel" role="menu">
            {user ? (
              <div className="lp-menu-user">
                <span className="lp-menu-user-name">{displayName}</span>
                {profile && (
                  <span className="lp-menu-user-stats">
                    Lv. {profile.level} · 🪙 {profile.coins}
                  </span>
                )}
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
      <button className="lp-glass lp-play" onClick={handlePlay}>
        Play
      </button>

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
              OverNấuĂn is a cooperative cooking game: team up, chop, cook and
              serve orders before the time runs out.
            </p>
            {/* Sửa nội dung giới thiệu / thành viên nhóm ở đây */}
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
