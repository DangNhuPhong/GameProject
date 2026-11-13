import collisionUrl from "./collision-tiles.png";
import bgUrl from "./farm-bg-v2.png";
import localMapUrl from "./farm.json?url";

// Online: lấy map từ server
const mapUrl = `${import.meta.env.VITE_API_URL}/api/maps/farm`;

export default {
  id: "farm",
  mapUrl,

  // Offline (Single / Co-op cùng máy)
  localMapUrl,

  // Tileset dùng cho lớp collision ẩn
  // Tên phải trùng với tileset trong farm.json
  tilesets: {
    "collision-tiles": collisionUrl,
  },

  // Background map
  image: {
    url: bgUrl,
    width: 344,
    height: 192,
  },

  background: "#6b5945",
  zoomNear: 160,
};
