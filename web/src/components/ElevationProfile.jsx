import { useId } from "react";
import { elevationChart } from "../planner/elevationChart.js";

const tick = (value) => Number(value.toFixed(2)).toString();

export default function ElevationProfile({ profile }) {
  const titleId = useId();
  const chart = elevationChart(profile);
  return (
    <svg className="elevation-chart" viewBox="0 0 322 182" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{chart ? "Route elevation profile" : "No elevation data available"}</title>
      <text className="chart-axis-title" x="7" y="13">Elevation (m)</text>
      <text className="chart-axis-title" x="177" y="178" textAnchor="middle">Distance (Km)</text>
      {chart ? (
        <>
          {chart.yTicks.map(({ y, value }, index) => (
            <g key={index}>
              <line className="chart-grid" x1={chart.plot.left} x2={chart.plot.right} y1={y} y2={y} />
              <text className="chart-tick" x={chart.plot.left - 7} y={y + 3} textAnchor="end">{Math.round(value)}</text>
            </g>
          ))}
          {chart.xTicks.map(({ x, value }, index) => (
            <g key={index}>
              <line className="chart-grid" x1={x} x2={x} y1={chart.plot.top} y2={chart.plot.bottom} />
              <text className="chart-tick" x={x} y={chart.plot.bottom + 15} textAnchor="middle">{tick(value)}</text>
            </g>
          ))}
          <path className="chart-axes" d={`M${chart.plot.left} ${chart.plot.top}V${chart.plot.bottom}H${chart.plot.right}`} />
          <path className="elevation-line" d={chart.path} />
          {chart.point && <circle className="elevation-point" cx={chart.point.x} cy={chart.point.y} r="2" />}
        </>
      ) : <text className="chart-empty" x="161" y="90" textAnchor="middle">No elevation data available.</text>}
    </svg>
  );
}
