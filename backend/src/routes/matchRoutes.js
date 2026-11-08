import express from "express";

import {
  createMatch,
  getMatchByRoomCode,
  joinMatch,
  setPlayerReady,
  startMatch,
  updateMode,
  startStoryRound,
  quitRound,
  selectCharacter,
} from "../controllers/matchController.js";

const router = express.Router();

router.post("/", createMatch);

router.get("/:roomCode", getMatchByRoomCode);

router.post("/:roomCode/join", joinMatch);

router.patch("/:roomCode/ready", setPlayerReady);
router.patch("/:roomCode/character", selectCharacter);

router.post("/:roomCode/start", startMatch);
router.post("/:roomCode/quit", quitRound);
router.patch("/:roomCode/mode", updateMode);
router.post("/:roomCode/story/start", startStoryRound);

export default router;
