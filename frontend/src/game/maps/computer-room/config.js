import collisionUrl from "./collision-tiles.png";
import bgUrl from "./computer-room-bg.png";
import localMapUrl from "./computer-room.json?url";

export default {
  id: "computer-room",
  mapUrl: `${import.meta.env.VITE_API_URL}/api/maps/computer-room`,
  localMapUrl,
  tilesets: { "collision-tiles": collisionUrl },
  image: { url: bgUrl, width: 344, height: 192 },
  background: "#343b50",
  zoomNear: 160,
};
