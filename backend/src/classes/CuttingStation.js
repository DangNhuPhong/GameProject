import Station from "./Station.js";

// =====================================
// CUTTING STATION
//
// raw tomato --(cutTime)--> chopped tomato
// =====================================

class CuttingStation extends Station {
  constructor({
    id,
    x = 0,
    y = 0,
    cutTime = 2000,
    acceptedTypes = ["tomato"],
  }) {
    super({
      id,
      type: "cutting",
      x,
      y,
    });

    this.cutTime = cutTime;
    this.acceptedTypes = acceptedTypes;

    this.startedAt = null;
  }

  // =====================================
  // CHECK ITEM
  // =====================================

  canAccept(item) {
    return (
      super.canAccept(item) &&
      this.acceptedTypes.includes(item.type) &&
      item.status === "raw"
    );
  }

  // =====================================
  // ITEM PLACED
  // =====================================

  onItemPlaced() {
    this.startedAt = Date.now();
  }

  // =====================================
  // ITEM TAKEN
  // =====================================

  onItemTaken() {
    this.startedAt = null;
  }

  // =====================================
  // UPDATE
  // =====================================

  update(now = Date.now()) {
    if (!this.item || this.startedAt === null) {
      return false;
    }

    const elapsed = now - this.startedAt;

    if (this.item.status === "raw" && elapsed >= this.cutTime) {
      this.item.status = "chopped";

      return true;
    }

    return false;
  }

  // =====================================
  // STATE
  // =====================================

  getState() {
    return {
      ...super.getState(),

      cutTime: this.cutTime,

      elapsedMs: this.startedAt === null ? 0 : Date.now() - this.startedAt,
    };
  }
}

export default CuttingStation;
