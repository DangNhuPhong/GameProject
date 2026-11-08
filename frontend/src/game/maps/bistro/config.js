import collisionUrl from "./collision-tiles.png";
import bgUrl from "./classroom-bg.png";
import localMapUrl from "./bistro.json?url";

// Online: lấy map từ server (để server và client luôn dùng cùng một file map)
const mapUrl = `${import.meta.env.VITE_API_URL}/api/maps/bistro`;

export default {
  id: "bistro",
  mapUrl,
  // Offline (Single / Co-op cùng máy): dùng file map đóng gói sẵn, không cần server
  localMapUrl,
  // tileset chỉ dùng cho lớp va chạm ẩn (tên phải trùng "name" trong bistro.json)
  tilesets: { "collision-tiles": collisionUrl },
  // ảnh nền vẽ nguyên bản, kích thước theo đơn vị thế giới
  image: { url: bgUrl, width: 344, height: 192 },
  background: "#12302e",
  zoomNear: 160,
};
