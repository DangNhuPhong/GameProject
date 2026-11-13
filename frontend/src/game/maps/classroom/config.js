import collisionUrl from "./collision-tiles.png";
import bgUrl from "./classroom-bg-v2.png";
import localMapUrl from "./classroom.json?url";

// Online: lấy map từ server (để server và client luôn dùng cùng một file map)
const mapUrl = `${import.meta.env.VITE_API_URL}/api/maps/classroom`;

export default {
  id: "classroom",
  mapUrl,
  // Offline (Single / Co-op cùng máy): dùng file map đóng gói sẵn, không cần server
  localMapUrl,
  // tileset chỉ dùng cho lớp va chạm ẩn (tên phải trùng "name" trong classroom.json)
  tilesets: { "collision-tiles": collisionUrl },
  // ảnh nền vẽ nguyên bản, kích thước theo đơn vị thế giới
  image: { url: bgUrl, width: 344, height: 192 },
  background: "#12302e",
  zoomNear: 160,
};
