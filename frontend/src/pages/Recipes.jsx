import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRecipes } from "../services/api";
import { CREDIT_RULES } from "../game/storyConfig";

function Recipes() {
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const data = await getRecipes();

        setRecipes(data || []);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadRecipes();
  }, []);

  if (loading) {
    return <div>Loading recipes...</div>;
  }

  return (
    <div className="page">
      <h1>Recipes</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div>
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            style={{
              border: "1px solid #ddd",
              padding: "20px",
              marginBottom: "15px",
              borderRadius: "10px",
            }}
          >
            <h2>{recipe.name}</h2>

            <p>Credits: Hamburger +5 / −3 expired; Pizza +6 / −4; Salad +3 / −2</p>
            <p>+1 credit for serving with at least half the time remaining.</p>
            <p>Order time limits: {Object.entries(CREDIT_RULES).map(([name, rule]) => `${name}: ${rule.durationMs / 1000}s`).join(" · ")}</p>
          </div>
        ))}
      </div>

      <button onClick={() => navigate("/")}>Back Home</button>
    </div>
  );
}

export default Recipes;
