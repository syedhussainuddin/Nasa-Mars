import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function InfoDialog({ onClose }) {
  const ref = useRef();
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="info-dialog panel" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-content">
      <div className="panel-title"><h1>Know the terrain.</h1><button className="icon-button" onClick={onClose} aria-label="Close information"><Icon name="close" /></button></div>
      <p className="eyebrow">MARS NAV SYSTEM / DATA NOTES</p>
      <h2>A local window into Jezero</h2>
      <p>This planner covers an approximately 8 × 8 km patch, not the whole planet. Elevation comes from the USGS HiRISE stereo DTM mosaic aligned to MOLA, averaged to 16 m cells. The globe and global labels are illustrative.</p>
      <h2>Terrain has uncertainty</h2>
      <p>Stereo noise can exaggerate slopes. Seams, block artifacts, smoothing and vertical offsets exist. The slope layer is a finite-difference estimate from this grid; it does not detect every obstacle.</p>
      <p><strong>Project-defined slope thresholds, not NASA safety limits.</strong> Green &lt;10°, yellow 10–20°, red &gt;20°. “Estimated terrain risk” is a project classification, not a declaration of safety or NASA approval.</p>
      <h2>Conditions are not live</h2>
      <p>The bundled readings are illustrative sample data. Sol is a Martian day identifier; it does not imply a current observation. Unavailable readings are never substituted with live-looking values.</p>
      <h2>Honest sample routes</h2>
      <p>Until a contributor supplies the routing module, Demo mode draws a deterministic L-shaped sample traverse. It uses real cell elevations for its metrics, but does not search for a route or avoid hazards. Saved routes store only endpoints and lightweight metadata on this device.</p>
      <a href="https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic" target="_blank" rel="noreferrer">Terrain dataset & provenance ↗</a>
      <button className="primary" onClick={onClose}>Back to exploring</button>
    </div>
  </dialog>;
}
