import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadGrid } from "../data/loadGrid.js";
import { cellToLatLon } from "../routing/coordinates.js";
import { isValidSavedRoute, readSavedRoutes, writeSavedRoutes } from "../data/savedRoutes.js";
import { calculateRouteAsync } from "./routeClient.js";
import {
  assertRouteResult, endpointDetails, parseCoordinates,
  prepareEndpoints, savedRouteEntry, upsertSavedRoute,
} from "./plannerData.js";

export function useRoutePlanner(state, dispatch) {
  const latest = useRef(state);
  useLayoutEffect(() => { latest.current = state; }, [state]);
  const [terrain, setTerrain] = useState(null);
  const [terrainError, setTerrainError] = useState("");
  const [saved, setSaved] = useState({ routes: [], error: "" });
  const operation = useRef(null);
  const mounted = useRef(false);
  const savedRef = useRef(saved);

  const cancel = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);

  const refreshSaved = useCallback((meta) => {
    const value = readSavedRoutes(meta);
    savedRef.current = value;
    setSaved(value);
    return value;
  }, []);
  useEffect(() => {
    if (!state.panel && state.view !== "map") return;
    let active = true;
    loadGrid().then((data) => {
      if (active) { setTerrain(data); setTerrainError(""); }
    }).catch(() => {
      if (active) setTerrainError("Terrain could not be loaded. Reload the page before calculating a route.");
    });
    return () => { active = false; };
  }, [state.panel, state.view]);
  useEffect(() => {
    if (state.panel === "saved") refreshSaved(terrain?.meta);
  }, [state.panel, terrain, refreshSaved]);

  const edit = useCallback((kind, text) => {
    cancel();
    const parsed = parseCoordinates(text);
    const details = endpointDetails(parsed, terrain);
    dispatch({ type: "EDIT_ENDPOINT", kind, text, point: details?.point || null });
  }, [cancel, dispatch, terrain]);

  const calculate = useCallback(async (entry) => {
    cancel();
    const controller = new AbortController();
    operation.current = controller;
    const current = () => mounted.current && operation.current === controller && !controller.signal.aborted;
    let requestId;
    try {
      // Missing/invalid text should report immediately, even if the DEM is slow.
      if (!entry) {
        const early = prepareEndpoints(latest.current.endpointDrafts, terrain);
        if (Object.values(early.errors).some((message) => message && !message.startsWith("Terrain is not available"))) {
          const errors = Object.fromEntries(Object.entries(early.errors).map(([key, message]) =>
            [key, message.startsWith("Terrain is not available") ? "" : message]));
          dispatch({ type: "VALIDATION_ERROR", errors, endpoints: early.endpoints });
          return;
        }
      }
      const data = terrain || await loadGrid();
      if (!current()) return;
      setTerrain(data);
      let endpoints;
      if (entry) {
        if (!isValidSavedRoute(entry, data.meta)) throw new Error("This saved route is corrupt and could not be loaded.");
        endpoints = { start: cellToLatLon(entry.start, data.meta), end: cellToLatLon(entry.end, data.meta) };
      } else {
        const prepared = prepareEndpoints(latest.current.endpointDrafts, data);
        if (!prepared.valid) {
          dispatch({ type: "VALIDATION_ERROR", errors: prepared.errors, endpoints: prepared.endpoints });
          return;
        }
        endpoints = prepared.endpoints;
      }
      requestId = latest.current.routeRequestId + 1;
      dispatch({ type: "ROUTE_START", endpoints, restoring: Boolean(entry) });
      const result = assertRouteResult(await calculateRouteAsync(endpoints.start, endpoints.end, data, controller.signal));
      if (!current()) return;
      const normalized = { start: cellToLatLon(result.cells[0], data.meta), end: cellToLatLon(result.cells.at(-1), data.meta) };
      dispatch({ type: entry ? "RESTORE_ROUTE" : "ROUTE_SUCCESS", requestId, route: result, endpoints: normalized });
      // Save only after validated successful results, never from render/effects.
      const previous = readSavedRoutes(data.meta);
      const routes = upsertSavedRoute(previous.routes, savedRouteEntry(result, data.meta, entry?.id));
      const storageError = writeSavedRoutes(routes);
      const value = { routes, error: [...new Set([previous.error, storageError].filter(Boolean))].join(" ") };
      savedRef.current = value;
      setSaved(value);
    } catch (error) {
      if (!current() || error?.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "No route could be calculated.";
      if (requestId != null) dispatch({ type: "ROUTE_ERROR", requestId, error: message });
      else dispatch({ type: "CALCULATION_ERROR", error: message });
      if (entry) {
        const value = { ...savedRef.current, error: message };
        savedRef.current = value;
        setSaved(value);
      }
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }, [cancel, dispatch, terrain]);

  return {
    terrain, terrainError, saved, edit, cancel,
    calculate: () => calculate(),
    restore: (entry) => calculate(entry),
    drafts: state.endpointDrafts,
    // Keep details derived from the current selected cell, not saved display data.
    details: {
      start: endpointDetails(state.endpoints.start, terrain),
      end: endpointDetails(state.endpoints.end, terrain),
    },
  };
}
