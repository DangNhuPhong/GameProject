import assert from "node:assert/strict";
import fs from "node:fs";
import { TutorialProgress, createTutorialGuide } from "../frontend/src/game/TutorialGuide.js";
import { readLayout } from "../frontend/src/game/core/readLayout.js";

// Resolve the browser transport's extensionless imports for Node.
const source = fs.readFileSync(new URL("../frontend/src/game/LocalTransport.js", import.meta.url), "utf8")
  .replace('"./core/GameController"', JSON.stringify(new URL("../frontend/src/game/core/GameController.js", import.meta.url).href))
  .replace('"./core/readLayout"', JSON.stringify(new URL("../frontend/src/game/core/readLayout.js", import.meta.url).href));
const { default: LocalTransport } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const mapJson = JSON.parse(fs.readFileSync(new URL("../frontend/src/game/maps/kitchen/kitchen.json", import.meta.url)));
const layout = readLayout(mapJson);
const realNow = Date.now;
let now = realNow(), timers = 0;
Date.now = () => now;
globalThis.window = { setInterval: () => ++timers, clearInterval: () => --timers };
const net = new LocalTransport({ roomCode: "LOCAL", mapId: "kitchen", mapJson, tutorial: true });
const ordinary = new LocalTransport({ roomCode: "NORMAL", mapId: "kitchen", mapJson });
try {
  const room = net.controller.getRoom("LOCAL");
  const normal = ordinary.controller.getRoom("NORMAL");
  assert.equal(room.roundEndsAt, null);
  assert.equal(room.orders.length, 1);
  assert.equal(normal.roundEndsAt - now, 180000);
  let completed;
  net.on("order-completed", (payload) => completed = payload);
  net.emit("join-room", { roomCode: "LOCAL", userId: "local", mapId: "kitchen" });
  const progress = new TutorialProgress();
  let pos = { x: 0, y: 0 }, menu = { open: false, view: "main" };
  const observe = () => progress.update(room.getState().items, pos, menu);
  const expect = (id) => { observe(); assert.equal(progress.snapshot().id, id); };
  const dismiss = () => {
    assert.equal(progress.snapshot().promptOpen, true);
    assert.equal(progress.continue(), true);
    assert.equal(progress.continue(), false, "Second E is available for gameplay");
    observe();
  };
  const at = (point) => { pos = point; return { playerX: point.x, playerY: point.y }; };
  const command = (event, data = {}) => net.emit(event, { roomCode: "LOCAL", userId: "local", ...data });
  const shelf = (type) => layout.shelves.find((s) => s.ingredient === type);
  const station = (kind) => layout.stations.find((s) => s.kind === kind);
  const held = () => room.items.find((i) => i.state === "held" && i.userId === "local");

  // Kitchen's menu must be a real interaction station in both map copies.
  const board = station("order-station");
  assert.ok(board, "Kitchen has a menu board");
  const serverMap = JSON.parse(fs.readFileSync(new URL("../backend/src/maps/kitchen.json", import.meta.url)));
  assert.deepEqual(readLayout(serverMap), layout, "Client and server Kitchen layouts agree");
  let listedOrders = null;
  net.on("orders-list", (payload) => listedOrders = payload.orders);
  command("request-orders", { playerX: 0, playerY: 64 });
  await Promise.resolve();
  assert.equal(listedOrders, null, "Menu cannot be opened from a distant station");
  const menuPosition = { x: board.x, y: board.y - 20 };
  const counterLayer = mapJson.layers.find((l) => l.name === "counters");
  const feetCell = Math.floor((menuPosition.y + 9) / 16) * mapJson.width + Math.floor(menuPosition.x / 16);
  assert.equal(counterLayer.data[feetCell], 0, "Player can stand within interaction range of the board");
  command("request-orders", { playerX: menuPosition.x, playerY: menuPosition.y });
  await Promise.resolve();
  assert.equal(listedOrders?.[0]?.recipeId, "hamburger", "Menu displays the real tutorial order");

  // Exercise the real shelf renderer to catch icons drawing over the chef again.
  const sceneSource = fs.readFileSync(new URL("../frontend/src/game/KitchenScene.js", import.meta.url), "utf8");
  const renderSource = sceneSource.slice(sceneSource.indexOf("    createKitchenShelfIcons() {"), sceneSource.indexOf("    handleInteract(p) {"));
  const Renderer = new Function("itemFrame", `return class {${renderSource}}`)(() => 0);
  const renderer = new Renderer(), drawn = [];
  const draw = (kind, ...args) => {
    const entry = { kind, args, setStrokeStyle() { return this; }, setOrigin() { return this; }, setDisplaySize() { return this; }, setDepth(depth) { this.depth = depth; return this; } };
    drawn.push(entry);
    return entry;
  };
  renderer.layout = { shelves: layout.shelves, stations: layout.stations };
  renderer.add = Object.fromEntries(["rectangle", "image", "text"].map((kind) => [kind, (...args) => draw(kind, ...args)]));
  renderer.createKitchenShelfIcons();
  const playerCode = sceneSource.slice(sceneSource.indexOf("    createLocalPlayer(slot"));
  const playerDepth = Number(playerCode.match(/const sprite[\s\S]*?\.setDepth\((\d+)\)/)[1]);
  assert.ok(drawn.every((object) => object.depth > 2 && object.depth < playerDepth), "Counter art draws above counters and below players");
  assert.equal(drawn.filter((object) => object.kind === "image").length, layout.shelves.length);
  assert.ok(drawn.some((object) => object.kind === "text" && object.args[2] === "MENU"));

  expect("move");
  dismiss();
  pos = { x: 30, y: 0 };
  expect("menu");
  dismiss();
  menu = { open: true, view: "main" }; expect("menu");
  menu = { open: false, view: "main" }; expect("menu");
  menu = { open: true, view: "tutorial" }; expect("menu");
  menu = { open: false, ordersOpen: true }; expect("menu");
  menu = { open: false, ordersOpen: false }; expect("tomato");
  dismiss();
  command("take-ingredient", { shelfId: "missing", ...at(shelf("tomato")) });
  expect("tomato");
  command("take-ingredient", { shelfId: shelf("tomato").id, ...at(shelf("tomato")) });
  expect("chop"); dismiss();
  const cut = station("cutting-board");
  command("place-on-station", { stationId: cut.id, itemId: held().id, ...at(cut) });
  expect("chop");
  command("start-cutting", { stationId: cut.id, ...at(cut) });
  now += 3000; await net.controller.tick(() => {});
  expect("meat"); dismiss();
  command("take-ingredient", { shelfId: shelf("meat").id, ...at(shelf("meat")) });
  expect("grill"); dismiss();
  const grill = station("grill");
  command("place-on-station", { stationId: grill.id, itemId: held().id, ...at(grill) });
  expect("grill");
  now += 6000; await net.controller.tick(() => {});
  expect("plate");
  now += 10 * 24 * 60 * 60 * 1000;
  await net.controller.tick(() => {});
  assert.equal(room.roundStatus, "PLAYING");
  assert.equal(room.getStation(grill.id).item.status, "cooked");
  assert.equal(room.expiredPenalties, 0);
  assert.equal(room.orders.length, 1);
  dismiss();
  command("take-plate", at(station("plate-station")));
  expect("add-tomato"); dismiss();
  const plateId = held().id;
  command("add-to-held-plate", { plateId, sourceType: "station", sourceId: cut.id, ...at(cut) });
  expect("add-meat"); dismiss();
  command("add-to-held-plate", { plateId, sourceType: "station", sourceId: grill.id, ...at(grill) });
  expect("bread"); dismiss();
  command("add-to-held-plate", { plateId, sourceType: "shelf", sourceId: shelf("bread").id, ...at(shelf("bread")) });
  expect("serve"); dismiss();
  assert.equal(progress.snapshot().done, false);
  command("serve-order", { itemId: plateId, ...at(station("serving-counter")) });
  await Promise.resolve();
  assert.ok(completed, "Real controller must accept the hamburger");
  assert.equal(completed.points, 0);
  assert.equal(room.score, 0);
  assert.equal(progress.served("salad"), false);
  assert.equal(progress.served(completed.recipeId), true);
  assert.equal(progress.snapshot().done, true);
  normal.updateOrders();
  assert.ok(normal.expiredPenalties > 0, "Normal-round penalties still apply");

  // Test the actual guide's dismissal/menu boundary and cleanup.
  let latest, cleanup, actualMenu = false;
  const marker = { setDepth() { return this; }, clear() {}, lineStyle() {}, strokeCircle() {}, destroy() { this.destroyed = true; } };
  const guideScene = {
    add: { graphics: () => marker }, net,
    items: {}, players: [{ body: { x: 0, y: 0 } }],
    layout, controls: { menuOpen: false },
    closeOrders() { this.ordersEl = null; },
    events: { once: (_event, callback) => cleanup = callback },
  };
  const guide = createTutorialGuide(guideScene, (step) => latest = step, { getMenuState: () => ({ open: actualMenu }) });
  guide.showRecipe();
  assert.equal(latest.id, "move", "Recipe stays hidden before opening the kitchen menu");
  actualMenu = true;
  assert.equal(guide.continue(), false, "E in the actual menu cannot dismiss a hidden instruction");
  actualMenu = false;
  assert.equal(guide.continue(), true);
  assert.equal(latest.promptOpen, false);
  assert.equal(guide.continue(), false);
  guide.update(0);
  guideScene.players[0].body.x = 30;
  guide.update(1);
  assert.equal(latest.id, "menu");
  guide.continue();
  guideScene.ordersEl = {};
  guide.showRecipe();
  assert.equal(latest.id, "hamburger-recipe", "Opening MENU shows the illustrated hamburger instruction");
  assert.equal(latest.promptOpen, true);
  assert.equal(guide.continue(), true);
  assert.equal(guideScene.ordersEl, null, "Continuing the recipe closes the orders panel");
  guide.update(2);
  assert.equal(latest.id, "tomato", "Recipe continues to the first ingredient step");
  cleanup(); assert.equal(marker.destroyed, true);
  net.destroy(); assert.equal(timers, 0);
  const replay = new LocalTransport({ roomCode: "LOCAL", mapId: "kitchen", mapJson, tutorial: true });
  assert.equal(replay.controller.getRoom("LOCAL").items.length, 0);
  assert.equal(new TutorialProgress().snapshot().promptOpen, true);
  replay.destroy();
  console.log("Passed: reachable menu board and real orders, shelf/player depth, 11 tutorial steps, E dismissal, serving, no time/burn/score/penalties, replay and cleanup.");
} finally {
  net.destroy(); ordinary.destroy(); Date.now = realNow; delete globalThis.window;
}
