const KEY = 'mars-nav:saved-routes:v1';
const validCell = c => Number.isInteger(c?.row) && Number.isInteger(c?.col) && c.row >= 0 && c.col >= 0;
export function readSavedRoutes() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) throw new Error('Invalid saved routes');
    return { routes: raw.filter(r => typeof r.id === 'string' && validCell(r.start) && validCell(r.end) &&
      typeof r.name === 'string' && Number.isFinite(r.distanceKm)), error: '' };
  } catch {
    return { routes: [], error: 'Saved routes could not be read. Routes will remain available in this session.' };
  }
}
export function writeSavedRoutes(routes) {
  try { localStorage.setItem(KEY, JSON.stringify(routes)); return ''; }
  catch { return 'Storage is unavailable. Your routes are saved for this session only.'; }
}
