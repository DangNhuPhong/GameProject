import mapUrl from "./kitchen.json?url";
import tilesUrl from "./kitchen-tiles.png";

export default {
  id: "kitchen",
  mapUrl,
  // Map kitchen đã đóng gói sẵn nên online và offline dùng cùng một file
  localMapUrl: mapUrl,
  tilesets: { "kitchen-tiles": tilesUrl },
  background: "#12302e",
  zoomNear: 160,
  blockHeights: { 12: 10, 13: 10, 15: 10 },
};
