import collisionUrl from "./collision-tiles.png";
import bgUrl from "./library-bg.png";
import localMapUrl from "./library.json?url";

export default {
  id: "library",
  mapUrl: `${import.meta.env.VITE_API_URL}/api/maps/library`,
  localMapUrl,
  tilesets: { "collision-tiles": collisionUrl },
  image: { url: bgUrl, width: 344, height: 192 },
  background: "#343b50",
  zoomNear: 160,
};
