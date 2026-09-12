import { useEffect, useState } from "react";
import japanMapSvg from "@/assets/japan-map.svg?raw";
import { MAP_VIEWBOX, project } from "@/lib/japanProjection";
import type { EarthquakeInfo } from "@/lib/earthquake";

type EarthquakeViewProps = {
  history: EarthquakeInfo[];
};

const SCALE_COLORS: [number, string][] = [
  [60, "#dc2626"],
  [45, "#ea580c"],
  [30, "#f59e0b"],
  [20, "#eab308"],
  [0, "#84cc16"],
];

function colorForScale(scale: number): string {
  return SCALE_COLORS.find(([min]) => scale >= min)?.[1] ?? "#84cc16";
}

// Typical crustal wave speeds and this map's scale, used to render actual
// real-time wave fronts (not a decorative loop): how far the P/S waves have
// really traveled since the reported origin time, right now.
const P_WAVE_KM_S = 7;
const S_WAVE_KM_S = 4;
// Derived from japanProjection's fit: ~50.55 svg-units/deg-lon over
// ~90km/deg-lon at this latitude, and ~69.75 svg-units/deg-lat over 111km/deg-lat.
const SVG_UNITS_PER_KM = 0.594;
// Stop animating a quake once its S-wave would be well past the whole map.
const MAX_SIMULATION_SECONDS = 180;

function parseQuakeTime(time: string): number {
  // "2026/09/11 20:39:00" - JMA times are JST, which matches local time for
  // users in Japan; browsers parse this "yyyy/mm/dd hh:mm:ss" form as local time.
  return new Date(time).getTime();
}

export function EarthquakeView({ history }: EarthquakeViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const located = history.filter((q) => q.latitude !== null && q.longitude !== null);
  const latest = located[located.length - 1];

  const latestOriginMs = latest ? parseQuakeTime(latest.time) : null;
  const elapsedSeconds = latestOriginMs !== null ? (now - latestOriginMs) / 1000 : null;
  const isSimulating =
    elapsedSeconds !== null && elapsedSeconds >= 0 && elapsedSeconds <= MAX_SIMULATION_SECONDS;

  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(interval);
  }, [isSimulating, latest?.id]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">地震情報(リアルタイム)</h1>

      <div className="flex justify-center rounded-lg bg-muted/30 p-4">
        <div className="relative h-[560px] w-[440px]">
          <div
            className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: japanMapSvg }}
          />
          <svg viewBox={MAP_VIEWBOX} className="absolute inset-0 h-full w-full">
            {located.map((q) => {
              const { x, y } = project(q.latitude!, q.longitude!);
              const color = colorForScale(q.maxScale);
              return (
                <g key={q.id}>
                  <circle cx={x} cy={y} r={6} fill={color} stroke="white" strokeWidth={1.5} />
                </g>
              );
            })}
            {latest && isSimulating && elapsedSeconds !== null && (
              (() => {
                const { x, y } = project(latest.latitude!, latest.longitude!);
                const pRadius = 6 + elapsedSeconds * P_WAVE_KM_S * SVG_UNITS_PER_KM;
                const sRadius = 6 + elapsedSeconds * S_WAVE_KM_S * SVG_UNITS_PER_KM;
                const fade = Math.max(0, 1 - elapsedSeconds / MAX_SIMULATION_SECONDS);
                return (
                  <>
                    {/* P波(初期微動、実測7km/s) */}
                    <circle
                      cx={x}
                      cy={y}
                      r={pRadius}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      opacity={fade * 0.8}
                    />
                    {/* S波(主要動=本震の揺れそのもの、実測4km/s) */}
                    <circle
                      cx={x}
                      cy={y}
                      r={sRadius}
                      fill="none"
                      stroke={colorForScale(latest.maxScale)}
                      strokeWidth={4}
                      opacity={fade}
                    />
                  </>
                );
              })()
            )}
          </svg>
        </div>
      </div>

      {latest && isSimulating && elapsedSeconds !== null && (
        <p className="text-center text-sm text-muted-foreground">
          発生から{elapsedSeconds.toFixed(1)}秒経過
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">直近の地震</h2>
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">まだ観測情報がありません</p>
        )}
        {[...history].reverse().map((q) => (
          <div
            key={q.id}
            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
          >
            <div className="flex flex-col">
              <span>
                {q.hypocenterName} M{q.magnitude || "不明"}
              </span>
              <span className="text-xs text-muted-foreground">{q.time}</span>
            </div>
            <span className="font-medium" style={{ color: colorForScale(q.maxScale) }}>
              最大{q.maxScaleLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
