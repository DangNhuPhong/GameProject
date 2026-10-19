import Station from "./Station.js";

const normalize = (list) =>
  (list || []).map((i) =>
    typeof i === "string"
      ? { type: i, status: "raw" }
      : { type: i.type ?? i.ingredientType, status: i.status ?? "raw" },
  );

// Đĩa có đúng bột + cà chua đã thái
export function isPizzaPlate(plate) {
  if (!plate || plate.type !== "plate") return false;

  const ing = normalize(plate.ingredients);

  return (
    ing.length === 2 &&
    ing.some((i) => i.type === "dough") &&
    ing.some((i) => i.type === "tomato" && i.status === "chopped")
  );
}

class PizzaOvenStation extends Station {
  constructor({
    id,
    x = 0,
    y = 0,
    bakeTime = 8000,
    burnTime = 10000,
    range = 50,
  }) {
    super({ id, type: "oven", x, y, range });

    this.bakeTime = bakeTime;
    this.burnTime = burnTime;
    this.progressMs = 0;
    this.lastTick = null;
  }

  canAccept(item) {
    return super.canAccept(item) && isPizzaPlate(item);
  }

  // Đặt đĩa vào là tự nướng (tiếp tục từ trạng thái hiện tại của đĩa)
  onItemPlaced() {
    const s = this.item?.bakeStatus ?? "raw";

    this.progressMs =
      s === "burnt"
        ? this.bakeTime + this.burnTime
        : s === "cooked"
          ? this.bakeTime
          : 0;
    this.lastTick = Date.now();
  }

  onItemTaken() {
    this.progressMs = 0;
    this.lastTick = null;
  }

  // Trả về true khi trạng thái đĩa đổi (raw -> cooked -> burnt)
  update(now = Date.now()) {
    if (!this.item || this.lastTick === null) return false;

    this.progressMs += now - this.lastTick;
    this.lastTick = now;

    const status =
      this.progressMs >= this.bakeTime + this.burnTime
        ? "burnt"
        : this.progressMs >= this.bakeTime
          ? "cooked"
          : "raw";

    if (status !== this.item.bakeStatus) {
      this.item.bakeStatus = status;
      return true;
    }

    return false;
  }

  getState() {
    let elapsedMs = this.progressMs;

    if (this.item && this.lastTick !== null) {
      elapsedMs += Date.now() - this.lastTick;
    }

    return {
      ...super.getState(),
      cookTime: this.bakeTime,
      burnTime: this.burnTime,
      elapsedMs,
      cutState: null,
    };
  }
}

export default PizzaOvenStation;
