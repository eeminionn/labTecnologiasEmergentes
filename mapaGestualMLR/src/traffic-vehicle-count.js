export const DEFAULT_TRAFFIC_VEHICLES = 5;
export const MAX_TRAFFIC_VEHICLES = 100;

export function normalizeVehicleCount(value) {
  const count = Number(value);
  return Number.isFinite(count)
    ? Math.min(MAX_TRAFFIC_VEHICLES, Math.max(0, Math.round(count)))
    : DEFAULT_TRAFFIC_VEHICLES;
}
