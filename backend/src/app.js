import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import recipeRoutes from "./routes/recipeRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Kitchen Panic API is running",
  });
});

app.use("/api/recipes", recipeRoutes);
app.use("/api/matches", matchRoutes);

export default app;
