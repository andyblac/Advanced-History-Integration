const VALUE_FIELDS = ["v", "_lastRaw", "_lastMin", "_lastMax", "bMin", "bMax"];

export function cumulativeRunningTotalPoints(points, { carryInteriorNulls = false } = {}) {
  if (!Array.isArray(points)) return points;
  const lastNumericIndex = carryInteriorNulls
    ? points.findLastIndex((point) => (
      point?.v != null
      && point.v !== ""
      && Number.isFinite(Number(point.v))
    ))
    : -1;
  let running = 0;
  let started = false;
  return points.map((point, index) => {
    if (!point || typeof point !== "object") return point;
    if (point.v == null || point.v === "") {
      if (!carryInteriorNulls || !started || index >= lastNumericIndex) return { ...point };
      return { ...point, v: running };
    }
    const value = Number(point.v);
    if (!Number.isFinite(value)) return { ...point };
    running += value;
    started = true;
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

export function cumulativeRunningTotalSeries(result, options) {
  if (!result || !Array.isArray(result.points)) return result;
  const points = cumulativeRunningTotalPoints(result.points, options);
  const stats = runningTotalStats(points);
  return {
    ...result,
    points,
    ...(stats ? { stats } : {}),
  };
}
