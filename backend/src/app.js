import express from "express";
import cors from "cors";

import recipeRoutes from "./routes/recipeRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import { getMapFilePath } from "./maps/index.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Kitchen Panic API is running",
  });
});

app.get("/api/test-db", async (req, res) => {
  res.json({
    success: true,
    message: "Database API is ready",
  });
});

app.use("/api/recipes", recipeRoutes);

app.use("/api/matches", matchRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

app.get("/api/maps/:id", (req, res) => {
  const file = getMapFilePath(req.params.id);
  if (!file) return res.sendStatus(404);
  res.set("Cache-Control", "no-cache");
  res.sendFile(file);
});

export default app;
