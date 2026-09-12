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

export function EarthquakeView({ history }: EarthquakeViewProps) {
  const located = history.filter((q) => q.latitude !== null && q.longitude !== null);

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
            {located.map((q, i) => {
              const { x, y } = project(q.latitude!, q.longitude!);
              const color = colorForScale(q.maxScale);
              const isLatest = i === located.length - 1;
              return (
                <g key={q.id}>
                  {isLatest && (
                    <>
                      {/* P波(初期微動、約7km/s): 速く遠くまで届くが揺れは小さい */}
                      <circle
                        cx={x}
                        cy={y}
                        r={6}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        className="eq-ripple-p"
                      />
                      {/* S波(主要動、約4km/s): 遅れて届くが本震の揺れそのもの */}
                      <circle
                        cx={x}
                        cy={y}
                        r={6}
                        fill="none"
                        stroke={color}
                        strokeWidth={4}
                        className="eq-ripple-s"
                      />
                    </>
                  )}
                  <circle cx={x} cy={y} r={6} fill={color} stroke="white" strokeWidth={1.5} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <style>{`
        .eq-ripple-p, .eq-ripple-s {
          transform-origin: center;
          transform-box: fill-box;
        }
        /* P波とS波は震源で同時に発生するが、速度比(約7:4)の分だけ
           同じ時間でS波はP波より近い距離までしか届かない。 */
        .eq-ripple-p {
          animation: eq-ripple-p-anim 2.2s ease-out infinite;
        }
        .eq-ripple-s {
          animation: eq-ripple-s-anim 2.2s ease-out infinite;
        }
        @keyframes eq-ripple-p-anim {
          0% { r: 6; opacity: 0.8; }
          100% { r: 110; opacity: 0; }
        }
        @keyframes eq-ripple-s-anim {
          0% { r: 6; opacity: 0.9; }
          100% { r: 63; opacity: 0; }
        }
      `}</style>

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
