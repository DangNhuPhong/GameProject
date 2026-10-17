// =====================================
// STATION (class cha)
//
// Mọi trạm làm việc (Grill, thớt thái, bồn rửa...)
// đều kế thừa class này. Class cha lo phần chung:
// vị trí, kiểm tra khoảng cách, đặt / lấy item.
// Class con chỉ override phần logic riêng.
// =====================================

class Station {
  constructor({ id, type, x = 0, y = 0, range = 30 }) {
    this.id = id;
    this.type = type;

    this.x = x;
    this.y = y;

    // Khoảng cách tối đa để người chơi dùng được trạm
    this.range = range;

    // Item đang nằm trên trạm (tối đa 1)
    this.item = null;
  }

  // ---------------------------------
  // KHOẢNG CÁCH
  // ---------------------------------

  canUse(playerX, playerY, range = this.range) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;

    return Math.sqrt(dx * dx + dy * dy) <= range;
  }

  // ---------------------------------
  // ĐẶT / LẤY ITEM
  // ---------------------------------

  hasItem() {
    return this.item !== null;
  }

  // Class con override để giới hạn loại item được nhận
  canAccept(item) {
    return Boolean(item) && !this.item;
  }

  placeItem(item) {
    if (!this.canAccept(item)) {
      return false;
    }

    if (!item.placeOnStation(this.id, this.x, this.y)) {
      return false;
    }

    this.item = item;

    this.onItemPlaced(item);

    return true;
  }

  takeItem(userId) {
    if (!this.item) {
      return null;
    }

    const item = this.item;

    if (!item.takeFromStation(userId)) {
      return null;
    }

    this.item = null;

    this.onItemTaken(item);

    return item;
  }

  // ---------------------------------
  // HOOK CHO CLASS CON
  // ---------------------------------

  onItemPlaced() {}

  onItemTaken() {}

  // Được GameRoom gọi định kỳ.
  // Trả về true nếu trạng thái trạm / item vừa thay đổi
  // (để server phát "station-updated" cho client).
  update() {
    return false;
  }

  // ---------------------------------
  // STATE GỬI CHO CLIENT
  // ---------------------------------

  getState() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      itemId: this.item ? this.item.id : null,
    };
  }
}

export default Station;
