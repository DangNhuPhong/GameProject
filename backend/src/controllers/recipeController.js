import { supabase } from "../config/supabase.js";

export const getRecipes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("recipes")
      .select(
        `
          *,
          recipe_materials (
            id,
            quantity,
            materials (
              id,
              name,
              image,
              type
            )
          ),
          processing_steps (
            id,
            step_order,
            action,
            duration
          )
        `,
      )
      .order("id", {
        ascending: true,
      });

    if (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getRecipeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("recipes")
      .select(
        `
          *,
          recipe_materials (
            id,
            quantity,
            materials (
              id,
              name,
              image,
              type
            )
          ),
          processing_steps (
            id,
            step_order,
            action,
            duration
          )
        `,
      )
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
