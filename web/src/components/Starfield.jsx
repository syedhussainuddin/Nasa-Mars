// Deterministic coordinates prevent flicker on state updates and StrictMode renders.
const stars = Array.from({ length: 650 }, (_, index) => {
  const seed = index + 1;
  const random = (factor) => {
    const value = Math.sin(seed * factor) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    x: random(12.9898) * 1440,
    y: random(78.233) * 1024,
    radius: 0.35 + random(39.425) * 0.9,
    opacity: 0.15 + random(5.398) * 0.6,
  };
});

export default function Starfield() {
  return (
    <svg className="starfield" viewBox="0 0 1440 1024" preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" focusable="false">
      {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} opacity={star.opacity} />)}
    </svg>
  );
}
