/** Tiny inline-SVG sparkline. Server component — no interactivity. */
export function Sparkline({
  values,
  width = 220,
  height = 44,
  invert = false,
  stroke = "var(--accent)",
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  /** true = lower is better (rank), so a downward line means improvement */
  invert?: boolean;
  stroke?: string;
}) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) {
    return <span className="text-xs text-[var(--muted)]">not enough data</span>;
  }

  const xs = pts.map((p) => p.i);
  const vs = pts.map((p) => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = 3;
  const sx = (i: number) => pad + ((i - minX) / (maxX - minX)) * (width - 2 * pad);
  const sy = (v: number) => {
    const frac = (v - lo) / (hi - lo);
    const f = invert ? frac : 1 - frac;
    return pad + f * (height - 2 * pad);
  };

  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${sx(p.i).toFixed(1)} ${sy(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} />
      <circle cx={sx(last.i)} cy={sy(last.v)} r={2.5} fill={stroke} />
    </svg>
  );
}
