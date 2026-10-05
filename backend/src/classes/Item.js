class Item {
  constructor({ id, type, x = 0, y = 0 }) {
    this.id = id;
    this.type = type;

    this.state = "available";

    this.x = x;
    this.y = y;

    this.userId = null;
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
}

export default Item;
