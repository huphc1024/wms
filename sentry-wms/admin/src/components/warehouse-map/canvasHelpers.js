import { mToPx } from './layoutUtils.js';

export function formatMeters(value) {
  return `${Number(value).toFixed(2)} m`;
}

export function pathToKonvaPoints(points) {
  return points.flatMap((p) => [mToPx(p.x), mToPx(p.y)]);
}
