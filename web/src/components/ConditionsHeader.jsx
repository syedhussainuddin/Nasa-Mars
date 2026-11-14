import Icon from './Icon.jsx';

export default function ConditionsHeader({ conditions, status, onInfo, onHome }) {
  const display = (v, suffix = '') => v === null || v === undefined ? 'Unavailable' : `${v}${suffix}`;
  return <header className="conditions-header">
    <div className="header-crown">
      <button className="brand" onClick={onHome} aria-label="Mars Nav System home"><Icon name="globe" size={32} /><span>Mars Nav System</span></button>
      <button className="info-button" onClick={onInfo} title="About the data" aria-label="About terrain and conditions"><Icon name="info" size={15} /></button>
    </div>
    <div className="conditions-body">
      <div><strong>Temperature</strong><span>{display(conditions?.temperature, ' °C')}</span></div>
      <div><strong>Pressure</strong><span>{display(conditions?.pressure, ` ${conditions?.pressureUnit || 'Pa'}`)}</span></div>
      <div><strong>Sol</strong><span>{display(conditions?.sol)}</span></div>
      <div className="source-reading"><strong>Source {conditions?.sample && <span className="sample-badge">Sample data</span>}</strong><span title={conditions?.source}>{status === 'loading' ? 'Loading conditions…' : status === 'error' ? 'Conditions unavailable' : conditions?.source}</span></div>
    </div>
  </header>;
}
