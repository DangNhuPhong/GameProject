import Phaser from "phaser";

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
};
