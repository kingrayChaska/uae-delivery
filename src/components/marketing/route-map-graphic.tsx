// Original SVG illustration — no stock imagery, per the brief's own
// instruction to avoid generic photography for the hero. Depicts the
// literal product moment (a live route between pickup and drop-off) rather
// than an abstract decorative graphic, and its route-line motif is reused
// (not just repeated) in the How It Works and Live Tracking sections below.
const RouteMapGraphic = () => {
  return (
    <svg
      viewBox="0 0 560 460"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      role="img"
      aria-label="A live delivery route from pickup to drop-off, with the driver partway along and the shipment's tracking ID"
    >
      {/* Faint road grid — evokes a dispatch map without being literal streets */}
      <g stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1">
        <line x1="0" y1="90" x2="560" y2="90" />
        <line x1="0" y1="190" x2="560" y2="190" />
        <line x1="0" y1="290" x2="560" y2="290" />
        <line x1="0" y1="390" x2="560" y2="390" />
        <line x1="120" y1="0" x2="120" y2="460" />
        <line x1="280" y1="0" x2="280" y2="460" />
        <line x1="440" y1="0" x2="440" y2="460" />
      </g>

      {/* Route path from pickup to drop-off */}
      <path
        d="M 96 118 C 180 118, 168 232, 260 236 S 392 220, 420 300 S 400 372, 468 372"
        stroke="var(--brand-signal)"
        strokeWidth="3"
        strokeDasharray="2 10"
        strokeLinecap="round"
        className="route-dash"
      />

      {/* Pickup pin */}
      <g transform="translate(96 118)">
        <circle r="20" fill="var(--brand-route)" fillOpacity="0.25" />
        <circle r="7" fill="var(--brand-paper)" />
      </g>
      <text
        x="96"
        y="152"
        textAnchor="middle"
        fill="var(--brand-paper)"
        fillOpacity="0.75"
        fontSize="13"
        fontFamily="var(--brand-font-mono)"
      >
        PICKUP
      </text>

      {/* Drop-off pin */}
      <g transform="translate(468 372)">
        <circle r="20" fill="var(--brand-signal)" fillOpacity="0.25" />
        <circle r="7" fill="var(--brand-signal)" />
      </g>
      <text
        x="468"
        y="406"
        textAnchor="middle"
        fill="var(--brand-paper)"
        fillOpacity="0.75"
        fontSize="13"
        fontFamily="var(--brand-font-mono)"
      >
        DROP-OFF
      </text>

      {/* Driver marker. Static at the midpoint by default; globals.css moves
          it along the route (offset-path) unless reduced motion is on. */}
      <g transform="translate(292 246)" className="route-driver">
        <circle r="17" fill="var(--brand-paper)" />
        <path
          d="M -8 3 L -8 -3 L -3 -3 L 0 -6 L 6 -6 L 6 3 Z M -6 3 a2.3 2.3 0 1 0 4.6 0 a2.3 2.3 0 1 0 -4.6 0 M 2 3 a2.3 2.3 0 1 0 4.6 0 a2.3 2.3 0 1 0 -4.6 0"
          fill="var(--brand-route-deep)"
        />
      </g>

      {/* Status readout card */}
      <g transform="translate(280 36)">
        <rect width="248" height="80" rx="4" fill="var(--brand-paper)" fillOpacity="0.08" />
        <rect x="0.5" y="0.5" width="247" height="79" rx="3.5" stroke="var(--brand-paper)" strokeOpacity="0.18" />

        <circle cx="20" cy="22" r="4" fill="var(--brand-signal)" />
        <text x="32" y="26" fill="var(--brand-paper)" fontSize="11" fontFamily="var(--brand-font-mono)" fillOpacity="0.65" letterSpacing="0.5">
          IN TRANSIT
        </text>

        <line x1="0" y1="42" x2="248" y2="42" stroke="var(--brand-paper)" strokeOpacity="0.12" />
        <line x1="124" y1="52" x2="124" y2="70" stroke="var(--brand-paper)" strokeOpacity="0.12" />

        <text x="20" y="58" fill="var(--brand-paper)" fontSize="10" fontFamily="var(--brand-font-mono)" fillOpacity="0.55">
          TRACKING ID
        </text>
        <text x="20" y="74" fill="var(--brand-paper)" fontSize="17" fontFamily="var(--brand-font-mono)" fontWeight="500" letterSpacing="1.5">
          PL7K29X4
        </text>

        <text x="144" y="58" fill="var(--brand-paper)" fontSize="10" fontFamily="var(--brand-font-mono)" fillOpacity="0.55">
          DISTANCE
        </text>
        <text x="144" y="74" fill="var(--brand-paper)" fontSize="17" fontFamily="var(--brand-font-mono)" fontWeight="500">
          14.6 km
        </text>
      </g>
    </svg>
  );
};

export default RouteMapGraphic;
