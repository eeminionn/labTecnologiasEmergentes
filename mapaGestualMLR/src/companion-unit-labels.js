function clipRing(ring, axis, boundary, sign) {
  if (!ring.length) return ring;
  const other = axis === 'x' ? 'y' : 'x';
  const clipped = [];
  let previous = ring.at(-1);
  let wasInside = sign * (previous[axis] - boundary) >= 0;
  for (const point of ring) {
    const inside = sign * (point[axis] - boundary) >= 0;
    if (inside !== wasInside) {
      const weight = (boundary - previous[axis]) / (point[axis] - previous[axis]);
      clipped.push({ [axis]: boundary, [other]: previous[other] + weight * (point[other] - previous[other]) });
    }
    if (inside) clipped.push(point);
    previous = point;
    wasInside = inside;
  }
  return clipped;
}

function visibleCenter(ring, width, height) {
  const visible = clipRing(clipRing(clipRing(clipRing(ring, 'x', 0, 1), 'x', width, -1), 'y', 0, 1), 'y', height, -1);
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i], b = visible[(i + 1) % visible.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += cross * (a.x + b.x);
    y += cross * (a.y + b.y);
  }
  if (Math.abs(area) < 1e-5) return [];
  const center = { x: x / (3 * area), y: y / (3 * area) };
  return [center, ...visible];
}

/** Projection numbers stay visible when a narrow unit cannot contain a full label. */
export function placeCompanionUnitNumber(preferred, rings, { width, height, halfWidth, placed, resources, chrome, inside }) {
  const halfHeight = 7;
  const onScreen = point => point && point.x > 0 && point.x < width && point.y > 0 && point.y < height;
  let locations = preferred.filter(onScreen);
  if (!locations.length) {
    const clipped = rings().flatMap(ring => visibleCenter(ring, width, height));
    if (!clipped.length) return null;
    locations = [...clipped.filter(inside), ...clipped];
  }
  const clamp = point => ({
    x: Math.max(halfWidth + 2, Math.min(width - halfWidth - 2, point.x)),
    y: Math.max(halfHeight + 2, Math.min(height - halfHeight - 2, point.y)),
    halfWidth, halfHeight
  });
  const clearance = (point, other, margin) => {
    const x = Math.max(0, halfWidth + other.halfWidth + margin - Math.abs(point.x - other.x));
    const y = Math.max(0, halfHeight + other.halfHeight + margin - Math.abs(point.y - other.y));
    return x * y;
  };
  const anchors = locations.map(clamp);
  const obstructions = [...placed, ...chrome];
  const surrounding = [...obstructions, ...resources];
  const unobstructed = anchors.find(point => !surrounding.some(other => clearance(point, other, 3)));
  if (unobstructed) return unobstructed;
  const clearNumber = anchors.find(point => !obstructions.some(other => clearance(point, other, 2)));
  if (clearNumber) return clearNumber;
  // Keep the number close to the clipped polygon even if its type will not fit inside it.
  const offsets = [0, -8, 8, -16, 16];
  const nearby = anchors.slice(0, 3).flatMap(anchor =>
    offsets.flatMap(dx => offsets.map(dy => clamp({ x: anchor.x + dx, y: anchor.y + dy }))));
  const anchor = anchors[0];
  return [...anchors, ...nearby].reduce((best, point) => {
    const cost = Math.hypot(point.x - anchor.x, point.y - anchor.y)
      + 10 * placed.reduce((sum, other) => sum + clearance(point, other, 2), 0)
      + 12 * chrome.reduce((sum, other) => sum + clearance(point, other, 2), 0)
      + resources.reduce((sum, other) => sum + clearance(point, other, 0), 0);
    return cost < best.cost ? { point, cost } : best;
  }, { point: anchor, cost: Infinity }).point;
}
