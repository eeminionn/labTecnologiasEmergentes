const A = 6378137;
const E2 = 0.0066943799901413165;
const RAD = Math.PI / 180;

export function curvatureAt(latitude) {
  const sine = Math.sin(latitude * RAD), denominator = Math.sqrt(1 - E2 * sine * sine);
  return { primeVertical: A / denominator, meridional: A * (1 - E2) / denominator ** 3 };
}

// Local WGS84 east/south tangent coordinates, consistent with the source data.
export function localToLngLat(x, z, origin) {
  const curvature = curvatureAt(origin.lat);
  return [origin.lng + x / (curvature.primeVertical * Math.cos(origin.lat * RAD)) / RAD,
    origin.lat - z / curvature.meridional / RAD];
}

export function lngLatToLocal(longitude, latitude, origin) {
  const curvature = curvatureAt(origin.lat);
  return { x: (longitude - origin.lng) * RAD * curvature.primeVertical * Math.cos(origin.lat * RAD),
    z: -(latitude - origin.lat) * RAD * curvature.meridional };
}
