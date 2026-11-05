import Station from "./Station.js";

// =====================================
// COOKING STATION (Grill)
//
// raw --(cookTime)--> cooked --(burnTime)--> burnt
//
// cookTime / burnTime tính bằng mili-giây, kể từ lúc đặt thịt lên.
// Ví dụ mặc định: 5 giây chín, 10 giây cháy.
// =====================================

class CookingStation extends Station {
  constructor({
    id,
    x = 0,
    y = 0,
    cookTime = 5000,
    burnTime = 10000,
    acceptedTypes = ["meat"],
  }) {
    super({ id, type: "cooking", x, y });

    this.cookTime = cookTime;
    this.burnTime = burnTime;
    this.acceptedTypes = acceptedTypes;

    this.startedAt = null;
  }

  // Chỉ nhận nguyên liệu sống thuộc loại cho phép
  canAccept(item) {
    return (
      super.canAccept(item) &&
      this.acceptedTypes.includes(item.type) &&
      item.status === "raw"
    );
  }

  onItemPlaced() {
    this.startedAt = Date.now();
  }

  onItemTaken() {
    this.startedAt = null;
  }

  // Trả về true nếu item vừa đổi trạng thái
  update(now = Date.now()) {
    if (!this.item || this.startedAt === null) {
      return false;
    }

    const elapsed = now - this.startedAt;

    if (this.item.status === "raw" && elapsed >= this.cookTime) {
      this.item.status = "cooked";

      return true;
    }

    if (this.item.status === "cooked" && elapsed >= this.burnTime) {
      this.item.status = "burnt";

      return true;
    }

    return false;
  }

  getState() {
    return {
      ...super.getState(),

      cookTime: this.cookTime,
      burnTime: this.burnTime,

      // Thời gian đã nướng, client tự cộng thêm thời gian trôi qua
      // kể từ lúc nhận để vẽ thanh tiến độ mượt.
      elapsedMs: this.startedAt === null ? 0 : Date.now() - this.startedAt,
    };
  }
}

export default CookingStation;
