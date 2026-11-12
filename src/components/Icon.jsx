// Iconos SVG propios (24x24). "fill" = relleno; el resto son de trazo.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const F = { fill: 'currentColor' }

const ICONS = {
  play: <path {...F} d="M7 4v16l13-8z" />,
  pause: <path {...F} d="M6 4h4v16H6zM14 4h4v16h-4z" />,
  next: <path {...F} d="M5 4l11 8-11 8zM17 4h2.500v16H17z" />,
  prev: <path {...F} d="M19 4L8 12l11 8zM4.500 4H7v16H4.500z" />,
  shuffle: <path {...S} d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  repeat: <path {...S} d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />,
  heart: <path {...S} d="M20.800 4.600a5.500 5.500 0 00-7.800 0L12 5.700l-1-1.100a5.500 5.500 0 00-7.800 7.800l1 1.100L12 21.200l7.800-7.700 1-1.100a5.500 5.500 0 000-7.800z" />,
  heartFill: <path {...F} d="M20.800 4.600a5.500 5.500 0 00-7.800 0L12 5.700l-1-1.100a5.500 5.500 0 00-7.800 7.800l1 1.100L12 21.200l7.800-7.700 1-1.100a5.500 5.500 0 000-7.800z" />,
  volume: <><path {...F} d="M11 5L6 9H2v6h4l5 4z" /><path {...S} d="M15.500 8.500a5 5 0 010 7M19 5a10 10 0 010 14" /></>,
  mute: <><path {...F} d="M11 5L6 9H2v6h4l5 4z" /><path {...S} d="M22 9l-6 6M16 9l6 6" /></>,
  search: <><circle {...S} cx="11" cy="11" r="7" /><path {...S} d="M20 20l-4-4" /></>,
  home: <path {...S} d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" />,
  homeFill: <path {...F} d="M12 2.500L2.500 9.800V20a1.500 1.500 0 001.500 1.500h5.500v-7h5v7H20a1.500 1.500 0 001.500-1.500V9.800z" />,
  library: <path {...S} d="M4 3v18M9 3v18M14.500 4.500l5 16" />,
  plus: <path {...S} d="M12 5v14M5 12h14" />,
  queue: <path {...S} d="M3 6h18M3 12h18M3 18h11" />,
  dots: <><circle {...F} cx="5" cy="12" r="1.800" /><circle {...F} cx="12" cy="12" r="1.800" /><circle {...F} cx="19" cy="12" r="1.800" /></>,
  clock: <><circle {...S} cx="12" cy="12" r="9" /><path {...S} d="M12 7v5l3 2" /></>,
  x: <path {...S} d="M18 6L6 18M6 6l12 12" />,
  sync: <path {...S} d="M22 4v6h-6M2 20v-6h6M4 9a8.500 8.500 0 0114-3l4 4M2 14l4 4a8.500 8.500 0 0014-3" />,
  settings: <path {...S} d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  check: <path {...S} d="M20 6L9 17l-5-5" />,
  music: <><path {...S} d="M9 18V5l12-2v13" /><circle {...S} cx="6" cy="18" r="3" /><circle {...S} cx="18" cy="16" r="3" /></>,
  back: <path {...S} d="M15 18l-6-6 6-6" />,
  forward: <path {...S} d="M9 18l6-6-6-6" />,
  trash: <path {...S} d="M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3" />,
  logout: <path {...S} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  alert: <><circle {...S} cx="12" cy="12" r="9" /><path {...S} d="M12 8v5M12 16.500v.010" /></>,
}

export default function Icon({ name, size = 20, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  )
}
