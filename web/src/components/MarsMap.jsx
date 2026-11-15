import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadGrid } from "../data/loadGrid.js";
import { gridBoundsLatLon } from "../routing/coordinates.js";
import { IMAGERY_ATTRIBUTION } from "../data/wmts.js";
import { createTextureFallback, createImageryLayers, imageryStatus, LOCAL_ORTHO_URL } from "../map/imageryLayers.js";
import {
  MAP_ENTRY_ZOOM, MAP_EXIT_ZOOM, MAP_MAX_ZOOM,
  routeLatLngs, routeFitOptions, studyFitOptions, needsStudyFocus, readMapInsets, selectMapEndpoint, wrapLongitude,
} from "../map/mapHelpers.js";

export default function MarsMap({
  viewport, endpoints, route, panel, hazardsVisible,
  onViewportChange, onExitGlobe, onSelectEndpoint, onSelectionError,
  gridData, localOrthoUrl = LOCAL_ORTHO_URL, studyFocus, onStudyFocusComplete,
}) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const endpointsLayer = useRef(null);
  const routeLayer = useRef(null);
  const dataRef = useRef(null);
  const terrainError = useRef("");
  const initialViewport = useRef(viewport);
  const callbacks = useRef({});
  const [data, setData] = useState(gridData || null);
  const [error, setError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [orthoError, setOrthoError] = useState("");
  const [ready, setReady] = useState(false);
  const panelRef = useRef(panel);
  const refreshMap = useRef(null);
  const handledStudyFocus = useRef(null);
  const refitRoute = useRef(null);
  const localOrtho = useRef(null);
  const [studyInView, setStudyInView] = useState(false);
  const [imagery, setImagery] = useState({ source: "Local texture fallback", grayscale: false, loading: true, fallback: false });

  useEffect(() => {
    callbacks.current = { onViewportChange, onExitGlobe, onSelectEndpoint, onSelectionError, onStudyFocusComplete };
    panelRef.current = panel;
    refreshMap.current?.();
  }, [onViewportChange, onExitGlobe, onSelectEndpoint, onSelectionError, onStudyFocusComplete, panel]);

  useEffect(() => {
    let active = true;
    terrainError.current = "";
    setError("");
    if (gridData) {
      dataRef.current = gridData;
      setData(gridData);
    } else {
      loadGrid().then((loaded) => {
        if (active) { dataRef.current = loaded; setData(loaded); }
      }).catch(() => {
        if (active) {
          terrainError.current = "Terrain could not be loaded. Endpoint selection and hazards are unavailable.";
          setError(terrainError.current);
        }
      });
    }
    return () => { active = false; };
  }, [gridData]);

  useEffect(() => {
    const element = host.current;
    const map = L.map(element, {
      crs: L.CRS.EPSG4326,
      zoomControl: false,
      attributionControl: false,
      minZoom: 0,
      maxZoom: MAP_MAX_ZOOM,
      worldCopyJump: true,
      maxBounds: [[-90, -540], [90, 540]],
      maxBoundsViscosity: 1,
      zoomAnimation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    mapRef.current = map;
    for (const [name, zIndex] of [
      ["texturePane", 200], ["imageryPane", 210], ["localOrthoPane", 250],
      ["hazardPane", 300], ["footprintPane", 350], ["routePane", 400],
    ]) {
      map.createPane(name).style.zIndex = String(zIndex);
      map.getPane(name).style.pointerEvents = "none";
    }
    let reportFrame = 0;
    let entries = [];
    const report = () => {
      if (reportFrame) return;
      reportFrame = requestAnimationFrame(() => {
        reportFrame = 0;
        if (!element.isConnected || mapRef.current !== map) return;
        let next = imageryStatus(entries, map);
        const image = localOrtho.current?.getElement();
        if (image?.complete && image.naturalWidth > 0) {
          const imageBox = image.getBoundingClientRect(), viewBox = element.getBoundingClientRect();
          const visibleWidth = Math.min(imageBox.right, viewBox.right) - Math.max(imageBox.left, viewBox.left);
          const visibleHeight = Math.min(imageBox.bottom, viewBox.bottom) - Math.max(imageBox.top, viewBox.top);
          if (visibleWidth >= 32 && visibleHeight >= 32) {
            next = { ...next, source: "Local Jezero orthomosaic" };
          }
        }
        setImagery((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        element.dataset.imagerySource = next.source;
        element.dataset.imageryLoading = String(next.loading);
        if (dataRef.current) {
          const bounds = L.latLngBounds(gridBoundsLatLon(dataRef.current.meta));
          const sw = map.latLngToContainerPoint(bounds.getSouthWest());
          const ne = map.latLngToContainerPoint(bounds.getNorthEast());
          const insets = readMapInsets(element, panelRef.current);
          const center = insets ? map.containerPointToLatLng([
            (insets.left + element.clientWidth - insets.right) / 2,
            (insets.top + element.clientHeight - insets.bottom) / 2,
          ]) : map.getCenter();
          setStudyInView(!needsStudyFocus({
            centerInside: bounds.contains(center),
            width: Math.abs(ne.x - sw.x), height: Math.abs(ne.y - sw.y),
          }));
        }
      });
    };
    refreshMap.current = report;
    createTextureFallback(`${import.meta.env.BASE_URL}assets/mars.jpg`).addTo(map);
    entries = createImageryLayers({ onChange: report });
    for (const { layer } of entries) layer.addTo(map);
    endpointsLayer.current = L.layerGroup().addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map)
      .addAttribution(`${IMAGERY_ATTRIBUTION} · <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope (CC BY 4.0)</a>`);

    let exiting = false;
    const publish = () => {
      if (!element.isConnected || mapRef.current !== map) return;
      const center = map.getCenter();
      const next = { center: { lat: center.lat, lon: wrapLongitude(center.lng) }, zoom: map.getZoom() };
      element.dataset.zoom = String(next.zoom);
      element.dataset.centerLat = next.center.lat.toFixed(6);
      element.dataset.centerLon = next.center.lon.toFixed(6);
      element.dataset.imageryMode = next.zoom >= 7 ? "detail" : "color";
      report();
      callbacks.current.onViewportChange?.(next);
      if (next.zoom <= MAP_EXIT_ZOOM && !exiting && callbacks.current.onExitGlobe) {
        exiting = true;
        callbacks.current.onExitGlobe(next);
      }
    };
    map.on("moveend", publish);
    map.on("click", ({ latlng }) => {
      if (terrainError.current) {
        callbacks.current.onSelectionError?.("Terrain could not be loaded. Reload the page before selecting endpoints.");
        return;
      }
      const selected = selectMapEndpoint({ lat: latlng.lat, lon: latlng.lng }, dataRef.current);
      if (selected.error) callbacks.current.onSelectionError?.(selected.error);
      else callbacks.current.onSelectEndpoint?.(selected.point);
    });
    const initial = initialViewport.current;
    map.setView([initial.center.lat, initial.center.lon],
      Math.max(MAP_ENTRY_ZOOM, Math.min(MAP_MAX_ZOOM, initial.zoom)), { animate: false });
    let previousWidth = element.clientWidth, previousHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      if (!element.isConnected || mapRef.current !== map) return;
      if (previousWidth === element.clientWidth && previousHeight === element.clientHeight) return;
      previousWidth = element.clientWidth;
      previousHeight = element.clientHeight;
      map.invalidateSize({ pan: false });
      refitRoute.current?.();
      report();
    });
    observer.observe(element);
    setReady(true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(reportFrame);
      refreshMap.current = null;
      refitRoute.current = null;
      map.off();
      map.remove();
      mapRef.current = null;
      endpointsLayer.current = null;
      routeLayer.current = null;
    };
  }, []);

  // Controlled external views (e.g. restored routes) must not recreate Leaflet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const center = map.getCenter();
    if (Math.abs(center.lat - viewport.center.lat) > 1e-8 ||
        Math.abs(wrapLongitude(center.lng - viewport.center.lon)) > 1e-8 || map.getZoom() !== viewport.zoom) {
      map.setView([viewport.center.lat, viewport.center.lon], viewport.zoom, { animate: false });
    }
  }, [ready, viewport.center.lat, viewport.center.lon, viewport.zoom]);

  useEffect(() => {
    if (!ready || !data) return;
    const footprint = L.rectangle(gridBoundsLatLon(data.meta), {
      pane: "footprintPane", className: "grid-footprint", color: "#F1C749",
      weight: 2.5, dashArray: "8 5", fill: false, interactive: false,
    }).addTo(mapRef.current);
    const [[, west], [north, east]] = gridBoundsLatLon(data.meta);
    const label = L.tooltip({
      pane: "footprintPane", permanent: true, direction: "top", offset: [0, -8],
      className: "study-area-label", opacity: 1, interactive: false,
    }).setLatLng([north, (west + east) / 2]).setContent("JEZERO · STUDY AREA").addTo(mapRef.current);
    refreshMap.current?.();
    return () => { footprint.remove(); label.remove(); };
  }, [ready, data]);

  useEffect(() => {
    setOrthoError("");
    if (!ready || !data || !localOrthoUrl) return;
    const overlay = L.imageOverlay(localOrthoUrl, gridBoundsLatLon(data.meta), {
      pane: "localOrthoPane", className: "local-ortho", interactive: false,
    });
    localOrtho.current = overlay;
    overlay.on("load", () => refreshMap.current?.());
    overlay.on("error", () => {
      overlay.remove();
      if (localOrtho.current === overlay) localOrtho.current = null;
      refreshMap.current?.();
      setOrthoError("The local image could not be loaded. NASA imagery remains available underneath.");
    });
    overlay.addTo(mapRef.current);
    return () => {
      overlay.off();
      overlay.remove();
      if (localOrtho.current === overlay) localOrtho.current = null;
      refreshMap.current?.();
    };
  }, [ready, data, localOrthoUrl]);

  useEffect(() => {
    if (!ready || !data || !hazardsVisible) return;
    const overlay = L.imageOverlay(data.slopeRaster, gridBoundsLatLon(data.meta), {
      pane: "hazardPane", className: "hazard-raster", opacity: 0.43, interactive: false,
    }).addTo(mapRef.current);
    return () => overlay.remove();
  }, [ready, data, hazardsVisible]);

  useEffect(() => {
    if (!ready) return;
    const layer = endpointsLayer.current;
    layer.clearLayers();
    for (const [kind, point] of Object.entries(endpoints)) {
      if (!point) continue;
      const label = kind === "start" ? "Start point" : "Destination point";
      const marker = L.marker([point.lat, point.lon], {
        title: label, alt: label, bubblingMouseEvents: false,
        icon: L.divIcon({
          className: `map-endpoint map-endpoint-${kind}`,
          html: '<span class="map-endpoint-dot"></span>',
          iconSize: [38, 38], iconAnchor: [19, 19],
        }),
      }).addTo(layer);
      marker.getElement().setAttribute("aria-label", label);
    }
    return () => layer.clearLayers();
  }, [ready, endpoints]);

  useEffect(() => {
    if (!ready || !data) return;
    const layer = routeLayer.current;
    layer.clearLayers();
    refitRoute.current = null;
    setRouteError("");
    if (!route) return;
    try {
      const points = routeLatLngs(route, data.meta);
      L.polyline(points, { pane: "routePane", className: "route-glow", color: "#F1C749", weight: 13, opacity: 0.22, interactive: false }).addTo(layer);
      const line = L.polyline(points, { pane: "routePane", className: "route-line", color: "#F1C749", weight: 4, opacity: 1, interactive: false }).addTo(layer);
      const map = mapRef.current, element = host.current;
      const fit = () => map.fitBounds(line.getBounds(),
        routeFitOptions(panelRef.current, element.clientWidth, element.clientHeight, readMapInsets(element, panelRef.current)));
      refitRoute.current = fit;
      fit();
    } catch {
      layer.clearLayers();
      refitRoute.current = null;
      setRouteError("This route contains invalid map coordinates and could not be drawn.");
    }
    return () => { layer.clearLayers(); refitRoute.current = null; };
  }, [ready, data, route]);

  useEffect(() => {
    if (!ready || !data || !studyFocus || handledStudyFocus.current === studyFocus.id) return;
    const map = mapRef.current;
    const bounds = L.latLngBounds(gridBoundsLatLon(data.meta));
    const sw = map.latLngToContainerPoint(bounds.getSouthWest());
    const ne = map.latLngToContainerPoint(bounds.getNorthEast());
    const element = host.current;
    const insets = readMapInsets(element, panelRef.current);
    const center = insets ? map.containerPointToLatLng([
      (insets.left + element.clientWidth - insets.right) / 2,
      (insets.top + element.clientHeight - insets.bottom) / 2,
    ]) : map.getCenter();
    if (studyFocus.reason === "planner" || needsStudyFocus({
      centerInside: bounds.contains(center),
      width: Math.abs(ne.x - sw.x), height: Math.abs(ne.y - sw.y),
    })) {
      map.fitBounds(bounds, studyFitOptions(panelRef.current, element.clientWidth, element.clientHeight, insets));
    }
    handledStudyFocus.current = studyFocus.id;
    refreshMap.current?.();
    callbacks.current.onStudyFocusComplete?.(studyFocus.id);
  }, [ready, data, studyFocus]);

  return (
    <section className="mars-map-stage" aria-label="Mars terrain map">
      <div ref={host} className="mars-map" aria-label="Interactive Mars map" tabIndex={0} data-terrain={data ? "ready" : error ? "error" : "loading"} />
      {!data && !error && <p className="map-message" role="status">Loading terrain…</p>}
      {(error || routeError || orthoError) && <p className="map-message map-error" role="alert">{error || routeError || orthoError}</p>}
      <div className="imagery-status" role="status" aria-live="polite">
        <span>{imagery.source} · {imagery.grayscale ? "grayscale" : "color"}</span>
        {imagery.loading
          ? <small>Loading imagery; lower-resolution layers remain underneath.</small>
          : imagery.fallback && <small>Some detailed tiles unavailable; showing lower-resolution coverage.</small>}
      </div>
      {hazardsVisible && data && (
        <div className="hazard-key">
          <p className="hazard-coverage">{studyInView ? "Hazards: Jezero study area only" : "Jezero hazards off-screen or too small — use the pin to locate"}</p>
          <ul className="hazard-legend" aria-label="Terrain slope legend">
            <li><span className="slope-chip slope-green" />&lt;10°</li>
            <li><span className="slope-chip slope-yellow" />10–15°</li>
            <li><span className="slope-chip slope-red" />&gt;15°</li>
          </ul>
        </div>
      )}
    </section>
  );
}
