import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getRecipes } from "../services/api";
import "./Game.css";

function Game() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadGame = async () => {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        setUser(user);

        // Load recipes only once when entering the game
        const data = await getRecipes();
        setRecipes(data);
      } catch (error) {
        console.error("Failed to load game:", error);
      } finally {
        setLoading(false);
      }
    };

    loadGame();
  }, [navigate]);

  if (loading) {
    return <div className="game-loading">Loading game...</div>;
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <div>
          <h1>Kitchen Panic</h1>
          <p>Room: {roomCode}</p>
        </div>

        <div className="game-player">
          Player
          <br />
          {user?.email}
        </div>
      </div>

      <div className="game-container">
        <div className="game-board">
          <h2>Kitchen</h2>

          <div className="kitchen-placeholder">
            <p>Game Map</p>
            <p>Phaser will be added here</p>
          </div>
        </div>

        <div className="game-sidebar">
          <div className="order-panel">
            <h2>Orders</h2>

            {recipes.length === 0 ? (
              <p>No recipes available</p>
            ) : (
              recipes.map((recipe) => (
                <div className="recipe-card" key={recipe.id}>
                  <h3>{recipe.name}</h3>

                  <p>Score: {recipe.base_score}</p>

                  <p>Time: {recipe.time_limit}s</p>
                </div>
              ))
            )}
          </div>

          <div className="player-panel">
            <h2>Player</h2>

            <p>Score: 0</p>
            <p>Coins: 0</p>
          </div>
        </div>
      </div>

      <button className="leave-button" onClick={() => navigate("/")}>
        Leave Game
      </button>
    </div>
  );
}

export default Game;
