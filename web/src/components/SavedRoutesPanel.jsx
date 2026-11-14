import Icon from './Icon.jsx';

export default function SavedRoutesPanel({ routes, onSelect, onDelete, onOpen, error, busy }) {
  return <>
    <div className="panel-title"><h1>Saved Routes</h1><span className="count-badge">{routes.length}</span></div>
    <p className="panel-description">Your next steps, kept close.</p>
    {error && <div className="notice" role="status">{error}</div>}
    {!routes.length ? <div className="empty-state"><Icon name="star" size={32} /><h2>A new horizon awaits.</h2><p>Calculate a traverse and save it here to revisit your endpoints.</p><button className="primary" onClick={onOpen}>Plan your first route <Icon name="arrow" size={16} /></button></div>
      : <ul className="saved-list">{routes.map(route => <li key={route.id}>
        <button className="saved-entry" onClick={() => onSelect(route)} disabled={busy}><strong>{route.name}</strong><span>Start <Icon name="arrow" size={15} /> Destination <b>{route.distanceKm.toFixed(2)} km</b></span><small>{route.demo ? 'Sample traverse' : 'Terrain route'} · {new Date(route.createdAt).toLocaleDateString()}</small></button>
        <button className="delete-button" onClick={() => onDelete(route.id)} aria-label={`Delete ${route.name}`} title="Delete saved route"><Icon name="trash" size={17} /></button>
      </li>)}</ul>}
    <p className="muted storage-note">Stored on this device. Opening a route recalculates it from its saved endpoint cells.</p>
  </>;
}
