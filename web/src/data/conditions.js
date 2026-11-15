import { fetchJson } from "./loadGrid.js";

const CO2_SPECIFIC_GAS_CONSTANT = 191.2;

/** Use the latest sol in the supplied readings, not a mixture of different sols. */
export function normalizeConditions(raw) {
  if (!Array.isArray(raw?.readings) || !raw.readings.length) {
    throw new Error("No conditions readings are available.");
  }
  const latest = raw.readings.reduce((a, b) => b.sol > a.sol ? b : a);
  const { temperatureC, pressurePa, sol } = latest;
  if (!Number.isFinite(temperatureC) || temperatureC <= -273.15 ||
      !Number.isFinite(pressurePa) || pressurePa < 0) {
    throw new Error("The conditions reading has invalid temperature or pressure.");
  }
  return {
    sol,
    temperatureC,
    pressurePa,
    pressureMbar: pressurePa / 100,
    densityKgM3: pressurePa / (CO2_SPECIFIC_GAS_CONSTANT * (temperatureC + 273.15)),
    radiation: Number.isFinite(raw.radiation) ? raw.radiation : null,
    storm: typeof raw.storm === "string" ? raw.storm : null,
    isSample: raw.isSample !== false,
    source: typeof raw.source === "string" ? raw.source : "Unspecified source",
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

export async function loadConditions() {
  return normalizeConditions(await fetchJson("conditions_sample.json"));
}
