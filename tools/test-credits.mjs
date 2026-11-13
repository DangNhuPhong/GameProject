import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import FrontRoom from "../frontend/src/game/core/GameRoom.js";
import BackRoom from "../backend/src/classes/GameRoom.js";
import FrontController from "../frontend/src/game/core/GameController.js";
import BackController from "../backend/src/classes/GameController.js";
import * as front from "../frontend/src/game/storyConfig.js";
import * as back from "../backend/src/classes/storyConfig.js";

assert.equal(readFileSync(new URL("../frontend/src/game/storyConfig.js", import.meta.url), "utf8"),
  readFileSync(new URL("../backend/src/classes/storyConfig.js", import.meta.url), "utf8"),
  "Online and offline progression rules must match");

for (const rules of [front, back]) {
  let progress = { total: 9999, characters: { p1: "pepper" } };
  assert.equal(rules.summarizeCredits(progress.creditBests).total, 0, "Legacy points cannot award credits");
  for (let i = 0; i < 5; i++) {
    const map = rules.STORY_MAPS[i];
    const summary = rules.summarizeCredits(progress.creditBests);
    assert.equal(rules.canPlayStoryMap(map.id, summary.total, summary.mapBests), true);
    progress = rules.applyCreditResult(progress, { roundId: String(i), mapId: map.id, score: 24 });
    assert.equal(progress.total, (i + 1) * 24);
  }
  assert.equal(progress.graduated, true);
  assert.equal(progress.passedMaps.length, 5);
  assert.deepEqual(progress.characters, { p1: "pepper" });
  const duplicate = rules.applyCreditResult(progress, { roundId: "0", mapId: "classroom", score: 30 });
  assert.equal(duplicate.creditBests.classroom, 24, "A duplicate round is not reapplied");
  const worse = rules.applyCreditResult(progress, { roundId: "worse", mapId: "classroom", score: -10 });
  assert.equal(worse.creditBests.classroom, 24);
  let p = rules.applyCreditResult({}, { roundId: "a", mapId: "classroom", score: 20 });
  p = rules.applyCreditResult(p, { roundId: "b", mapId: "classroom", score: 25 });
  assert.equal(p.total, 25, "Retakes add the improvement, not another full result");
  assert.equal(p.creditsAdded, 5);
  assert.equal(rules.canPlayStoryMap("farm", 18, { classroom: 17 }), false);
  assert.equal(rules.canPlayStoryMap("farm", 18, { classroom: 18 }), true);
  assert.equal(rules.canPlayStoryMap("library", 120, { classroom: 30, farm: 30, sports: 30, "computer-room": 30 }), true);
  assert.equal(rules.summarizeCredits({ classroom: 30, farm: 30, sports: 30, "computer-room": 30 }).graduated, false,
    "120 credits from four maps do not complete the campaign");
  assert.equal(rules.summarizeCredits({ classroom: 18, farm: 18, sports: 18, "computer-room": 18, library: 18 }).graduated, false);
  assert.equal(rules.scoreContribution(999), 30);
  assert.equal(rules.scoreContribution(-3), 0);
}

const originalNow = Date.now;
let now = 1000000;
Date.now = () => now;
const layout = { id: "classroom", shelves: [], stations: [], spawn: { x: 0, y: 0 } };
try {
  for (const Room of [FrontRoom, BackRoom]) {
    for (const [recipeId, base, penalty, ingredients] of [
      ["hamburger", 5, 3, [{ type: "bread" }, { type: "meat", status: "cooked" }, { type: "tomato", status: "chopped" }]],
      ["pizza", 6, 4, [{ type: "dough" }, { type: "tomato", status: "chopped" }]],
      ["salad", 3, 2, [{ type: "salad", status: "chopped" }]],
    ]) {
      const room = new Room("TEST", layout);
      const durationMs = front.CREDIT_RULES[recipeId].durationMs;
      const plate = { id: "plate", type: "plate", ingredients, bakeStatus: "cooked" };
      const order = { id: "test-order", recipeId, status: "waiting", durationMs, createdAt: now, expiresAt: now + durationMs };
      room.orders = [{ ...order }];
      assert.equal(room.submitPlate(plate).points, base + 1, "Fast service bonus");
      room.orders = [{ ...order, expiresAt: now + 1000 }];
      assert.equal(room.submitPlate(plate).points, base, "Late service has no bonus");
      room.orders = [{ ...order, expiresAt: now }];
      const previous = room.score;
      room.nextOrderAt = now + 99999;
      room.updateOrders(now);
      room.updateOrders(now);
      assert.equal(room.score, previous - penalty, "Expiration deducted exactly once");
      assert.equal(room.expiredPenalties, penalty);
      room.orders = [{ ...order, expiresAt: now + 1000 }];
      room.roundEndsAt = now + 1000;
      const result = room.finishRound();
      assert.equal(result.expiredPenalties, penalty * 2, "Deadline expiration counted");
      assert.equal(room.finishRound(), null, "Finalization is idempotent");
      assert.equal(room.roundStatus, "FINISHED");
      const cutoff = new Room("CUTOFF", layout);
      cutoff.roundEndsAt = now + 1000;
      cutoff.orders = [{ ...order, expiresAt: now + 2000 }];
      cutoff.nextOrderAt = now + 99999;
      cutoff.updateOrders(now + 5000);
      assert.equal(cutoff.expiredPenalties, 0, "Late ticks cannot penalize orders beyond the deadline");
    }
  }
  for (const Controller of [FrontController, BackController]) {
    let attempts = 0;
    const events = [];
    const controller = new Controller({ getLayout: () => layout, onRoundFinished: async () => {
      if (++attempts === 1) throw new Error("temporary database outage");
    } });
    const room = controller.configureRound("TEST", { mapId: "classroom", roundId: "retry", durationMs: 1 });
    room.score = 24;
    now += 2;
    let handled = false;
    controller.handlers["test-late-action"] = () => { handled = true; };
    controller.handle("test-late-action", { roomCode: "TEST" }, {});
    assert.equal(handled, false, "Actions stop at the deadline even before the next tick");
    const log = console.error;
    try {
      console.error = () => {};
      await controller.tick((...args) => events.push(args));
    } finally { console.error = log; }
    assert.equal(events.length, 0, "No successful result emitted before saving");
    now += 3001;
    await controller.tick((...args) => events.push(args));
    await controller.tick((...args) => events.push(args));
    assert.equal(attempts, 2);
    assert.equal(events.filter((event) => event[1] === "map-finished").length, 1);
    assert.equal(room.finalScore, 24);
  }
} finally { Date.now = originalNow; }
console.log("PASS: credit progression, graduation, retakes, scoring, penalties, deadline, parity and save retries");
