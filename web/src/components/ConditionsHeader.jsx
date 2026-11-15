import { useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";

const number = (value, digits) => Number.isFinite(value) ? value.toFixed(digits) : "—";

export default function ConditionsHeader({ conditions, status, error }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  const infoButton = useRef(null);
  const ready = status === "ready";
  return (
    <header className="conditions-header" aria-label="Mars environmental conditions" aria-busy={status === "loading"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && infoOpen) {
          setInfoOpen(false);
          infoButton.current.focus();
        }
      }}>
      <svg className="header-crown" viewBox="0 0 624 118" preserveAspectRatio="none" aria-hidden="true">
        <path d="M10 55H145Q156 55 156 44V11Q156 1 167 1H457Q468 1 468 11V44Q468 55 479 55H614Q623 55 623 65V107Q623 117 613 117H11Q1 117 1 107V65Q1 55 10 55Z" />
      </svg>
      <div className="brand">
        <Icon name="planet" className="brand-icon" />
        <h1 aria-label="Mars Navigation System">Mars Nav System</h1>
      </div>
      {ready && conditions.isSample && <span className="sample-badge">SAMPLE DATA</span>}
      <button ref={infoButton} className="info-button" type="button" aria-label="About conditions data"
        aria-expanded={infoOpen} aria-controls={infoId} onClick={() => setInfoOpen((open) => !open)}>
        <Icon name="info" />
      </button>
      <dl className="conditions-metrics">
        <div><dt>Temperature °C</dt><dd>{ready ? number(conditions.temperatureC, 0) : "—"}</dd></div>
        <div><dt>ATM &amp; Density</dt><dd>
          {ready ? `${number(conditions.pressureMbar, 2)} mbar / ${number(conditions.densityKgM3, 3)} kg/m³` : "—"}
        </dd></div>
        <div><dt>Radiation Level</dt><dd>{ready && Number.isFinite(conditions.radiation) ? `${number(conditions.radiation, 2)} mSv/d` : "—"}</dd></div>
        <div><dt>Storm Percentage</dt><dd className={ready && conditions.storm === "LOW" ? "condition-low" : ""}>
          {ready ? conditions.storm || "—" : "—"}
        </dd></div>
      </dl>
      {status === "loading" && <p className="conditions-message" role="status">Loading conditions…</p>}
      {error && <p className="conditions-message conditions-error" role="alert">{error}</p>}
      <div id={infoId} className="conditions-info" hidden={!infoOpen}>
        <p>{ready ? conditions.source : "Environmental conditions"}</p>
        <p>{ready ? conditions.note || "Latest available conditions reading." : "Conditions are unavailable until a reading is loaded."}</p>
        {ready && <p>Sol {conditions.sol ?? "—"}. Density estimated for CO₂ from pressure and temperature.</p>}
      </div>
    </header>
  );
}
