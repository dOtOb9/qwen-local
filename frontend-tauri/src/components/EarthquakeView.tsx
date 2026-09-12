import {
  HOKKAIDO_PATH,
  HONSHU_PATH,
  KYUSHU_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHIKOKU_PATH,
  project,
} from "@/lib/japanProjection";
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

export function EarthquakeView({ history }: EarthquakeViewProps) {
  const located = history.filter((q) => q.latitude !== null && q.longitude !== null);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold">地震情報(リアルタイム)</h2>

      <div className="flex justify-center rounded-lg bg-muted/30 p-4">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-[420px] w-auto"
          role="img"
          aria-label="日本地図と地震の震源"
        >
          <g className="fill-muted-foreground/25 stroke-muted-foreground/40" strokeWidth={1}>
            <path d={HOKKAIDO_PATH} />
            <path d={HONSHU_PATH} />
            <path d={SHIKOKU_PATH} />
            <path d={KYUSHU_PATH} />
          </g>

          {located.map((q, i) => {
            const { x, y } = project(q.latitude!, q.longitude!);
            const color = colorForScale(q.maxScale);
            const isLatest = i === located.length - 1;
            return (
              <g key={q.id}>
                {isLatest && (
                  <circle
                    cx={x}
                    cy={y}
                    r={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    className="eq-ripple"
                  />
                )}
                <circle cx={x} cy={y} r={4} fill={color} stroke="white" strokeWidth={1} />
              </g>
            );
          })}
        </svg>
      </div>
      <style>{`
        .eq-ripple {
          transform-origin: center;
          transform-box: fill-box;
          animation: eq-ripple-anim 2.2s ease-out infinite;
        }
        @keyframes eq-ripple-anim {
          0% { r: 4; opacity: 0.9; }
          100% { r: 60; opacity: 0; }
        }
      `}</style>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">直近の地震</h3>
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">まだ観測情報がありません</p>
        )}
        {[...history].reverse().map((q) => (
          <div
            key={q.id}
            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
          >
            <span>
              {q.hypocenterName} M{q.magnitude || "不明"}
            </span>
            <span className="font-medium" style={{ color: colorForScale(q.maxScale) }}>
              最大{q.maxScaleLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
