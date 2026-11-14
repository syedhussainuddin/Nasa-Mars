import Icon from './Icon.jsx';

export default function NavigationRail({ view, onNavigate, onInfo }) {
  return <nav className="navigation-rail" aria-label="Mission navigation">
    {[['planner', 'pin', 'Open Jezero Planner'], ['saved', 'star', 'Saved routes'], ['home', 'globe', 'Home']].map(([target, icon, label]) =>
      <button key={target} className={view === target ? 'active' : ''} onClick={() => onNavigate(target)} title={label} aria-label={label} aria-current={view === target ? 'page' : undefined}><Icon name={icon} /></button>)}
    <button onClick={onInfo} title="Data and mission information" aria-label="Data and mission information"><Icon name="info" /></button>
  </nav>;
}
