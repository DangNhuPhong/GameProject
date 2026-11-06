import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Play.css";

function Play() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);

  // "modes": chọn chế độ chơi | "online": tạo / vào phòng
  const [view, setView] = useState("modes");

  // Chơi online bắt buộc đăng nhập
  const goOnline = (path) => navigate(loggedIn ? path : "/login");

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Single / Co-op cùng máy không cần đăng nhập, nên chỉ tải hồ sơ khi đã đăng nhập
      if (!user) {
        if (active) setLoggedIn(false);
        return;
      }

      if (active) setLoggedIn(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("username, level, coins, avatar")
        .eq("id", user.id)
        .single();

      if (!active) return;

      if (error) {
        console.error("Profile error:", error);
        return;
      }

      setProfile(data);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="pl-root">
      {/* Tên game đã có trong ảnh nền nên ẩn h1 (vẫn giữ cho SEO/screen reader) */}
      <h1 className="pl-sr-only">OverNấuĂn</h1>

      {/* Tên người chơi ở góc trên phải */}
      {profile && (
        <div className="pl-glass pl-profile">
          <span className="pl-profile-name">{profile.username}</span>
          <span>Lv. {profile.level}</span>
          <span>🪙 {profile.coins}</span>
        </div>
      )}

      {/* Thẻ ở giữa */}
      {view === "modes" ? (
        <nav className="pl-glass pl-card" aria-label="Game mode">
          <button
            className="pl-btn"
            onClick={() => {
              sessionStorage.removeItem("kitchen-story:single");
              navigate("/world/single");
            }}
          >
            Single Player
          </button>
          <button
            className="pl-btn"
            onClick={() => {
              sessionStorage.removeItem("kitchen-story:coop-local");
              navigate("/world/coop-local");
            }}
          >
            Local Co-op
          </button>
          <button className="pl-btn" onClick={() => setView("online")}>
            Online Co-op
          </button>
          <button className="pl-btn pl-btn-back" onClick={() => navigate("/")}>
            Back
          </button>
        </nav>
      ) : (
        <nav className="pl-glass pl-card" aria-label="Online co-op">
          <button className="pl-btn" onClick={() => goOnline("/createroom")}>
            Create Room
          </button>
          <button className="pl-btn" onClick={() => goOnline("/joinroom")}>
            Join Room
          </button>
          <button
            className="pl-btn pl-btn-back"
            onClick={() => setView("modes")}
          >
            Back
          </button>
        </nav>
      )}
    </div>
  );
}

export default Play;
