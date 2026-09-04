import assert from "node:assert/strict";
import test from "node:test";

import {
  cumulativeRunningTotalPoints,
  cumulativeRunningTotalSeries,
} from "../custom_components/advanced_history/frontend/running-total.js";
import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";
import {
  advancedHistoryDashboardCard,
  dashboardCardSnapshots,
} from "../custom_components/advanced_history/frontend/panel-export.js";

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

test("Advanced History dashboard card preserves the complete panel snapshot", () => {
  const snapshot = {
    schema: 1,
    targets: { entity_id: ["sensor.gas"], area_id: [], device_id: [] },
    y2_targets: { entity_id: ["sensor.temperature"], area_id: [], device_id: [] },
    chart: {
      defaults_mode: "overrides",
      running_total_axes: { primary: true },
      exclude_y2_comparison: true,
      show_comparison_banner: false,
    },
    period: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
      compare: "previous_year",
      compare_choice: "last_year",
      compare_count: 3,
    },
  };
  const exported = advancedHistoryDashboardCard(
    snapshot,
    {
      graph_height: 420,
      card_options: { numeric: { show_fill: true } },
      config_entry_id: "not-exported",
    },
    "Gas",
    ["sensor.gas", "sensor.temperature", "sensor.gas"],
    [{ type: "custom:statistics-graph-chart-card", entities: ["sensor.gas"] }],
  );

  assert.equal(exported.type, "custom:advanced-history-sgcc-card");
  assert.equal(exported.schema, 1);
  assert.equal(exported.title, "Gas");
  assert.deepEqual(exported.entities, ["sensor.gas", "sensor.temperature"]);
  assert.deepEqual(exported.sgcc_configs, [{
    type: "custom:statistics-graph-chart-card",
    entities: ["sensor.gas"],
  }]);
  assert.deepEqual(exported.snapshot, snapshot);
  assert.deepEqual(exported.settings, {
    card_options: { numeric: { show_fill: true } },
    graph_height: 420,
  });
});

test("SGCC editor changes retain Advanced History options and native height", async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.HTMLElement ||= class {
    attachShadow() {
      this.shadowRoot = {
        querySelector: () => null,
        querySelectorAll: () => [],
      };
    }
  };
  const registry = new Map();
  globalThis.customElements ||= {
    get: (key) => registry.get(key),
    define: (key, value) => registry.set(key, value),
    whenDefined: () => Promise.resolve(),
  };
  globalThis.window ||= { customCards: [] };
  const {
    AdvancedHistorySgccCardEditor,
    applyDashboardRuntimeState,
    containSgccEditorConfigEvent,
    dashboardRuntimeState,
    sgccConfigsWithSnapshotComparisons,
    snapshotFromSgccConfigs,
  } = await import(
    "../custom_components/advanced_history/frontend/advanced-history-sgcc-card.js"
  );
  let innerEventStopped = false;
  const innerConfig = { type: "custom:statistics-graph-chart-card", height: 500 };
  const containedDraft = containSgccEditorConfigEvent({
    detail: { config: innerConfig },
    stopPropagation: () => { innerEventStopped = true; },
  });
  assert.equal(innerEventStopped, true);
  assert.deepEqual(containedDraft, innerConfig);
  assert.notEqual(containedDraft, innerConfig);

  const original = {
    targets: { area_id: [], device_id: [], entity_id: ["sensor.gas"] },
    hidden_targets: { area_id: [], device_id: [], entity_id: [] },
    y2_targets: { area_id: [], device_id: [], entity_id: [] },
    hidden_y2_targets: { area_id: [], device_id: [], entity_id: [] },
    chart: {
      defaults_mode: "overrides",
      card_options: {},
      entity_options: {},
      running_total_axes: { primary: true },
      show_comparison_banner: false,
    },
    period: { compare: "previous" },
  };
  const updated = snapshotFromSgccConfigs(original, [{
    type: "custom:statistics-graph-chart-card",
    height: 520,
    entities: [{ entity: "sensor.gas", line_width: 3 }],
  }]);

  assert.equal(updated.chart.card_options.height, 520);
  assert.deepEqual(updated.chart.running_total_axes, { primary: true });
  assert.equal(updated.chart.show_comparison_banner, false);
  assert.equal(updated.chart.entity_options["sensor.gas"].line_width, 3);
  assert.deepEqual(updated.period, { compare: "previous" });

  const runtime = dashboardRuntimeState({
    chart: {
      card_options: { height: 520 },
      running_total_axes: { primary: true },
      show_comparison_banner: false,
    },
    period: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
      compare_choice: "last_year",
      compare_count: 2,
    },
  });
  const restored = applyDashboardRuntimeState(original, runtime);
  assert.deepEqual(restored.period, runtime.period);
  assert.deepEqual(restored.chart.running_total_axes, { primary: true });
  assert.equal(restored.chart.show_comparison_banner, false);
  assert.deepEqual(restored.chart.card_options, original.chart.card_options);

  const comparisonConfigs = sgccConfigsWithSnapshotComparisons([{
    type: "custom:statistics-graph-chart-card",
    entities: [
      { entity: "sensor.gas", compare: { opacity: 0.6 } },
      { entity: "sensor.temperature", y_axis: "secondary", compare: { opacity: 0.4 } },
    ],
  }], {
    chart: {
      exclude_y2_comparison: true,
      entity_options: { "sensor.gas": { compare: { opacity: 0.8 } } },
    },
    period: { compare: "previous", compare_choice: "last_month", compare_count: 2 },
  }, {
    card_options: {
      numeric: { entities: { compare: { line_style: "dotted", show_fill: true } } },
    },
  });
  assert.deepEqual(comparisonConfigs[0].entities[0].compare, [
    {
      opacity: 0.8,
      line_style: "dotted",
      show_fill: true,
      period: "last_month",
      periods_back: 1,
    },
    {
      opacity: 0.8,
      line_style: "dotted",
      show_fill: true,
      period: "last_month",
      periods_back: 2,
    },
  ]);
  assert.equal(comparisonConfigs[0].entities[1].compare, undefined);

  const wrapperEditor = new AdvancedHistorySgccCardEditor();
  const embeddedEditor = {};
  let wrapperRenders = 0;
  wrapperEditor._editor = embeddedEditor;
  wrapperEditor._render = () => { wrapperRenders += 1; };
  const hass = { locale: { language: "en-US" } };
  wrapperEditor.hass = hass;
  await Promise.resolve();
  assert.equal(embeddedEditor.hass, hass);
  assert.equal(wrapperRenders, 0);
});
