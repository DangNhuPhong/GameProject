import kitchen from "./kitchen/config";
import bistro from "./bistro/config";

export const MAPS = { kitchen, bistro };
export const getMapConfig = (id) => MAPS[id] ?? MAPS.kitchen;
