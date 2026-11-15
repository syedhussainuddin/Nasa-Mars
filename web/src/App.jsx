import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from "react";
import ConditionsHeader from "./components/ConditionsHeader.jsx";
import RightToolbar from "./components/RightToolbar.jsx";
import Starfield from "./components/Starfield.jsx";
import { loadConditions } from "./data/conditions.js";
import { appReducer, createInitialState, selectStage } from "./state/appState.js";
import { HANDOFF_DURATION_MS } from "./map/mapHelpers.js";
import RoutePlanner from "./components/RoutePlanner.jsx";
import SavedRoutesPanel from "./components/SavedRoutesPanel.jsx";
import { useRoutePlanner } from "./planner/useRoutePlanner.js";

const MarsGlobe = lazy(() => import("./components/MarsGlobe.jsx"));
const MarsMap = lazy(() => import("./components/MarsMap.jsx"));

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const planner = useRoutePlanner(state, dispatch);
  const [conditions, setConditions] = useState({ data: null, status: "loading", error: "" });
  const updateGlobeViewport = useCallback((viewport) => {
    dispatch({ type: "UPDATE_VIEWPORT", view: "globe", viewport });
  }, []);
  const enterMap = useCallback((viewport, { focusStudyArea = false } = {}) => {
    dispatch({ type: "ENTER_MAP", viewport, focusStudyArea });
  }, []);
  const updateMapViewport = useCallback((viewport) => dispatch({ type: "UPDATE_VIEWPORT", view: "map", viewport }), []);
  const exitMap = useCallback((viewport) => dispatch({ type: "EXIT_MAP", viewport }), []);
  const selectEndpoint = useCallback((point) => {
    planner.cancel();
    dispatch({ type: "SELECT_ENDPOINT", point });
  }, [planner.cancel]);
  const selectionError = useCallback((error) => dispatch({ type: "ENDPOINT_ERROR", error }), []);
  const studyFocusComplete = useCallback((id) => dispatch({ type: "STUDY_FOCUS_COMPLETE", id }), []);

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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => dispatch({ type: "TRANSITION_COMPLETE", id: state.transition.id }),
      reducedMotion ? 0 : HANDOFF_DURATION_MS + 20);
    return () => clearTimeout(id);
  }, [state.transition]);

  return (
    <main className="app-shell" data-stage={selectStage(state)} data-view={state.view}>
      <Starfield />
      <div key={state.view} className={`scene-stage${state.transition ? " scene-entering" : ""}`} data-scene={state.view}>
        {state.view === "globe" && (
          <Suspense fallback={<p className="globe-message" role="status">Loading Mars…</p>}>
            <MarsGlobe viewport={state.viewports.globe} onViewportChange={updateGlobeViewport} onEnterMap={enterMap} />
          </Suspense>
        )}
        {state.view === "map" && (
          <Suspense fallback={<p className="map-message" role="status">Loading map…</p>}>
            <MarsMap viewport={state.viewports.map} endpoints={state.endpoints} route={state.route}
              panel={state.panel} hazardsVisible={state.hazardsVisible} studyFocus={state.studyFocus}
              onStudyFocusComplete={studyFocusComplete}
              onViewportChange={updateMapViewport} onExitGlobe={exitMap}
              onSelectEndpoint={selectEndpoint} onSelectionError={selectionError} />
          </Suspense>
        )}
      </div>
      <ConditionsHeader conditions={conditions.data} status={conditions.status} error={conditions.error} />
      <RightToolbar view={state.view} panel={state.panel} hazardsVisible={state.hazardsVisible} dispatch={dispatch} />
      <RoutePlanner state={state} planner={planner} />
      <SavedRoutesPanel state={state} planner={planner} />
    </main>
  );
}
