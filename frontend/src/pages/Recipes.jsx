import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRecipes } from "../services/api";

function Recipes() {
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const data = await getRecipes();
        setRecipes(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadRecipes();
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <h2>Loading recipes...</h2>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-card recipes-card">
        <h1>Recipes</h1>

        {error && <p className="error">{error}</p>}

        <div className="recipes-list">
          {recipes.map((recipe) => (
            <div className="recipe-item" key={recipe.id}>
              <h2>{recipe.name}</h2>

              <p>Score: {recipe.base_score}</p>

              <p>Time: {recipe.time_limit}s</p>
            </div>
          ))}
        </div>

        <button className="secondary-button" onClick={() => navigate("/")}>
          Back
        </button>
      </div>
    </div>
  );
}

export default Recipes;
