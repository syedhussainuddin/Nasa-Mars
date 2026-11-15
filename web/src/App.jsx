import { useEffect, useReducer, useState } from "react";
import ConditionsHeader from "./components/ConditionsHeader.jsx";
import RightToolbar from "./components/RightToolbar.jsx";
import Starfield from "./components/Starfield.jsx";
import { loadConditions } from "./data/conditions.js";
import { appReducer, createInitialState, selectStage } from "./state/appState.js";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const [conditions, setConditions] = useState({ data: null, status: "loading", error: "" });

  useEffect(() => {
    let active = true;
    loadConditions().then(
      (data) => { if (active) setConditions({ data, status: "ready", error: "" }); },
      () => { if (active) setConditions({ data: null, status: "error", error: "Conditions could not be loaded." }); },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.transition) return;
    // Phase 3/4 scene components will own the animated handoff. Until then,
    // acknowledge the shell's view change without introducing an extra animation.
    const id = requestAnimationFrame(() => dispatch({ type: "TRANSITION_COMPLETE", id: state.transition.id }));
    return () => cancelAnimationFrame(id);
  }, [state.transition]);

  return (
    <main className="app-shell" data-stage={selectStage(state)} data-view={state.view}>
      <Starfield />
      {/* Actual scene rendering belongs to Phases 3 and 4; no mock globe or map. */}
      <div className="scene-stage" data-scene={state.view} aria-hidden="true" />
      <ConditionsHeader conditions={conditions.data} status={conditions.status} error={conditions.error} />
      <RightToolbar view={state.view} panel={state.panel} hazardsVisible={state.hazardsVisible} dispatch={dispatch} />
      {/* Panel shells only. Endpoint controls/results are introduced in Phase 5. */}
      <section id="planner-panel" className={`side-panel${state.route ? " side-panel-expanded" : ""}`}
        aria-labelledby="planner-title" hidden={state.panel !== "planner"}>
        <h2 id="planner-title">Route Planner</h2>
        {state.routeStatus === "loading" && <p className="panel-status" role="status">Calculating route…</p>}
        {state.routeError && <p className="panel-error" role="alert">{state.routeError}</p>}
      </section>
      <section id="saved-panel" className="side-panel" aria-labelledby="saved-title" hidden={state.panel !== "saved"}>
        <h2 id="saved-title">Saved Routes</h2>
      </section>
    </main>
  );
}
