import Station from "./Station.js";

// =====================================
// CUTTING STATION
//
// raw tomato --(E: thái)--> chopped tomato
//
// cutState:
//   idle    : có item nhưng chưa bắt đầu thái
//   cutting : đang thái
//   paused  : người thái rời khu vực -> giữ nguyên tiến độ,
//             quay lại bấm E để thái tiếp
//   done    : thái xong (item.status = "chopped")
// =====================================

class CuttingStation extends Station {
  constructor({
    id,
    x = 0,
    y = 0,
    cutTime = 2000,
    acceptedTypes = ["tomato"],
    range = 50, // khớp INTERACT_RANGE của client
  }) {
    super({
      id,
      type: "cutting",
      x,
      y,
      range,
    });

    this.cutTime = cutTime;
    this.acceptedTypes = acceptedTypes;

    this.cutState = "idle";
    this.progressMs = 0; // số ms đã thái được
    this.lastTick = null; // mốc thời gian của lần tính trước
    this.cuttingUserId = null; // người đang thái
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
  // ITEM PLACED / TAKEN
  // =====================================

  onItemPlaced() {
    this.resetCutting();
  }

  onItemTaken() {
    this.resetCutting();
  }

  resetCutting() {
    this.cutState = "idle";
    this.progressMs = 0;
    this.lastTick = null;
    this.cuttingUserId = null;
  }

  // =====================================
  // START / RESUME (người chơi bấm E)
  // =====================================

  startCutting(userId, playerX, playerY) {
    if (!this.item || this.item.status !== "raw") {
      return false;
    }

    // Phải đứng trong khu vực thái
    if (!this.canUse(playerX, playerY)) {
      return false;
    }

    // Chỉ bắt đầu được khi chưa thái hoặc đang tạm dừng
    if (this.cutState !== "idle" && this.cutState !== "paused") {
      return false;
    }

    this.cutState = "cutting";
    this.cuttingUserId = userId;
    this.lastTick = Date.now();

    return true;
  }

  // =====================================
  // UPDATE
  //
  // getPlayerPosition(userId) -> { x, y } | null
  // Trả về true khi trạng thái đổi (paused / done)
  // =====================================

  update(now = Date.now(), getPlayerPosition = null) {
    if (this.cutState !== "cutting" || !this.item) {
      return false;
    }

    // Người thái rời khỏi khu vực (hoặc đã thoát game) -> tạm dừng
    if (getPlayerPosition) {
      const pos = getPlayerPosition(this.cuttingUserId);

      // +8: dung sai vì vị trí client gửi lên bị làm tròn / trễ
      if (!pos || !this.canUse(pos.x, pos.y, this.range + 8)) {
        // Cộng nốt phần thời gian đã thái trước khi rời đi
        this.progressMs = Math.min(
          this.cutTime,
          this.progressMs + (now - this.lastTick),
        );

        this.cutState = "paused";
        this.lastTick = null;
        this.cuttingUserId = null;

        return true;
      }
    }

    // Cộng dồn tiến độ
    this.progressMs += now - this.lastTick;
    this.lastTick = now;

    if (this.progressMs >= this.cutTime) {
      this.progressMs = this.cutTime;
      this.item.status = "chopped";

      this.cutState = "done";
      this.lastTick = null;
      this.cuttingUserId = null;

      return true;
    }

    return false;
  }

  // =====================================
  // STATE
  // =====================================

  getState() {
    // Tiến độ "live" để client vẽ thanh tiến độ
    let elapsedMs = this.progressMs;

    if (this.cutState === "cutting" && this.lastTick !== null) {
      elapsedMs = Math.min(
        this.cutTime,
        this.progressMs + (Date.now() - this.lastTick),
      );
    }

    return {
      ...super.getState(),

      cutTime: this.cutTime,
      cutState: this.cutState,
      cuttingUserId: this.cuttingUserId,
      elapsedMs,
    };
  }
}

export default CuttingStation;
