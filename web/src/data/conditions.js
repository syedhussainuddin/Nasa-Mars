import { fetchJson } from './loadGrid.js';

export function normalizeConditions(raw) {
  const number = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    temperature: number(raw.temperature_c ?? raw.temperature?.value),
    pressure: number(raw.pressure_pa ?? raw.pressure?.value),
    pressureUnit: raw.pressure_pa != null ? 'Pa' : raw.pressure?.unit || 'Pa',
    sol: number(raw.sol),
    source: typeof raw.source === 'string' ? raw.source : raw.source?.name || 'Unspecified source',
    // Unknown provenance must never be presented as verified live readings.
    sample: raw.is_sample !== false || !raw.source,
  };
}
export const loadConditions = () => fetchJson('conditions_sample.json').then(normalizeConditions);
