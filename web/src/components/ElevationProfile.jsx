export default function ElevationProfile({ profile, distanceKm }) {
  if (!profile?.length) return <p className="muted">No elevation profile returned.</p>;
  const width = 300, height = 172;
  const left = 49, right = 12, top = 18, bottom = 38;
  const [minimum, maximum] = profile.reduce(([low, high], p) => [Math.min(low, p.elevationM), Math.max(high, p.elevationM)], [Infinity, -Infinity]);
  let low = minimum, high = maximum;
  const margin = Math.max((high - low) * 0.12, 1);
  low -= margin; high += margin;
  const maxX = Math.max(distanceKm, profile.at(-1).distanceKm, 0.001);
  const x = value => left + value / maxX * (width - left - right);
  const y = value => top + (high - value) / (high - low) * (height - top - bottom);
  const points = profile.map(p => `${x(p.distanceKm)},${y(p.elevationM)}`).join(' ');
  return <svg className="elevation-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Elevation profile over ${distanceKm.toFixed(2)} kilometres. Elevation ranges from ${minimum.toFixed(0)} to ${maximum.toFixed(0)} metres.`}>
    <text x={left} y="10" className="chart-caption">Elevation (m)</text>
    {[0, 0.5, 1].map(t => {
      const value = low + (high - low) * t, cy = y(value);
      return <g key={t}><line x1={left} y1={cy} x2={width - right} y2={cy} className="chart-grid" /><text x={left - 6} y={cy + 4} textAnchor="end">{value.toFixed(0)}</text></g>;
    })}
    <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
    {profile.length === 1 && <circle cx={x(profile[0].distanceKm)} cy={y(profile[0].elevationM)} r="3" fill="var(--yellow)" />}
    <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="var(--border)" />
    {[0, 0.5, 1].map(t => <text key={t} x={x(maxX * t)} y={height - bottom + 16} textAnchor="middle">{(maxX * t).toFixed(2)}</text>)}
    <text x={width / 2 + 12} y={height - 3} textAnchor="middle" className="chart-caption">Distance (km)</text>
  </svg>;
}
