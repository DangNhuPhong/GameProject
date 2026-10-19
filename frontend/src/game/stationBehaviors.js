import Phaser from "phaser";

const norm = (list) =>
  (list || []).map((i) =>
    typeof i === "string"
      ? { type: i, status: "raw" }
      : { type: i.type ?? i.ingredientType, status: i.status ?? "raw" },
  );

const isPizzaPlate = (item) => {
  if (!item || item.type !== "plate") return false;
  const ing = norm(item.ingredients);
  return (
    ing.length === 2 &&
    ing.some((i) => i.type === "dough") &&
    ing.some((i) => i.type === "tomato" && i.status === "chopped")
  );
};

export const STATION_BEHAVIORS = {
  grill: {
    accepts: (item) => item.type === "meat" && item.status === "raw",
    placeLabel: "Cook meat",
    progress: (item, st, elapsed) => {
      if (item.status === "burnt") {
        return { progress: 1, color: 0x111827, text: "Burnt!" };
      }

      if (item.status === "cooked") {
        return {
          progress: Phaser.Math.Clamp(
            (elapsed - st.cookTime) / (st.burnTime - st.cookTime),
            0,
            1,
          ),
          color: 0xf59e0b,
          text: "Take it out!",
        };
      }

      return {
        progress: Phaser.Math.Clamp(elapsed / st.cookTime, 0, 1),
        color: 0x22c55e,
        text: "Cooking...",
      };
    },
  },

  "cutting-board": {
    chop: true,
    accepts: (item) =>
      (item.type === "tomato" || item.type === "salad") &&
      item.status === "raw",
    placeLabel: "Place to chop",
    progress: (item, st, elapsed) => {
      if (item.status === "chopped") {
        return { progress: 1, color: 0x22c55e, text: "Take it out!" };
      }

      const p = Phaser.Math.Clamp(elapsed / st.cutTime, 0, 1);

      if (st.cutState === "cutting") {
        return { progress: p, color: 0x38bdf8, text: "Chopping..." };
      }

      if (st.cutState === "paused") {
        return { progress: p, color: 0xf59e0b, text: "Press E to resume" };
      }

      return { progress: p, color: 0x38bdf8, text: "Press E to chop" };
    },
  },

  oven: {
    placeLabel: "Bake pizza",
    accepts: (held) => isPizzaPlate(held),
    progress: (item, station, elapsed) => {
      const bake = station.cookTime;
      const burn = station.burnTime;

      if (elapsed < bake) {
        return { progress: elapsed / bake, color: 0xf59e0b, text: "Baking..." };
      }

      if (elapsed < bake + burn) {
        return {
          progress: 1 - (elapsed - bake) / burn,
          color: 0x22c55e,
          text: "Ready!",
        };
      }

      return { progress: 1, color: 0xef4444, text: "Burnt!" };
    },
  },
};
