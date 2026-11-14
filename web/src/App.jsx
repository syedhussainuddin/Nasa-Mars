import { useCallback, useEffect, useRef, useState } from 'react';
import ConditionsHeader from './components/ConditionsHeader.jsx';
import NavigationRail from './components/NavigationRail.jsx';
import HomeView from './components/HomeView.jsx';
import TerrainMap from './components/TerrainMap.jsx';
import RoutePlannerPanel from './components/RoutePlannerPanel.jsx';
import SavedRoutesPanel from './components/SavedRoutesPanel.jsx';
import HazardControls from './components/HazardControls.jsx';
import InfoDialog from './components/InfoDialog.jsx';
import Icon from './components/Icon.jsx';
import { loadGrid } from './data/loadGrid.js';
import { loadConditions } from './data/conditions.js';
import { readSavedRoutes, writeSavedRoutes } from './data/savedRoutes.js';
import { latLonToCell } from './routing/coordinates.js';
import { calculateRoute, routingMode } from './routing/adapter.js';

export default function App() {
  const [view, setView] = useState('home');
  const [terrain, setTerrain] = useState(null), [terrainStatus, setTerrainStatus] = useState('loading');
  const [conditions, setConditions] = useState(null), [conditionsStatus, setConditionsStatus] = useState('loading');
  const [start, setStart] = useState(null), [end, setEnd] = useState(null), [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mode, setMode] = useState('loading');
  const [savedState] = useState(readSavedRoutes), [savedRoutes, setSavedRoutes] = useState(savedState.routes);
  const [storageError, setStorageError] = useState(savedState.error);
  const [hazards, setHazards] = useState(false), [opacity, setOpacity] = useState(0.45);
  const [info, setInfo] = useState(false), [collapsed, setCollapsed] = useState(false), [keyboardMode, setKeyboardMode] = useState(false);
  const requestId = useRef(0), inFlight = useRef(false), terrainRequest = useRef(0);
  const refreshTerrain = useCallback((retry = false) => {
    const id = ++terrainRequest.current;
    setTerrainStatus('loading');
    loadGrid({ retry }).then(data => {
      if (id === terrainRequest.current) { setTerrain(data); setTerrainStatus('ready'); }
    }).catch(() => { if (id === terrainRequest.current) setTerrainStatus('error'); });
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const expandOnDesktop = () => { if (!media.matches) setCollapsed(false); };
    media.addEventListener('change', expandOnDesktop);
    return () => media.removeEventListener('change', expandOnDesktop);
  }, []);
  useEffect(() => {
    refreshTerrain();
    let active = true;
    loadConditions().then(data => { if (active) { setConditions(data); setConditionsStatus('ready'); } })
      .catch(() => { if (active) setConditionsStatus('error'); });
    routingMode().then(value => { if (active) setMode(value); }).catch(() => { if (active) setMode('unavailable'); });
    return () => { active = false; requestId.current++; terrainRequest.current++; inFlight.current = false; };
  }, [refreshTerrain]);
  const invalidate = useCallback(() => {
    requestId.current++; inFlight.current = false; setBusy(false); setRoute(null); setError('');
  }, []);
  const reset = useCallback(() => { invalidate(); setStart(null); setEnd(null); }, [invalidate]);
  const navigate = target => { setView(target); setCollapsed(false); };
  const pick = useCallback(point => {
    if (!terrain) return;
    const cell = latLonToCell(point, terrain.meta);
    if (!cell) { setError('Outside the study area. Choose a point inside the dashed Jezero boundary.'); return; }
    if (!Number.isFinite(terrain.grid[cell.row]?.[cell.col])) { setError('No elevation data at this point. Choose another cell.'); return; }
    if (start && end) { reset(); return; }
    if (start && start.row === cell.row && start.col === cell.col) { setError('Choose a destination different from Start.'); return; }
    invalidate();
    if (!start) setStart(cell); else setEnd(cell);
    setView('planner');
  }, [terrain, start, end, invalidate, reset]);
  const run = async (a = start, b = end) => {
    if (!terrain || !a || !b || inFlight.current) return;
    const id = ++requestId.current;
    inFlight.current = true; setBusy(true); setRoute(null); setError('');
    try {
      // Yield so the calculation status paints even with a synchronous contributor engine.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (id !== requestId.current) return;
      const result = await calculateRoute(terrain.grid, terrain.meta, a, b, terrain.slopes);
      if (id === requestId.current) setRoute(result);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Route calculation failed. Try different endpoints.');
    } finally {
      if (id === requestId.current) { inFlight.current = false; setBusy(false); }
    }
  };
  const persist = routes => { setSavedRoutes(routes); setStorageError(writeSavedRoutes(routes)); };
  const alreadySaved = Boolean(start && end && savedRoutes.some(r => r.start.row === start.row && r.start.col === start.col && r.end.row === end.row && r.end.col === end.col));
  const save = () => {
    if (!route || alreadySaved) return;
    persist([...savedRoutes, {
      id: crypto.randomUUID(), name: `Jezero traverse ${savedRoutes.length + 1}`,
      start, end, distanceKm: route.distanceKm, demo: route.demo, createdAt: new Date().toISOString(),
    }]);
  };
  const openSaved = saved => {
    invalidate(); navigate('planner');
    if (!terrain) { setStart(null); setEnd(null); setError('Wait for terrain to load, then reopen your saved route.'); return; }
    const valid = c => c.row < terrain.meta.height && c.col < terrain.meta.width && Number.isFinite(terrain.grid[c.row]?.[c.col]);
    if (!valid(saved.start) || !valid(saved.end)) { setStart(null); setEnd(null); setError('This saved route has endpoints outside the current valid terrain. Choose new points.'); return; }
    setStart(saved.start); setEnd(saved.end);
    run(saved.start, saved.end);
  };
  return <div className={`app-shell view-${view}`}>
    <div className="starfield" aria-hidden="true" />
    {view === 'home' ? <HomeView onOpen={() => navigate('planner')} /> : <>
      {terrain ? <TerrainMap terrain={terrain} start={start} end={end} route={route} hazards={hazards} opacity={opacity} onPick={pick} keyboardMode={keyboardMode} /> :
        <div className="map-placeholder"><Icon name="map" size={56} /><span>{terrainStatus === 'error' ? 'Jezero terrain unavailable' : 'Preparing your window into Jezero…'}</span></div>}
      <div className="study-label"><span className="status-dot" /> JEZERO CRATER <span>8 × 8 km study area</span>{route?.demo && <b className="sample-badge">Sample route</b>}</div>
      <aside className={`side-panel panel ${collapsed ? 'collapsed' : ''} ${route && view === 'planner' ? 'has-route' : ''}`} aria-label={view === 'saved' ? 'Saved routes' : 'Route planner'}>
        <button className="sheet-handle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{view === 'saved' ? 'Saved Routes' : 'Route Planner'}<Icon name="chevron" size={18} /></button>
        <div className="panel-scroll" inert={collapsed ? true : undefined}>
          {view === 'saved' ? <SavedRoutesPanel routes={savedRoutes} error={storageError} busy={busy} onSelect={openSaved} onDelete={id => persist(savedRoutes.filter(r => r.id !== id))} onOpen={() => navigate('planner')} /> :
            <><RoutePlannerPanel terrain={terrain} terrainStatus={terrainStatus} start={start} end={end} route={route} busy={busy} error={error} mode={mode} onCalculate={() => run()} onReset={reset} onSave={save} saved={alreadySaved} onRetry={() => refreshTerrain(true)} />{storageError && <p className="notice">{storageError}</p>}</>}
        </div>
      </aside>
      <HazardControls enabled={hazards} onToggle={() => setHazards(!hazards)} opacity={opacity} onOpacity={setOpacity} keyboardMode={keyboardMode} onKeyboard={() => setKeyboardMode(!keyboardMode)} disabled={!terrain} />
    </>}
    <ConditionsHeader conditions={conditions} status={conditionsStatus} onInfo={() => setInfo(true)} onHome={() => navigate('home')} />
    <NavigationRail view={view} onNavigate={navigate} onInfo={() => setInfo(true)} />
    {info && <InfoDialog onClose={() => setInfo(false)} />}
  </div>;
}
