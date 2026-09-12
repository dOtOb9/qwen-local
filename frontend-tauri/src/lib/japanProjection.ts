// Converts real lat/lon into x/y coordinates on Geolonia's japanese-prefectures
// SVG map (viewBox 0 0 1000 1000, MIT licensed: https://github.com/geolonia/japanese-prefectures).
// The affine transform below was fit (least squares) from each of the 47
// prefectures' polygon bounding-box centroid on that map against its real
// capital-city lat/lon. Okinawa and Kagoshima were excluded from the fit
// since their remote outlying islands skew a bounding-box centroid far from
// the prefecture's mainland location; epicenters in those regions will be
// placed less accurately as a result.
const FIT = {
  a: 50.551582338055645,
  b: 6.581467668550689,
  c: -6706.934752860574,
  d: 4.491409643083802,
  e: -69.74622019385833,
  f: 2539.0525183494365,
};

export const MAP_VIEWBOX = "0 0 1000 1000";

export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: FIT.a * lon + FIT.b * lat + FIT.c,
    y: FIT.d * lon + FIT.e * lat + FIT.f,
  };
}
