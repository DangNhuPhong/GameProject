// state:  "available" (dưới đất) | "held" (đang cầm) | "on-station" (trên trạm)
// status: "raw" | "cooked" | "burnt"

class Item {
  constructor({ id, type, x = 0, y = 0 }) {
    this.id = id;
    this.type = type;

    this.state = "available";
    this.status = "raw";

    this.x = x;
    this.y = y;

    this.userId = null;
    this.stationId = null;
  }

  pick(userId) {
    if (this.state !== "available") {
      return false;
    }

    this.state = "held";
    this.userId = userId;

    return true;
  }

  drop(userId, x, y) {
    if (this.state !== "held" || this.userId !== userId) {
      return false;
    }

    this.state = "available";
    this.userId = null;

    this.x = x;
    this.y = y;

    return true;
  }

  // Đặt item đang cầm lên trạm
  placeOnStation(stationId, x, y) {
    if (this.state !== "held") {
      return false;
    }

    this.state = "on-station";
    this.stationId = stationId;
    this.userId = null;

    this.x = x;
    this.y = y;

    return true;
  }

  // Lấy item từ trạm vào tay người chơi
  takeFromStation(userId) {
    if (this.state !== "on-station") {
      return false;
    }

    this.state = "held";
    this.userId = userId;
    this.stationId = null;

    return true;
  }

  // Dữ liệu gửi cho client
  serialize() {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      status: this.status,
      x: this.x,
      y: this.y,
      userId: this.userId,
      stationId: this.stationId,
    };
  }
}

export default Item;
