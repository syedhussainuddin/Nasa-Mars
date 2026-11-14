import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, ImageOverlay, Rectangle, Marker, Tooltip, Polyline, Pane, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { cellToLatLon, gridBoundsLatLon } from '../routing/coordinates.js';

const icon = (destination = false) => L.divIcon({
  className: 'endpoint-map-icon', html: `<span class="map-pin ${destination ? 'end' : 'start'}">${destination ? 'D' : 'S'}</span>`,
  iconSize: [34, 34], iconAnchor: [17, 17],
});
const startIcon = icon(), endIcon = icon(true);
const point = (cell, meta) => { const p = cellToLatLon(cell, meta); return [p.lat, p.lon]; };

function MapControls({ terrain, route, onPick, keyboardMode }) {
  const map = useMap();
  useMapEvents({ click: e => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  useEffect(() => {
    const bounds = gridBoundsLatLon(terrain.meta);
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
    map.setMaxBounds(L.latLngBounds(bounds).pad(0.6));
    map.setMinZoom(map.getBoundsZoom(L.latLngBounds(bounds)) - 1);
  }, [map, terrain]);
  useEffect(() => {
    if (!route) return;
    const points = route.cells.map(cell => point(cell, terrain.meta));
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: mobile ? [25, 130] : [450, 190],
      paddingBottomRight: mobile ? [90, Math.min(window.innerHeight * 0.43, 330)] : [100, 110],
      maxZoom: 17, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }, [route, map, terrain]);
  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute('aria-label', 'Jezero terrain map. Arrow keys pan; plus and minus zoom. Enable keyboard point selection to select the centre with Enter.');
    const handler = event => {
      if (keyboardMode && event.key === 'Enter') {
        event.preventDefault();
        const centre = map.getCenter();
        onPick({ lat: centre.lat, lon: centre.lng });
      }
    };
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  }, [map, keyboardMode, onPick]);
  return null;
}

export default function TerrainMap({ terrain, start, end, route, hazards, opacity, onPick, keyboardMode }) {
  const bounds = useMemo(() => gridBoundsLatLon(terrain.meta), [terrain]);
  const positions = useMemo(() => route?.cells.map(cell => point(cell, terrain.meta)) || [], [route, terrain]);
  return <div className="terrain-map">
    <MapContainer crs={L.CRS.Simple} bounds={bounds} zoomControl={false} attributionControl={false} zoomSnap={0.25} maxZoom={20} keyboard>
      <MapControls terrain={terrain} route={route} onPick={onPick} keyboardMode={keyboardMode} />
      <ImageOverlay url={terrain.terrainUrl} bounds={bounds} pane="tilePane" />
      <Pane name="hazards" style={{ zIndex: 350, pointerEvents: 'none' }}>
        {hazards && <ImageOverlay url={terrain.slopeUrl} bounds={bounds} opacity={opacity} />}
      </Pane>
      <Rectangle bounds={bounds} pathOptions={{ color: '#f5cd48', weight: 1, dashArray: '7 7', fill: false, opacity: 0.65 }} interactive={false} />
      {positions.length > 0 && <><Polyline positions={positions} pathOptions={{ color: '#4e2a14', weight: 9, opacity: 0.8 }} interactive={false} /><Polyline positions={positions} pathOptions={{ color: '#ffe174', weight: 4, opacity: 1 }} interactive={false} /></>}
      {start && <Marker position={point(start, terrain.meta)} icon={startIcon}><Tooltip permanent direction="top" offset={[0, -18]}>Start</Tooltip></Marker>}
      {end && <Marker position={point(end, terrain.meta)} icon={endIcon}><Tooltip permanent direction="top" offset={[0, -18]}>Destination</Tooltip></Marker>}
      <ZoomControl position="bottomright" />
    </MapContainer>
    {keyboardMode && <div className="map-crosshair" aria-hidden="true">+</div>}
    <div className="terrain-attribution">HiRISE / USGS · {terrain.meta.cell_size.x} m derived elevation raster · Mars</div>
  </div>;
}
