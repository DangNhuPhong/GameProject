const API_URL = "http://localhost:5000/api";

export const getRecipes = async () => {
  const response = await fetch(`${API_URL}/recipes`);

  if (!response.ok) {
    throw new Error("Failed to fetch recipes");
  }

  const result = await response.json();

  return result.data;
};

export const getRecipeById = async (id) => {
  const response = await fetch(`${API_URL}/recipes/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch recipe");
  }

  const result = await response.json();

  return result.data;
};
