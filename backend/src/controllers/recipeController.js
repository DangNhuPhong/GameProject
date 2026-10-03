import { supabase } from "../config/supabase.js";

export const getRecipes = async (req, res) => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  res.json({
    success: true,
    data,
  });
};
export const getRecipeById = async (req, res) => {
  const { id } = req.params;

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (recipeError) {
    return res.status(404).json({
      success: false,
      error: "Recipe not found",
    });
  }

  const { data: materials, error: materialsError } = await supabase
    .from("recipe_materials")
    .select(
      `
      quantity,
      material:materials (
        id,
        name,
        image,
        type
      )
    `,
    )
    .eq("recipe_id", id);

  if (materialsError) {
    return res.status(500).json({
      success: false,
      error: materialsError.message,
    });
  }

  const { data: steps, error: stepsError } = await supabase
    .from("processing_steps")
    .select("*")
    .eq("recipe_id", id)
    .order("step_order", { ascending: true });

  if (stepsError) {
    return res.status(500).json({
      success: false,
      error: stepsError.message,
    });
  }

  res.json({
    success: true,
    data: {
      ...recipe,
      materials,
      steps,
    },
  });
};
