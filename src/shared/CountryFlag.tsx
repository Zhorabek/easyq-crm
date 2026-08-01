import type { CountryCode } from './phone';

// Country flags as SVG, plus a globe for "not identified yet".
//
// DUPLICATED, keep in sync (same rule as phone.ts, which it sits beside):
//   easyq-crm/src/shared/CountryFlag.tsx        <- source of truth
//   easyq-landing/src/components/CountryFlag.tsx
//
// ## Why not the flag emoji
//
// `String.fromCodePoint` over a pair of regional-indicator letters gives a flag for any country
// in one line and no assets, which is why the phone input started out using it. It has one
// fatal problem: **Windows does not render flag emoji at all.** Every version through Windows 11
// draws the two letters — "UZ", "RU" — in a box instead of a flag. So the majority of desktop
// visitors saw a lettered rectangle where the design said flag, and it looked like a broken
// glyph rather than a deliberate choice. Android and iOS render them, which is exactly what
// makes the bug easy to miss while building.
//
// Emoji also inherit whatever the platform font decides — size, baseline, corner radius, level
// of detail — so the same field looks different on every device, next to UI that is otherwise
// tightly controlled.
//
// These are drawn instead: identical everywhere, sized in px like the rest of the icons, and
// crisp at any zoom.
//
// ## The set is deliberately small
//
// Only the countries in PHONE_COUNTRIES are drawn. There are ~250 flags and no honest way to
// ship them all inline; anything outside the list falls back to the globe, which is the same
// thing shown while the prefix is still ambiguous. That is not a gap to fill later — a phone
// field's job is to say "we recognised this", and the globe says it truthfully for the long
// tail. If a country starts mattering, add it here.
//
// Emblem-heavy flags (the Kazakh eagle, the Korean trigrams, the American stars) are simplified
// to what reads at 18px. A faithful one would be invisible detail and many times the bytes.

const RADIUS = 2.5;

/** Every flag is drawn on this box and clipped to the same rounded rectangle. */
const W = 24;
const H = 18;

