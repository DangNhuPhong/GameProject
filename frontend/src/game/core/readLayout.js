function toProps(list) {
  const props = {};
  (list || []).forEach((p) => {
    props[p.name] = p.value;
  });
  return props;
}

// Đọc layer "objects" của file Tiled JSON thô
export function readLayout(mapJson, objectLayerName = "objects") {
  const layer = (mapJson.layers || []).find(
    (l) => l.type === "objectgroup" && l.name === objectLayerName,
  );

  const layout = { shelves: [], stations: [], spawn: { x: 0, y: 0 } };

  (layer?.objects || []).forEach((o) => {
    if (o.type === "spawn") {
      layout.spawn = { x: o.x, y: o.y };
      return;
    }

    const props = toProps(o.properties);
    const id = props.id;

    if (!id) return;

    const x = props.centerX ?? o.x + o.width / 2;
    const y = props.centerY ?? o.y + o.height / 2;

    if (o.type === "shelf") {
      layout.shelves.push({
        id,
        x,
        y,
        ingredient: props.ingredient ?? id.replace("-shelf", ""),
      });
    } else if (o.type === "station") {
      layout.stations.push({ id, x, y, kind: props.kind ?? id, props });
    }
  });

  return layout;
}
