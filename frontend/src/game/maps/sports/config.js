import collisionUrl from "./collision-tiles.png";
import bgUrl from "./sports-bg.png";
import localMapUrl from "./sports.json?url";

export default {
  id: "sports",
  mapUrl: `${import.meta.env.VITE_API_URL}/api/maps/sports`,
  localMapUrl,
  tilesets: { "collision-tiles": collisionUrl },
  image: { url: bgUrl, width: 344, height: 192 },
  background: "#786450",
  zoomNear: 160,
};
