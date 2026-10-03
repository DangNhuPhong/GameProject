import express from "express";

import {
  createMatch,
  getMatchByRoomCode,
  joinMatch,
  setPlayerReady,
  startMatch,
} from "../controllers/matchController.js";

const router = express.Router();

router.post("/", createMatch);

router.get("/:roomCode", getMatchByRoomCode);

router.post("/:roomCode/join", joinMatch);

router.patch("/:roomCode/ready", setPlayerReady);

router.post("/:roomCode/start", startMatch);

export default router;