function Crescent({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  // Two discs: the second is the field colour and bites the first. Drawn as a mask rather than
  // a path so the shape stays right at any size.
  const id = `cm-${cx}-${cy}-${r}`.replace(/\./g, '_');
  return (
    <>
      <mask id={id}>
        <rect x="0" y="0" width={W} height={H} fill="#fff" />
        <circle cx={cx + r * 0.42} cy={cy} r={r * 0.82} fill="#000" />
      </mask>
      <circle cx={cx} cy={cy} r={r} fill={fill} mask={`url(#${id})`} />
    </>
  );
}

function Star({ cx, cy, r, fill = '#fff' }: { cx: number; cy: number; r: number; fill?: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
  return <polygon points={points} fill={fill} />;
}

function SunRays({ cx, cy, r, fill, count = 16 }: { cx: number; cy: number; r: number; fill: string; count?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      {Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count;
        return (
          <line
            key={i}
            x1={cx + Math.cos(angle) * r * 1.15}
            y1={cy + Math.sin(angle) * r * 1.15}
            x2={cx + Math.cos(angle) * r * 1.75}
            y2={cy + Math.sin(angle) * r * 1.75}
            stroke={fill}
            strokeWidth={0.5}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

/** Horizontal bands, top to bottom, in equal thirds unless heights are given. */
function Bands({ colors, heights }: { colors: string[]; heights?: number[] }) {
  let y = 0;
  return (
    <>
      {colors.map((color, i) => {
        const h = heights ? heights[i]! : H / colors.length;
        const rect = <rect key={i} x="0" y={y} width={W} height={h} fill={color} />;
        y += h;
        return rect;
      })}
    </>
  );
}

const FLAGS: Partial<Record<CountryCode, () => JSX.Element>> = {
  UZ: () => (
    <>
      <Bands colors={['#0099B5', '#fff', '#1EB53A']} />
      <rect x="0" y={H / 3 - 0.5} width={W} height="1" fill="#CE1126" />
      <rect x="0" y={(H / 3) * 2 - 0.5} width={W} height="1" fill="#CE1126" />
      <Crescent cx={4.6} cy={3} r={1.9} fill="#fff" />
      {[[8.2, 1.6], [10.6, 1.6], [8.2, 3.6], [10.6, 3.6], [13, 3.6]].map(([x, y], i) => (
        <Star key={i} cx={x!} cy={y!} r={0.72} />
      ))}
    </>
  ),
  RU: () => <Bands colors={['#fff', '#0039A6', '#D52B1E']} />,
  KZ: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#00AFCA" />
      <SunRays cx={12} cy={7.6} r={2.7} fill="#FEC50C" />
      <path d="M8.4 12.4c1.4-1.1 2.5-1.1 3.6-.2 1.1-.9 2.2-.9 3.6.2-1.2-.3-2.3-.1-3.6.7-1.3-.8-2.4-1-3.6-.7Z" fill="#FEC50C" />
    </>
  ),
  KG: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#E8112D" />
      <SunRays cx={12} cy={9} r={3.1} fill="#FFEF00" count={20} />
    </>
  ),
  TJ: () => (
    <>
      <Bands colors={['#CC0000', '#fff', '#006600']} heights={[5.4, 7.2, 5.4]} />
      <Star cx={12} cy={9} r={2.1} fill="#F8C300" />
    </>
  ),
  TM: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#28AE66" />
      <rect x="4.2" y="0" width="3.4" height={H} fill="#B5121B" />
      <rect x="4.2" y="0" width="3.4" height={H} fill="#fff" opacity="0.18" />
      <Crescent cx={13.4} cy={5.2} r={2} fill="#fff" />
      {[[17.2, 3.1], [18.4, 5.1], [17.6, 7.2]].map(([x, y], i) => (
        <Star key={i} cx={x!} cy={y!} r={0.72} />
      ))}
    </>
  ),
  AZ: () => (
    <>
      <Bands colors={['#00B5E2', '#EF3340', '#509E2F']} />
      <Crescent cx={11.2} cy={9} r={2.4} fill="#fff" />
      <Star cx={15} cy={9} r={1.3} />
    </>
  ),
  TR: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#E30A17" />
      <Crescent cx={9.6} cy={9} r={3.2} fill="#fff" />
      <Star cx={14.4} cy={9} r={1.6} />
    </>
  ),
  AE: () => (
    <>
      <Bands colors={['#00732F', '#fff', '#000']} />
      <rect x="0" y="0" width="6.4" height={H} fill="#FF0000" />
    </>
  ),
  US: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {[0, 2, 4, 6].map((i) => (
        <rect key={i} x="0" y={(i * H) / 7} width={W} height={H / 7} fill="#B22234" />
      ))}
      <rect x="0" y="0" width="10" height={(H / 7) * 4} fill="#3C3B6E" />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={1.6 + (i % 3) * 3.2} cy={2 + Math.floor(i / 3) * 2.6} r="0.55" fill="#fff" />
      ))}
    </>
  ),
  GB: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#012169" />
      <path d={`M0 0 L${W} ${H} M${W} 0 L0 ${H}`} stroke="#fff" strokeWidth="3.6" />
      <path d={`M0 0 L${W} ${H} M${W} 0 L0 ${H}`} stroke="#C8102E" strokeWidth="1.8" />
      <path d={`M${W / 2} 0 V${H} M0 ${H / 2} H${W}`} stroke="#fff" strokeWidth="6" />
      <path d={`M${W / 2} 0 V${H} M0 ${H / 2} H${W}`} stroke="#C8102E" strokeWidth="3.4" />
    </>
  ),
  DE: () => <Bands colors={['#000', '#DD0000', '#FFCE00']} />,
  KR: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      <path d="M8.5 9a3.5 3.5 0 0 1 7 0 1.75 1.75 0 0 0-3.5 0 1.75 1.75 0 0 1-3.5 0Z" fill="#CD2E3A" />
      <path d="M8.5 9a3.5 3.5 0 0 0 7 0 1.75 1.75 0 0 1-3.5 0 1.75 1.75 0 0 0-3.5 0Z" fill="#0047A0" />
      {[[3.4, 4.2], [3.4, 13.8], [20.6, 4.2], [20.6, 13.8]].map(([x, y], i) => (
        <g key={i} fill="#000">
          <rect x={x! - 1.7} y={y! - 1.1} width="3.4" height="0.62" />
          <rect x={x! - 1.7} y={y! - 0.31} width="3.4" height="0.62" />
          <rect x={x! - 1.7} y={y! + 0.48} width="3.4" height="0.62" />
        </g>
      ))}
    </>
  ),
  CN: () => (
    <>
      <rect x="0" y="0" width={W} height={H} fill="#DE2910" />
      <Star cx={4.6} cy={4.6} r={2.4} fill="#FFDE00" />
      {[[8.8, 1.9], [10.6, 3.7], [10.6, 6.2], [8.8, 7.9]].map(([x, y], i) => (
        <Star key={i} cx={x!} cy={y!} r={0.86} fill="#FFDE00" />
      ))}
    </>
  ),
};

/**
 * A globe, for a prefix that has not identified a country yet.
 *
 * Shown for a bare `+7` — Russia and Kazakhstan both — and for any country outside the drawn
 * set. Stroked in `currentColor` so it inherits the field's own text colour rather than fighting
 * whatever brand the tenant has picked.
 */
function Globe({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </svg>
  );
}

/**
 * The flag for a country, or a globe when there isn't one to show.
 *
 * `size` is the WIDTH; flags are 4:3 and the globe is square, so both end up optically similar
 * on a row of text.
 */
export function CountryFlag({ country, size = 18 }: { country?: CountryCode | null; size?: number }) {
  const draw = country ? FLAGS[country] : undefined;
  if (!draw) return <Globe size={size * 0.86} />;

  const id = `flagclip-${country}`;
  return (
    <svg
      width={size}
      height={(size * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ display: 'block', borderRadius: RADIUS, overflow: 'hidden' }}
    >
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={W} height={H} rx={RADIUS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {draw()}
        {/* A hairline edge, so a white or very pale flag still reads as an object on a white field. */}
        <rect x="0.25" y="0.25" width={W - 0.5} height={H - 0.5} rx={RADIUS} fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
