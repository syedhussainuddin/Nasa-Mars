import { cellToLatLon } from '../routing/coordinates.js';
import Icon from './Icon.jsx';
import ElevationProfile from './ElevationProfile.jsx';

export function Endpoint({ label, cell, terrain, destination }) {
  const point = cell && terrain ? cellToLatLon(cell, terrain.meta) : null;
  const elevation = cell ? terrain?.grid[cell.row]?.[cell.col] : null;
  const slope = cell ? terrain?.slopes[cell.row]?.[cell.col] : null;
  const format = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return <div className={`endpoint ${destination ? 'destination' : ''}`}>
    <span className="endpoint-symbol">{destination ? 'D' : 'S'}</span>
    <div className="endpoint-field">
      <label>{label}<input aria-label={`${label} selected coordinates`} readOnly value={point ? `${format(point.lat, 'N', 'S')}, ${format(point.lon, 'E', 'W')}` : 'Select a point on the Jezero map'} /></label>
      {cell && <small>Elevation {elevation == null ? 'unavailable' : `${elevation.toFixed(1)} m`} <span>·</span> Slope {slope == null ? 'unavailable' : `${slope.toFixed(1)}°`}</small>}
    </div>
  </div>;
}

export default function RoutePlannerPanel({ terrain, start, end, route, busy, error, mode, onCalculate, onReset, onSave, saved, terrainStatus, onRetry }) {
  const ready = start && end;
  return <>
    <div className="panel-title"><h1>Route Planner</h1><span className="eyebrow">JEZERO</span></div>
    {!route && <p className="panel-description">A local traverse. An extraordinary landscape.</p>}
    {mode === 'demo' && <div className="notice demo-notice"><strong>Demo mode</strong><span>{route ? 'Sample L-shaped traverse. Not optimized; does not avoid hazards.' : 'Routing module not installed. Sample traverses do not avoid hazards.'}</span></div>}
    {terrainStatus === 'loading' && <div className="notice" role="status"><span className="spinner" /> Loading Jezero terrain…</div>}
    {terrainStatus === 'error' && <div className="notice error" role="alert">Terrain could not be loaded. Check your connection and try again.<button className="secondary" onClick={onRetry}>Retry terrain load</button></div>}
    <div className="endpoints">
      <Endpoint label="Start" cell={start} terrain={terrain} />
      <Endpoint label="Destination" cell={end} terrain={terrain} destination />
    </div>
    {!route && <><p className="selection-status" role="status"><span className={`status-dot ${ready ? 'ready' : ''}`} />{busy ? 'Calculating route…' : !start ? 'Choose a starting point.' : !end ? 'Choose a destination.' : 'Ready to calculate.'}</p>
    <p className="selection-instructions">Click the local map to set Start, then Destination. A third valid click resets both points. Coordinates above are read-only.</p></>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="button-row">
      <button className="primary" disabled={!ready || busy || !terrain} onClick={onCalculate}>{busy ? <><span className="spinner" /> Calculating…</> : route ? 'Recalculate Route' : 'Calculate Route'}</button>
      <button className="reset-button" onClick={onReset} title="Reset points and route" aria-label="Reset points and route"><Icon name="reset" size={18} /><span>Reset</span></button>
    </div>
    {route && <section className="route-results" aria-label="Route results">
      <div className="section-heading"><h2>Route Summary</h2>{route.demo && <span className="sample-badge">Sample result</span>}</div>
      <div className="summary-grid">
        <div><span>Distance</span><strong>{route.distanceKm.toFixed(2)} <small>km</small></strong></div>
        <div><span>Max slope</span><strong>{route.maxSlopeDeg.toFixed(1)}<small>°</small></strong></div>
        <div className={`risk risk-${route.riskLevel.toLowerCase()}`}><span>Estimated terrain risk</span><strong>{route.riskLevel}</strong></div>
      </div>
      <h2 className="profile-heading">Elevation Profile</h2>
      <ElevationProfile profile={route.elevationProfile} distanceKm={route.distanceKm} />
      <button className="secondary save-button" onClick={onSave} disabled={saved}><Icon name="star" size={17} />{saved ? 'Route saved' : 'Save Route'}</button>
    </section>}
  </>;
}
