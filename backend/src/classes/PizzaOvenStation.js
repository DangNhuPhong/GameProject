import Station from "./Station.js";

class PizzaOvenStation extends Station {
  constructor({
    id = "pizza-oven",
    x = 0,
    y = 0,
    range = 90,
    cookingTime = 10000,
  }) {
    super({
      id,
      type: "pizza-oven",
      x,
      y,
      range,
    });

    this.cookingTime = cookingTime;
    this.cookingStartedAt = null;
    this.status = "EMPTY";
  }

  // Chỉ nhận đĩa có đủ nguyên liệu pizza
  canAccept(plate) {
    if (!plate || this.item || this.status !== "EMPTY") {
      return false;
    }

    // Plate phải có mảng ingredients
    if (!Array.isArray(plate.ingredients)) {
      return false;
    }

    const ingredientTypes = plate.ingredients.map((ingredient) =>
      String(ingredient.type || "").toLowerCase(),
    );

    const hasDough =
      ingredientTypes.includes("dough") || ingredientTypes.includes("flour");

    const hasTomato =
      ingredientTypes.includes("tomato") ||
      ingredientTypes.includes("chopped-tomato");

    const hasSalad = ingredientTypes.includes("salad");

    return hasDough && hasTomato && hasSalad;
  }

  // Đặt cả đĩa lên lò, không đặt từng nguyên liệu riêng
  placeItem(plate) {
    if (!this.canAccept(plate)) {
      return false;
    }

    this.item = plate;

    // Đưa đĩa về vị trí lò
    plate.x = this.x;
    plate.y = this.y;

    // Bắt đầu nướng
    this.status = "COOKING";
    this.cookingStartedAt = Date.now();

    this.onItemPlaced(plate);

    return true;
  }

  // Cập nhật trạng thái nướng
  update() {
    if (this.status !== "COOKING" || !this.item) {
      return false;
    }

    const elapsed = Date.now() - this.cookingStartedAt;

    if (elapsed < this.cookingTime) {
      return false;
    }

    this.status = "READY";
    this.cookingStartedAt = null;

    // Đánh dấu đĩa đã nướng xong
    this.item.status = "baked";

    this.onCookingFinished(this.item);

    return true;
  }

  // Chỉ lấy đĩa ra sau khi nướng xong
  takeItem(userId) {
    if (!this.item || this.status !== "READY") {
      return null;
    }

    const plate = this.item;

    this.item = null;
    this.status = "EMPTY";

    // Chuyển quyền giữ đĩa cho người chơi
    plate.userId = userId;

    this.onItemTaken(plate);

    return plate;
  }

  getProgress() {
    if (this.status !== "COOKING" || !this.cookingStartedAt) {
      return this.status === "READY" ? 100 : 0;
    }

    const elapsed = Date.now() - this.cookingStartedAt;

    return Math.min(100, Math.floor((elapsed / this.cookingTime) * 100));
  }

  getState() {
    return {
      ...super.getState(),
      status: this.status,
      progress: this.getProgress(),
      cookingTime: this.cookingTime,
      itemId: this.item ? this.item.id : null,
    };
  }

  onCookingFinished(plate) {
    // GameRoom có thể dùng hook này để phát sự kiện
    // pizza-ready cho client.
  }
}

export default PizzaOvenStation;
