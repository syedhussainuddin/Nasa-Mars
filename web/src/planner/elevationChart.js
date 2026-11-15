export function elevationChart(profile) {
  if (!Array.isArray(profile) || !profile.length ||
      !profile.every((point, index) => Number.isFinite(point.elevationM) &&
        Number.isFinite(point.distanceKm) && point.distanceKm >= 0 &&
        (!index || point.distanceKm >= profile[index - 1].distanceKm))) return null;
  const plot = { left: 42, right: 312, top: 28, bottom: 146 };
  let minimum = Infinity, maximum = -Infinity;
  for (const point of profile) {
    minimum = Math.min(minimum, point.elevationM);
    maximum = Math.max(maximum, point.elevationM);
  }
  const padding = Math.max(1, (maximum - minimum) * 0.1);
  const low = minimum - padding, high = maximum + padding;
  const distance = profile.at(-1).distanceKm;
  const x = (value) => plot.left + value / (distance || 1) * (plot.right - plot.left);
  const y = (value) => plot.bottom - (value - low) / (high - low) * (plot.bottom - plot.top);
  return {
    plot, distance,
    path: profile.map((point, index) => `${index ? "L" : "M"}${x(point.distanceKm).toFixed(2)} ${y(point.elevationM).toFixed(2)}`).join(" "),
    point: profile.length === 1 ? { x: x(profile[0].distanceKm), y: y(profile[0].elevationM) } : null,
    xTicks: distance ? Array.from({ length: 5 }, (_, index) => ({ x: x(distance * index / 4), value: distance * index / 4 })) : [{ x: plot.left, value: 0 }],
    yTicks: Array.from({ length: 5 }, (_, index) => {
      const value = low + (high - low) * index / 4;
      return { y: y(value), value };
    }),
  };
}
