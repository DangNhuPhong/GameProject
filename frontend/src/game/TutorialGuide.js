export const TUTORIAL_STEPS = [
  { id: "move", title: "Meet your kitchen", text: "Use the movement keys shown above to walk around. On touch controls, drag the joystick. Walk a short distance to begin.", tip: "Follow the golden glow to find your next station." },
  { id: "menu", title: "Check the menu", text: "Walk up to the glowing MENU board in the bottom-right corner, beside the serving counter. Open it to see your order and the hamburger recipe, then close it to continue.", tip: "Press E to open the menu. Press E or Esc to close it." },
  { id: "tomato", title: "Pick a fresh tomato", text: "Walk up to the glowing tomato shelf. With empty hands, interact to pick up one tomato.", tip: "Stand close to a shelf or station before interacting." },
  { id: "chop", title: "Time to chop", text: "Place the tomato on the glowing cutting board, then interact again to start chopping. Stay nearby until it is ready. Leave the chopped tomato on the board.", tip: "Press E twice: once to place, then once to chop." },
  { id: "meat", title: "Pick up the meat", text: "Leave the chopped tomato on the board. With empty hands, walk up to the meat shelf and pick up a piece of meat.", tip: "Hands full? Press Q to drop your item in a clear spot." },
  { id: "grill", title: "Fire up the grill", text: "Place the meat on the glowing grill and wait until it is cooked. Leave it on the grill while you collect a plate.", tip: "Take your time: food cannot burn during this tutorial." },
  { id: "plate", title: "Grab a plate", text: "With empty hands, walk up to the glowing stack of plates and pick one up. You will use it to assemble your hamburger.", tip: "Press Q to put down an item if your hands are full." },
  { id: "add-tomato", title: "Add the chopped tomato", text: "Carry your plate to the chopped tomato and interact to add it. You can collect it straight from the cutting board or from the floor.", tip: "Keep holding your plate as you collect each ingredient." },
  { id: "add-meat", title: "Add the cooked meat", text: "Carry the plate with your tomato to the cooked meat and interact to add it. If you are holding the meat instead, interact with your plate on the floor.", tip: "Your plate now needs chopped tomato and cooked meat." },
  { id: "bread", title: "Build your hamburger", text: "Carry the plate with tomato and cooked meat to the bread shelf. Interact to add bread and complete your hamburger.", tip: "The recipe: bread + cooked meat + chopped tomato." },
  { id: "serve", title: "Order up!", text: "Carry your finished hamburger to the glowing serving counter and interact to serve your first order.", tip: "A complete recipe on a plate is ready to serve." },
];

const hasIngredient = (plate, type, status) => plate.type === "plate" &&
  plate.ingredients?.some((i) => i.type === type && (!status || i.status === status));

// Observe successful game state, never key presses: failed actions cannot advance a step.
export class TutorialProgress {
  constructor() {
    this.index = 0;
    this.origin = null;
    this.done = false;
    this.promptOpen = true;
    this.sawOrders = false;
    this.recipeOpen = false;
  }

  snapshot() {
    const step = this.recipeOpen ? {
      id: "hamburger-recipe", title: "Hamburger recipe",
      text: "Chop a tomato at the cutting board and cook meat on the grill. Collect a plate, add the chopped tomato, cooked meat and bread, then carry your hamburger to the serving counter.",
      tip: "Bread + cooked meat + chopped tomato, all on one plate.",
    } : TUTORIAL_STEPS[this.index];
    return { ...step, index: this.index, total: TUTORIAL_STEPS.length, done: this.done, promptOpen: this.promptOpen };
  }

  openRecipe() {
    if (this.done || TUTORIAL_STEPS[this.index].id !== "menu" || this.promptOpen) return false;
    this.sawOrders = true;
    this.recipeOpen = true;
    this.promptOpen = true;
    return true;
  }

  continue() {
    if (this.done || !this.promptOpen) return false;
    this.promptOpen = false;
    this.recipeOpen = false;
    return true;
  }

