/**
 * Decorative route drawn behind the home hero. Same drawing as the mockup, colored with tokens.
 * The mockup's #333B48 has no token: it uses inverse-line like the other map lines.
 * In Arabic the whole drawing is mirrored, as in Main-AR.
 */
export function HeroRouteMap() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full rtl:-scale-x-100"
      viewBox="0 0 1440 660"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth="2" className="stroke-inverse-line">
        <path d="M620 -10 C700 120 690 250 760 360 S860 560 850 680" />
        <path d="M780 -10 C820 110 900 170 1000 210 S1240 260 1460 220" />
        <path d="M1100 -10 C1080 110 1110 220 1170 330 S1270 560 1260 680" />
        <path d="M600 140 C760 180 940 310 1120 330 S1340 340 1460 390" />
        <path d="M640 330 C780 380 900 420 1030 500 S1240 610 1300 680" />
        <path d="M1320 -10 C1300 120 1360 250 1460 300" />
        <path d="M930 -10 C910 70 930 140 990 210" />
        <path d="M700 680 C760 590 860 520 1030 500" />
      </g>
      <g fill="none" strokeWidth="1.5" className="stroke-inverse-line">
        <path d="M700 60 L880 130 M820 250 L1000 210 M890 330 L900 420 M1010 330 L1030 500 M1170 330 L1120 500 M1250 240 L1270 370 M1340 90 L1250 240 M760 470 L900 420" />
      </g>
      <path
        d="M770 395 C860 430 900 420 1030 500 S1190 590 1250 600"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-orange"
      />
      <path
        d="M770 395 C740 382 712 372 690 362"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1 10"
        className="stroke-orange"
      />
      <circle cx="690" cy="362" r="9" strokeWidth="3" className="fill-inverse stroke-white" />
      <circle cx="1250" cy="600" r="11" className="fill-white" />
      <circle cx="1250" cy="600" r="4.5" className="fill-orange" />
      <circle r="9" strokeWidth="3" className="hz-dot fill-orange stroke-white" />
    </svg>
  );
}
