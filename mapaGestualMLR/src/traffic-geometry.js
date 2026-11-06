import * as THREE from 'three';

export function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

export function pointAlong(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= length || i === points.length - 1) {
      const t = length ? Math.min(1, Math.max(0, distance / length)) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
        heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    distance -= length;
  }
  return { x: points[0]?.[0] || 0, z: points[0]?.[1] || 0, heading: 0 };
}

// A joined ribbon follows the surveyed road centre line. Its vertices stay in
// metres, so the model scale, carriageway and vehicle positions share a frame.
export function ribbonGeometry(points, width, elevation = 0) {
  const vertices = [], indices = [];
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    vertices.push(points[i][0] + nx, elevation, points[i][1] + nz,
      points[i][0] - nx, elevation, points[i][1] - nz);
    if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function segmentIntersections(roads) {
  const result = [];
  for (let r = 0; r < roads.length; r++) for (let s = r + 1; s < roads.length; s++) {
    const first = roads[r], second = roads[s];
    if (first.name && first.name === second.name) continue;
    for (let i = 1; i < first.points.length; i++) for (let j = 1; j < second.points.length; j++) {
      const a = first.points[i - 1], b = first.points[i], c = second.points[j - 1], d = second.points[j];
      const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
      const cross = rx * sz - rz * sx;
      if (Math.abs(cross) < 0.001) continue;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / cross;
      const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / cross;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const point = { x: a[0] + t * rx, z: a[1] + t * rz, roads: [first, second] };
      if (!result.some(old => Math.hypot(old.x - point.x, old.z - point.z) < 8)) result.push(point);
    }
  }
  return result;
}

export function disposal(scene, additional = []) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const root of [scene, ...additional]) root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => { texture.dispose(); texture.source?.data?.close?.(); });
}
