import GameController from "./core/GameController";
import { readLayout } from "./core/readLayout";

// =====================================================================
// LOCAL TRANSPORT
//
// Có cùng "giao diện" với socket.io-client (on / off / emit / volatile.emit /
// connected / connect / disconnect), nhưng KHÔNG đi qua mạng: lệnh được
// GameController xử lý ngay trong trình duyệt, rồi kết quả được trả về qua
// đúng các event mà server vẫn gửi (item-picked, station-updated, ...).
//
// Nhờ vậy KitchenScene dùng chung một đường code cho:
//   - Single / Co-op cùng máy -> LocalTransport (offline, 0ms)
//   - Co-op online            -> socket (server cũng chạy GameController)
// =====================================================================

const TICK_MS = 200;

// Server gửi dữ liệu qua JSON nên client luôn nhận bản sao.
// Ở local phải sao chép tương tự, nếu không scene sẽ giữ tham chiếu
// vào object nội bộ của game và vô tình sửa được chúng.
const clone = (data) =>
  data === undefined ? undefined : JSON.parse(JSON.stringify(data));

export default class LocalTransport {
  /**
   * @param {object} opts
   * @param {string} opts.roomCode  mã phòng nội bộ (vd "LOCAL")
   * @param {string} opts.mapId
   * @param {object} opts.mapJson   nội dung file Tiled JSON của map
   */
  constructor({ roomCode, mapId, mapJson }) {
    this.roomCode = roomCode;
    this.connected = true;
    this.listeners = new Map();
    this.destroyed = false;
    this.timer = null;

    const layout = { id: mapId, ...readLayout(mapJson) };

    this.controller = new GameController({ getLayout: () => layout });

    // Giống socket.volatile.emit
    this.volatile = { emit: (event, data) => this.emit(event, data) };

    // Ở local chỉ có một "người nghe", nên mọi kênh gửi đều đổ về cùng chỗ
    this.ctx = {
      toRoom: (_roomCode, event, data) => this.dispatch(event, data),
      toSender: (event, data) => this.dispatch(event, data),
      // Không có người chơi từ xa -> không cần phát vị trí / join cho ai
      toOthers: () => {},
      toOthersVolatile: () => {},
    };
  }

  // ---------------------------------
  // GIAO DIỆN GIỐNG SOCKET
  // ---------------------------------

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return this;
  }

  off(event, handler) {
    if (!event) {
      this.listeners.clear();
      return this;
    }

    if (!handler) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(handler);

    return this;
  }

  connect() {
    this.connected = true;
    return this;
  }

  disconnect() {
    this.destroy();
    return this;
  }

  emit(event, payload) {
    if (this.destroyed) return this;

    try {
      if (event === "join-room") {
        this.controller.join(payload || {}, this.ctx);
        this.startTick();
      } else if (this.controller.has(event)) {
        this.controller.handle(event, payload || {}, this.ctx);
      }
      // Các event lobby (player-ready, game-started...) không dùng ở local
    } catch (err) {
      console.error(`Local error in "${event}":`, err);
      this.dispatch("interaction-error", {
        message: `Game error in ${event}`,
      });
    }

    return this;
  }

  // ---------------------------------
  // NỘI BỘ
  // ---------------------------------

  // Gửi event cho scene ở microtask kế tiếp (giống socket: luôn bất đồng bộ),
  // tránh việc handler chạy xen giữa lúc scene đang xử lý input.
  dispatch(event, data) {
    const payload = clone(data);

    queueMicrotask(() => {
      if (this.destroyed) return;

      this.listeners.get(event)?.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Handler error for "${event}":`, err);
        }
      });
    });
  }

  startTick() {
    if (this.timer) return;

    this.timer = window.setInterval(() => {
      try {
        this.controller.tick((_roomCode, event, data) =>
          this.dispatch(event, data),
        );
      } catch (err) {
        console.error("Local tick error:", err);
      }
    }, TICK_MS);
  }

  destroy() {
    this.destroyed = true;
    this.connected = false;

    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }

    this.listeners.clear();
  }
}
