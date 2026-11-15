export default function SavedRoutesPanel({ state, planner }) {
  const loading = state.routeStatus === "loading";
  return (
    <section id="saved-panel" className="side-panel saved-routes-panel" aria-labelledby="saved-title"
      hidden={state.panel !== "saved"} aria-busy={loading}>
      <h2 id="saved-title">Saved Routes</h2>
      {planner.saved.error && <p className="panel-error" role="alert">{planner.saved.error}</p>}
      {loading && <p className="panel-status" role="status">Loading saved route…</p>}
      <ul className="saved-route-list">
        {planner.saved.routes.map((entry) => (
          <li key={entry.id}>
            <button className="saved-route-row" type="button" disabled={loading}
              title={entry.description || entry.name} onClick={() => planner.restore(entry)}>
              <span className="saved-route-name">{entry.name}</span>
              <span className="saved-route-distance">{entry.distanceKm.toFixed(1)} Kms</span>
            </button>
          </li>
        ))}
      </ul>
      {!planner.saved.routes.length && !planner.saved.error && <p className="saved-empty">No saved routes yet.</p>}
    </section>
  );
}
