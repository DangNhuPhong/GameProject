import kitchen from "./kitchen/config";
import classroom from "./classroom/config";
import farm from "./farm/config";
import sports from "./sports/config";
import computerRoom from "./computer-room/config";
import library from "./library/config";

export const MAPS = {
  kitchen,
  classroom,
  farm,
  sports,
  "computer-room": computerRoom,
  library,
};

import library from "./library/config";
export const getMapConfig = (id) => MAPS[id] ?? MAPS.kitchen;
