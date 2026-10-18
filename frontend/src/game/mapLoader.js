// Tiled có thể trả properties dpreload()ạng mảng hoặc object, hàm này xử lý cả hai
export function getProp(props, name) {
  if (!props) return undefined;
  if (Array.isArray(props)) return props.find((p) => p.name === name)?.value;
  return props[name];
}

export function readLayout(map, objectLayerName = "objects") {
  const layer = map.getObjectLayer(objectLayerName);
  const layout = { shelves: [], stations: [], spawn: { x: 0, y: 0 } };

  (layer?.objects ?? []).forEach((o) => {
    if (o.type === "spawn") {
      layout.spawn = { x: o.x, y: o.y };
      return;
    }

    const id = getProp(o.properties, "id");
    const x = getProp(o.properties, "centerX") ?? o.x + o.width / 2;
    const y = getProp(o.properties, "centerY") ?? o.y + o.height / 2;

    if (o.type === "shelf") {
      layout.shelves.push({
        id,
        x,
        y,
        name: o.name,
        type: getProp(o.properties, "ingredient") ?? id.replace("-shelf", ""),
      });
    } else if (o.type === "station") {
      layout.stations.push({
        id,
        x,
        y,
        kind: getProp(o.properties, "kind") ?? id,
      });
    }
  });

  return layout;
}
