export default function Icon({ name, ...props }) {
  const paths = {
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="4" /></>,
    star: <path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1 2 9.3l6.9-1L12 2Z" />,
    map: <><path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Z" /><path d="M9 2v17m6-14v17M6 15l3-4 4 2 5-6m-3 0h3v3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    planet: <><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" /><ellipse cx="12" cy="13" rx="12" ry="4" transform="rotate(-30 12 13)" /><path d="m16 4 3 1-1 3" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
