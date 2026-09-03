const VALUE_FIELDS = ["v", "_lastRaw", "_lastMin", "_lastMax", "bMin", "bMax"];

export function cumulativeRunningTotalPoints(points) {
  if (!Array.isArray(points)) return points;
  let running = 0;
  return points.map((point) => {
    if (!point || typeof point !== "object") return point;
    if (point.v == null || point.v === "") return { ...point };
    const value = Number(point.v);
    if (!Number.isFinite(value)) return { ...point };
    running += value;
    const transformed = { ...point, v: running };
    for (const field of VALUE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(point, field)) transformed[field] = running;
    }
    return transformed;
  });
}

function runningTotalStats(points) {
  const numeric = points.filter((point) => (
    point?.v != null
    && point.v !== ""
    && Number.isFinite(Number(point.v))
  ));
  if (!numeric.length) return null;
  const values = numeric.map((point) => Number(point.v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minIndex = values.indexOf(min);
  const maxIndex = values.indexOf(max);
  return {
    min,
    max,
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    sum: values.reduce((sum, value) => sum + value, 0),
    first: values[0],
    last: values.at(-1),
    minT: numeric[minIndex]?.t,
    maxT: numeric[maxIndex]?.t,
    firstT: numeric[0]?.t,
    lastT: numeric.at(-1)?.t,
  };
}

export function cumulativeRunningTotalSeries(result) {
  if (!result || !Array.isArray(result.points)) return result;
  const points = cumulativeRunningTotalPoints(result.points);
  const stats = runningTotalStats(points);
  return {
    ...result,
    points,
    ...(stats ? { stats } : {}),
  };
}
