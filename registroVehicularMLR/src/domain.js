export const DIRECTIONS = ["Norte", "Sur", "Oriente", "Poniente"];
export const TIME_ZONE = "America/Santiago";

export function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function secondsFromMilliseconds(milliseconds) {
  const safeMilliseconds = Math.max(0, Number(milliseconds) || 0);
  if (safeMilliseconds === 0) return 0;
  return Math.max(1, Math.round(safeMilliseconds / 1000));
}

export function sanitizeCrossing(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function getLocalDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateCycle({ crossing, direction, greenSeconds, redSeconds, cars }) {
  const normalizedCrossing = sanitizeCrossing(crossing);
  const green = Number(greenSeconds);
  const red = Number(redSeconds);
  const carCount = Number(cars);

  if (normalizedCrossing.length < 3) return "Escribe el cruce.";
  if (!DIRECTIONS.includes(direction)) return "Elige una dirección.";
  if (!Number.isInteger(green) || green < 1 || green > 600) return "El verde debe durar entre 1 y 600 segundos.";
  if (!Number.isInteger(red) || red < 1 || red > 600) return "El rojo debe durar entre 1 y 600 segundos.";
  if (!Number.isInteger(carCount) || carCount < 0 || carCount > 5000) return "Revisa el conteo de autos.";
  return "";
}

export function groupRecords(records) {
  return records.reduce((groups, record) => {
    const date = record.fechaLocal || "Sin fecha";
    if (!groups[date]) groups[date] = [];
    groups[date].push(record);
    return groups;
  }, {});
}
