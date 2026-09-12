// A simple equirectangular projection covering mainland Japan
// (Hokkaido〜Kyushu). Not cartographically precise, but consistent: the
// island outlines below and any lat/lon point (e.g. an epicenter) are
// projected through the same formula, so relative placement is correct.
export const MAP_WIDTH = 420;
export const MAP_HEIGHT = 520;

const LON_MIN = 128.5;
const LON_MAX = 146.5;
const LAT_MIN = 30.5;
const LAT_MAX = 45.8;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_WIDTH;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_HEIGHT;
  return { x, y };
}

function path(points: [number, number][]): string {
  return (
    points
      .map(([lat, lon], i) => {
        const { x, y } = project(lat, lon);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

// Rough silhouettes built from real city coordinates as anchor points -
// recognizable, not survey-accurate.
export const HOKKAIDO_PATH = path([
  [45.5, 141.9],
  [45.3, 143.2],
  [44.3, 145.3],
  [43.3, 145.8],
  [42.9, 144.4],
  [42.3, 142.9],
  [41.8, 140.9],
  [42.6, 140.0],
  [43.2, 140.3],
  [43.8, 141.6],
  [44.9, 141.6],
]);

export const HONSHU_PATH = path([
  [41.3, 140.5],
  [40.8, 140.0],
  [39.7, 139.9],
  [38.9, 139.7],
  [37.9, 138.9],
  [36.9, 137.3],
  [37.5, 136.9],
  [36.6, 136.4],
  [35.6, 135.9],
  [35.5, 135.0],
  [34.6, 135.0],
  [34.7, 135.5],
  [34.4, 133.9],
  [34.4, 132.5],
  [33.9, 131.0],
  [33.5, 130.9],
  [34.0, 132.0],
  [34.0, 133.5],
  [33.6, 135.7],
  [34.2, 136.9],
  [34.7, 137.1],
  [34.9, 138.0],
  [35.0, 138.9],
  [35.3, 139.6],
  [35.7, 140.8],
  [36.7, 140.8],
  [37.4, 141.0],
  [38.3, 141.0],
  [39.0, 141.6],
  [40.0, 141.7],
  [40.6, 141.4],
  [41.3, 141.4],
]);

export const SHIKOKU_PATH = path([
  [34.3, 133.5],
  [34.3, 134.6],
  [33.8, 134.6],
  [33.3, 133.9],
  [33.0, 133.0],
  [33.5, 132.6],
  [34.1, 132.9],
]);

export const KYUSHU_PATH = path([
  [33.9, 130.9],
  [33.9, 131.7],
  [33.2, 131.9],
  [32.7, 131.4],
  [31.9, 131.5],
  [31.2, 130.8],
  [31.0, 130.3],
  [31.6, 130.2],
  [32.0, 129.9],
  [32.7, 129.7],
  [33.3, 129.8],
  [33.6, 130.2],
]);
