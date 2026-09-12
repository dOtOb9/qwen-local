export type EarthquakeInfo = {
  id: string;
  time: string;
  hypocenterName: string;
  latitude: number | null;
  longitude: number | null;
  magnitude: number;
  maxScale: number;
  maxScaleLabel: string;
  tsunami: boolean;
};

// P2P地震情報 API v2's maxScale encoding (震度).
const SCALE_LABELS: Record<number, string> = {
  10: "震度1",
  20: "震度2",
  30: "震度3",
  40: "震度4",
  45: "震度5弱",
  50: "震度5強",
  55: "震度6弱",
  60: "震度6強",
  70: "震度7",
};

function scaleLabel(scale: number): string {
  return SCALE_LABELS[scale] ?? `震度不明(${scale})`;
}

type RawQuakeMessage = {
  code: number;
  id?: string;
  earthquake?: {
    time: string;
    hypocenter?: { name?: string; magnitude?: number; latitude?: number; longitude?: number };
    maxScale?: number;
    domesticTsunami?: string;
  };
};

function toEarthquakeInfo(data: RawQuakeMessage & { id?: string }): EarthquakeInfo | null {
  if (!data.earthquake) return null;
  const maxScale = data.earthquake.maxScale ?? 0;
  const lat = data.earthquake.hypocenter?.latitude;
  const lon = data.earthquake.hypocenter?.longitude;
  return {
    id: data.id ?? `${data.earthquake.time}-${Math.random()}`,
    time: data.earthquake.time,
    hypocenterName: data.earthquake.hypocenter?.name ?? "不明",
    latitude: typeof lat === "number" && lat !== -200 ? lat : null,
    longitude: typeof lon === "number" && lon !== -200 ? lon : null,
    magnitude: data.earthquake.hypocenter?.magnitude ?? 0,
    maxScale,
    maxScaleLabel: scaleLabel(maxScale),
    tsunami: data.earthquake.domesticTsunami
      ? data.earthquake.domesticTsunami !== "None"
      : false,
  };
}

/** One-off fetch of recent past earthquake reports, oldest first, to seed the UI on load. */
export async function fetchRecentEarthquakes(
  minScale = 10,
  limit = 10,
): Promise<EarthquakeInfo[]> {
  const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=${limit}`);
  if (!res.ok) return [];
  const data: (RawQuakeMessage & { id?: string })[] = await res.json();
  return data
    .map(toEarthquakeInfo)
    .filter((q): q is EarthquakeInfo => q !== null && q.maxScale >= minScale)
    .reverse();
}

/**
 * Connects to P2P地震情報's public real-time feed (free, no auth) and calls
 * onQuake for every earthquake report (code 551) whose maxScale meets
 * minScale. Returns a cleanup function to close the connection.
 */
export function watchEarthquakes(
  onQuake: (quake: EarthquakeInfo) => void,
  minScale = 10,
): () => void {
  let closedByUs = false;
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket("wss://api.p2pquake.net/v2/ws");

    ws.onmessage = (event) => {
      try {
        const data: RawQuakeMessage = JSON.parse(event.data);
        if (data.code !== 551 || !data.earthquake) return;

        const maxScale = data.earthquake.maxScale ?? 0;
        if (maxScale < minScale) return;

        const lat = data.earthquake.hypocenter?.latitude;
        const lon = data.earthquake.hypocenter?.longitude;

        onQuake({
          id: data.id ?? `${data.earthquake.time}-${Math.random()}`,
          time: data.earthquake.time,
          hypocenterName: data.earthquake.hypocenter?.name ?? "不明",
          latitude: typeof lat === "number" && lat !== -200 ? lat : null,
          longitude: typeof lon === "number" && lon !== -200 ? lon : null,
          magnitude: data.earthquake.hypocenter?.magnitude ?? 0,
          maxScale,
          maxScaleLabel: scaleLabel(maxScale),
          tsunami: data.earthquake.domesticTsunami
            ? data.earthquake.domesticTsunami !== "None"
            : false,
        });
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!closedByUs) {
        setTimeout(connect, 10_000);
      }
    };
  }

  connect();

  return () => {
    closedByUs = true;
    ws?.close();
  };
}
