import kitchen from "./kitchen/config";
import bistro from "./bistro/config";
import farm from "./farm/config";
import sports from "./sports/config";

export const MAPS = { kitchen, bistro, farm, sports };
export const getMapConfig = (id) => MAPS[id] ?? MAPS.kitchen;
