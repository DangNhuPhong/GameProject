import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function Home() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("username, level, coins, avatar")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile error:", error);
        return;
      }

      setProfile(data);
    };

    loadProfile();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="page-container">
      <div className="page-card home-card">
        <h1>OverNấuĂn</h1>

        {profile && (
          <div className="profile-info">
            <h2>Welcome, {profile.username}!</h2>

            <p>
              Level: <strong>{profile.level}</strong>
            </p>

            <p>
              Coins: <strong>{profile.coins}</strong>
            </p>
          </div>
        )}

        <div className="home-actions">
          <button onClick={() => navigate("/createroom")}>Create Room</button>

          <button onClick={() => navigate("/joinroom")}>Join Room</button>

          <button onClick={() => navigate("/recipes")}>Recipes</button>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
