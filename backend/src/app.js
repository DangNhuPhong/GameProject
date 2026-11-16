import express from "express";
import cors from "cors";
import { openapiSpec } from "./config/openapi.js";
import { swaggerPage } from "./config/swaggerPage.js";

import recipeRoutes from "./routes/recipeRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import customCharacterRoutes from "./routes/customCharacterRoutes.js";
import { getMapFilePath } from "./maps/index.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use('/api/custom-character', customCharacterRoutes);
app.use(express.json());

app.get("/api-docs.json", (req, res) => {
  res.set("Cache-Control", "no-store").json(openapiSpec);
});
app.get(["/api-docs", "/api-docs/"], (req, res) => {
  res.set("Cache-Control", "no-store").type("html").send(swaggerPage);
});

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

app.get("/api/maps/:id", (req, res) => {
  const file = getMapFilePath(req.params.id);
  if (!file) return res.sendStatus(404);
  res.set("Cache-Control", "no-cache");
  res.sendFile(file);
});

app.use("/api/recipes", recipeRoutes);

app.use("/api/matches", matchRoutes);

// 404 và error handler phải luôn nằm cuối cùng
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

export default app;
