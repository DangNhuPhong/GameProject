import kitchen from "./kitchen/config";
import bistro from "./bistro/config";
import farm from "./farm/config";

export const MAPS = { kitchen, bistro, farm };
export const getMapConfig = (id) => MAPS[id] ?? MAPS.kitchen;
