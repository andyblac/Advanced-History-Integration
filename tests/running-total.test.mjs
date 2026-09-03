import assert from "node:assert/strict";
import test from "node:test";

import {
  cumulativeRunningTotalPoints,
  cumulativeRunningTotalSeries,
} from "../custom_components/advanced_history/frontend/running-total.js";
import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";
import { dashboardCardSnapshots } from "../custom_components/advanced_history/frontend/panel-export.js";

test("accumulates the card's per-bucket change values", () => {
  const points = [
    { t: 1, v: 1.5 },
    { t: 2, v: 0 },
    { t: 3, v: 2.25 },
  ];
  assert.deepEqual(
    cumulativeRunningTotalPoints(points).map((point) => point.v),
    [1.5, 1.5, 3.75],
  );
  assert.equal(points[1].v, 0);
});

test("updates the card's bucket metadata with the cumulative level", () => {
  const transformed = cumulativeRunningTotalPoints([
    { t: 1, v: 1, _lastRaw: 1, _lastMin: 0, _lastMax: 1, bMin: 0, bMax: 1 },
    { t: 2, v: 2, _lastRaw: 2, _lastMin: 0, _lastMax: 2, bMin: 0, bMax: 2 },
  ]);
  assert.deepEqual(transformed[1], {
    t: 2,
    v: 3,
    _lastRaw: 3,
    _lastMin: 3,
    _lastMax: 3,
    bMin: 3,
    bMax: 3,
  });
});

test("preserves gaps without resetting the running value", () => {
  const transformed = cumulativeRunningTotalPoints([
    { t: 1, v: 1 },
    { t: 2, v: null },
    { t: 3, v: 2 },
  ]);
  assert.deepEqual(transformed.map((point) => point.v), [1, null, 3]);
});

test("recomputes legend statistics from the cumulative series", () => {
  const transformed = cumulativeRunningTotalSeries({
    points: [
      { t: 1, v: 1 },
      { t: 2, v: null },
      { t: 3, v: 2 },
      { t: 4, v: 3 },
    ],
    stats: { min: 1, avg: 2, max: 3 },
  });
  assert.deepEqual(transformed.points.map((point) => point.v), [1, null, 3, 6]);
  assert.deepEqual(transformed.stats, {
    min: 1,
    max: 6,
    avg: 10 / 3,
    sum: 10,
    first: 1,
    last: 6,
    minT: 1,
    maxT: 4,
    firstT: 1,
    lastT: 4,
  });
});

test("axis control overrides targets without discarding their individual choices", () => {
  const context = {
    _activeSnapshot: { series_transforms: { "sensor.first": "running_total" } },
    _axisRunningTotalEntities: () => ["sensor.first", "sensor.second"],
    _clone: structuredClone,
    _recordChange: () => {},
    _syncRunningTotalAxisButtons: () => {},
    _syncNativeTargetVisibility: () => {},
    _renderGraphs: () => {},
  };
  const toggle = TargetPickerMethods.prototype._toggleAxisRunningTotal.bind(context);

  toggle("primary");
  assert.deepEqual(context._activeSnapshot.running_total_axes, { primary: true });
  assert.deepEqual(context._activeSnapshot.series_transforms, {
    "sensor.first": "running_total",
  });

  toggle("primary");
  assert.equal(context._activeSnapshot.running_total_axes, undefined);
  assert.deepEqual(context._activeSnapshot.series_transforms, {
    "sensor.first": "running_total",
  });
});

test("dashboard export removes the panel-only running-total aggregation", () => {
  const [exported] = dashboardCardSnapshots([{
    __advancedHistoryConfig: {
      chart_mode: "timeline",
      entities: [
        { entity: "sensor.gas", aggregate_func: "change" },
        { entity: "sensor.energy", aggregate_func: "change" },
      ],
    },
    __advancedHistoryRunningTotalExportAggregates: {
      "sensor.gas": { defined: false, value: undefined },
      "sensor.energy": { defined: true, value: "max" },
    },
  }]);

  assert.equal(exported.entities[0].aggregate_func, undefined);
  assert.equal(exported.entities[1].aggregate_func, "max");
});
