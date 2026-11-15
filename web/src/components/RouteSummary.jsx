export default function RouteSummary({ route }) {
  return (
    <section className="route-summary" aria-labelledby="summary-title">
      <h3 id="summary-title">Route Summary</h3>
      <dl className="route-metrics">
        <div><dt>Distance</dt><dd data-metric="distance">{route ? `${route.distanceKm.toFixed(route.distanceKm > 0 && route.distanceKm < 0.01 ? 3 : 2)} Km` : "—"}</dd></div>
        <div><dt>Max Slope°</dt><dd data-metric="slope">{route ? `${route.maxSlopeDeg.toFixed(1)}°` : "—"}</dd></div>
        <div><dt>Terrain Risk</dt><dd data-metric="risk" className={route ? `risk-${route.riskLevel.toLowerCase()}` : ""}>{route?.riskLevel || "—"}</dd></div>
      </dl>
      <p className="risk-qualification">Estimated terrain risk</p>
    </section>
  );
}
