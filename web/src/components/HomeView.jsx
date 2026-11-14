import Icon from './Icon.jsx';

export default function HomeView({ onOpen }) {
  return <section className="home-view" aria-label="Mars mission overview">
    <div className="orbital-label"><span className="status-dot" /> MARS EXPLORATION / JEZERO CRATER</div>
    <div className="mars-scene">
      <div className="mars-globe" role="img" aria-label="Stylized procedural orange Mars globe">
        <svg className="globe-texture" viewBox="0 0 600 600" aria-hidden="true">
          <defs>
            <filter id="terrain-noise" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency=".012 .018" numOctaves="6" seed="27" />
              <feColorMatrix type="matrix" values="1.1 0 0 0 .13  0 .38 0 0 .015  0 0 .1 0 0  0 0 0 1 0" />
              <feComponentTransfer><feFuncR type="gamma" amplitude="1.3" exponent="1.7" offset="0" /></feComponentTransfer>
            </filter>
            <filter id="fine-noise">
              <feTurbulence type="fractalNoise" baseFrequency=".065" numOctaves="4" seed="15" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer><feFuncR type="gamma" amplitude="1.5" exponent="2.4" /><feFuncG type="gamma" amplitude="1.5" exponent="2.4" /><feFuncB type="gamma" amplitude="1.5" exponent="2.4" /></feComponentTransfer>
            </filter>
            <radialGradient id="crater"><stop offset=".6" stopColor="#4e190a" stopOpacity=".25" /><stop offset=".85" stopColor="#2e0c05" stopOpacity=".5" /><stop offset="1" stopColor="#ffac60" stopOpacity=".4" /></radialGradient>
          </defs>
          <rect width="600" height="600" filter="url(#terrain-noise)" />
          {[[130, 290, 24], [430, 214, 40], [330, 450, 36], [245, 130, 19], [465, 375, 22], [210, 365, 13], [340, 210, 16], [125, 435, 12], [380, 95, 18]].map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} fill="url(#crater)" opacity=".45" />)}
          <rect width="600" height="600" filter="url(#fine-noise)" style={{ mixBlendMode: 'multiply', opacity: .7 }} />
        </svg>
        <div className="globe-shading" />
        <div className="globe-location jezero"><span className="planet-pin" /><span>Jezero Crater<small>LOCAL STUDY AREA</small></span></div>
        <div className="globe-location reference-one"><span className="planet-pin" /><span>Viking 1<small>REFERENCE LOCATION</small></span></div>
        <div className="globe-location reference-two"><span className="planet-pin" /><span>Pathfinder<small>REFERENCE LOCATION</small></span></div>
      </div>
    </div>
    <div className="home-intro panel">
      <span className="eyebrow">YOUR NEXT TRAVERSE</span>
      <h1>A little closer<br />{' '}to the red planet.</h1>
      <p>Explore the terrain. Understand the slopes. Plan a traverse across our 8 × 8 km Jezero Crater study area.</p>
      <button className="primary" onClick={onOpen}>Open Jezero Planner <Icon name="arrow" size={17} /></button>
      <small>Globe locations are illustrative, not routing endpoints.</small>
    </div>
    <div className="home-footer"><span>04° / MISSION PLANNING</span><span>ONE SMALL PATCH. A WORLD TO EXPLORE.</span></div>
  </section>;
}
