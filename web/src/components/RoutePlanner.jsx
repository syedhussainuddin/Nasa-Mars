import Icon from "./Icon.jsx";
import RouteSummary from "./RouteSummary.jsx";
import ElevationProfile from "./ElevationProfile.jsx";

export default function RoutePlanner({ state, planner }) {
  const loading = state.routeStatus === "loading";
  return (
    <section id="planner-panel" className={`side-panel planner-panel${state.plannerExpanded ? " side-panel-expanded" : ""}`}
      aria-labelledby="planner-title" hidden={state.panel !== "planner"} aria-busy={loading}>
      <h2 id="planner-title">Route Planner</h2>
      <form noValidate onSubmit={(event) => { event.preventDefault(); planner.calculate(); }}>
        <div className="endpoint-fields">
          {["start", "end"].map((kind) => {
            const label = kind === "start" ? "Start coordinates" : "Destination coordinates";
            const detail = planner.details[kind];
            const error = state.fieldErrors[kind];
            return (
              <div className="endpoint-row" key={kind}>
                {kind === "start" ? <span className="endpoint-origin" aria-hidden="true" /> : <Icon name="pin" className="endpoint-icon" />}
                <div className="endpoint-entry">
                  <div className="endpoint-input-box">
                    <input id={`endpoint-${kind}`} aria-label={label} autoComplete="off" spellCheck={false}
                      placeholder={kind === "start" ? "Enter start, or click on the map" : "Enter destination, or click on the map"}
                      value={state.endpointDrafts[kind]} aria-invalid={Boolean(error)}
                      aria-describedby={error ? `endpoint-${kind}-error` : detail ? `endpoint-${kind}-details` : undefined}
                      onChange={(event) => planner.edit(kind, event.target.value)} />
                    {detail && <p className="endpoint-details" id={`endpoint-${kind}-details`}>
                      Elevation {detail.elevationM.toFixed(0)} m | Slope {Number.isFinite(detail.slopeDeg) ? `${detail.slopeDeg.toFixed(1)}°` : "unmapped"}
                    </p>}
                  </div>
                  {error && <p className="field-error" role="alert" id={`endpoint-${kind}-error`}>{error}</p>}
                </div>
              </div>
            );
          })}
        </div>
        <button className="calculate-button" type="submit" disabled={loading}>
          {loading ? <><span className="button-spinner" aria-hidden="true" /><span role="status">Calculating route…</span></>
            : state.plannerExpanded ? "Recalculate Route" : "Calculate Route"}
        </button>
      </form>
      {(state.routeError || planner.terrainError) && <p className="panel-error" role="alert">{state.routeError || planner.terrainError}</p>}
      {planner.saved.error && state.route && <p className="storage-warning" role="alert">{planner.saved.error}</p>}
      {state.plannerExpanded && (
        <div className="planner-results">
          <RouteSummary route={state.route} />
          <section className="elevation-profile" aria-labelledby="profile-title">
            <h3 id="profile-title">Elevation Profile</h3>
            <ElevationProfile profile={state.route?.elevationProfile} />
          </section>
        </div>
      )}
    </section>
  );
}
