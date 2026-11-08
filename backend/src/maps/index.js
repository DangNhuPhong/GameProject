import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { readLayout } from "./readLayout.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Thêm map mới: thêm một dòng vào đây
const MAP_FILES = {
  kitchen: "kitchen.json",
  bistro: "bistro.json",
  farm: "farm.json",
  sports: "sports.json",
};

const cache = {};

export function getMapLayout(mapId) {
  const id = MAP_FILES[mapId] ? mapId : "kitchen";

  if (!cache[id]) {
    const raw = fs.readFileSync(path.join(dir, MAP_FILES[id]), "utf8");
    cache[id] = { id, ...readLayout(JSON.parse(raw)) };
  }

  return cache[id];
}

export function getMapFilePath(mapId) {
  return MAP_FILES[mapId] ? path.join(dir, MAP_FILES[mapId]) : null;
}
