export default function HazardControls({ enabled, onToggle, opacity, onOpacity, keyboardMode, onKeyboard, disabled }) {
  return <aside className="map-options panel" aria-label="Map layers and selection">
    <label className="toggle-label"><input type="checkbox" checked={enabled} onChange={onToggle} disabled={disabled} /><span className="toggle-track" /><span>Slope hazards</span></label>
    {enabled && <div className="hazard-legend">
      <div className="legend-classes"><span><i className="low" />&lt; 10°</span><span><i className="moderate" />10–20°</span><span><i className="high" />&gt; 20°</span></div>
      <p>No data: transparent</p>
      <label className="opacity-label">Opacity <input type="range" min="0.15" max="0.85" step="0.05" value={opacity} onChange={e => onOpacity(Number(e.target.value))} /><span>{Math.round(opacity * 100)}%</span></label>
      <p>Project-defined slope thresholds, not NASA safety limits.</p>
    </div>}
    <label className="keyboard-option"><input type="checkbox" checked={keyboardMode} onChange={onKeyboard} disabled={disabled} /> Keyboard point selection</label>
    {keyboardMode && <p className="keyboard-help">Focus the map. Arrow keys pan, +/− zoom, Enter selects the centre crosshair.</p>}
  </aside>;
}