  update(items, position, menu = {}) {
    if (this.done || this.promptOpen || !position) return false;
    if (TUTORIAL_STEPS[this.index].id === "menu" && menu.ordersOpen) this.sawOrders = true;
    this.origin ??= { x: position.x, y: position.y };
    const has = (type, status) => items.some((i) =>
      (i.type === type && (!status || i.status === status)) || hasIngredient(i, type, status));
    const onPlate = (type, status) => items.some((i) => hasIngredient(i, type, status));
    const checks = [
      () => Math.hypot(position.x - this.origin.x, position.y - this.origin.y) >= 28,
      () => this.sawOrders && !menu.ordersOpen,
      () => has("tomato"),
      () => has("tomato", "chopped"),
      () => has("meat"),
      () => has("meat", "cooked"),
      () => items.some((i) => i.type === "plate"),
      () => onPlate("tomato", "chopped"),
      () => items.some((i) => hasIngredient(i, "tomato", "chopped") && hasIngredient(i, "meat", "cooked")),
      () => items.some((i) => i.ingredients?.length === 3 && hasIngredient(i, "tomato", "chopped") && hasIngredient(i, "meat", "cooked") && hasIngredient(i, "bread")),
      () => false,
    ];
    const before = this.index;
    if (this.index < checks.length - 1 && checks[this.index]()) {
      this.index++;
      this.promptOpen = true;
    }
    return this.index !== before;
  }

  served(recipeId) {
    if (recipeId !== "hamburger" || this.done) return false;
    this.index = TUTORIAL_STEPS.length - 1;
    this.done = true;
    this.promptOpen = false;
    return true;
  }
}

export function createTutorialGuide(scene, onStep, ui) {
  const progress = new TutorialProgress();
  const marker = scene.add.graphics().setDepth(10000);
  const publish = () => onStep?.(progress.snapshot());
  const onServed = ({ order }) => {
    if (progress.served(order?.recipeId)) publish();
  };
  scene.net.on("order-completed", onServed);
  scene.events.once("shutdown", () => {
    scene.net.off("order-completed", onServed);
    marker.destroy();
  });
  publish();

  return {
    showRecipe() {
      if (progress.openRecipe()) publish();
    },
    continue() {
      const wasRecipe = progress.recipeOpen;
      if (ui?.getMenuState?.().open || !progress.continue()) return false;
      if (wasRecipe) scene.closeOrders();
      publish();
      return true;
    },
    update(time) {
      const items = Object.values(scene.items);
      if (progress.update(items, scene.players[0]?.body, {
        ...ui?.getMenuState?.(), ordersOpen: !!scene.ordersEl,
      })) publish();
      marker.clear();
      if (progress.done || progress.promptOpen || scene.controls.menuOpen) return;
      const id = progress.snapshot().id;
      const shelf = (type) => scene.layout.shelves.filter((s) => s.type === type);
      const station = (kind) => scene.layout.stations.filter((s) => s.kind === kind);
      const prepared = (type, status, kind) => {
        const found = items.filter((i) => i.type === type && i.status === status && i.state !== "held");
        return found.length ? found : station(kind);
      };
      const targets = {
        menu: () => station("order-station"),
        tomato: () => shelf("tomato"), chop: () => station("cutting-board"),
        meat: () => shelf("meat"), grill: () => station("grill"),
        plate: () => station("plate-station"),
        "add-tomato": () => prepared("tomato", "chopped", "cutting-board"),
        "add-meat": () => prepared("meat", "cooked", "grill"),
        bread: () => shelf("bread"), serve: () => station("serving-counter"),
      };
      marker.lineStyle(2, 0xffdf70, 0.65 + Math.sin(time / 220) * 0.3);
      for (const target of targets[id]?.() || []) {
        marker.strokeCircle(target.x, target.y, 13 + Math.sin(time / 220) * 2);
      }
    },
  };
}
