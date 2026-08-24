import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTimer,
  groupRecords,
  sanitizeCrossing,
  validateCycle,
} from "../src/domain.js";

test("formatea el tiempo con dos dígitos", () => {
  assert.equal(formatTimer(0), "00:00");
  assert.equal(formatTimer(65), "01:05");
});

test("limpia espacios del cruce", () => {
  assert.equal(sanitizeCrossing("  Av. Larraín   /  Tobalaba "), "Av. Larraín / Tobalaba");
});

test("valida un ciclo correcto", () => {
  assert.equal(validateCycle({
    crossing: "Larraín / Tobalaba",
    direction: "Norte",
    greenSeconds: 45,
    redSeconds: 50,
    cars: 18,
  }), "");
});

test("rechaza duraciones fuera de rango", () => {
  assert.match(validateCycle({
    crossing: "Larraín / Tobalaba",
    direction: "Norte",
    greenSeconds: 0,
    redSeconds: 50,
    cars: 18,
  }), /verde/i);
});

test("agrupa registros por día", () => {
  const grouped = groupRecords([
    { fechaLocal: "2026-08-24", autos: 10 },
    { fechaLocal: "2026-08-24", autos: 12 },
    { fechaLocal: "2026-08-23", autos: 8 },
  ]);
  assert.equal(grouped["2026-08-24"].length, 2);
  assert.equal(grouped["2026-08-23"].length, 1);
});
