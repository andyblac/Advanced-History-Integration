import assert from "node:assert/strict";
import test from "node:test";

import {
  cumulativeRunningTotalPoints,
  cumulativeRunningTotalSeries,
} from "../custom_components/advanced_history/frontend/running-total.js";
import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";
import {
  DASHBOARD_STORED_SGCC_OMIT_KEYS,
} from "../custom_components/advanced_history/frontend/constants.js";
import {
  advancedHistoryDashboardCard,
  dashboardCardEntityIds,
  dashboardCardsWithHiddenEntitiesOnLoad,
  dashboardConfigWithNewView,
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

test("Advanced History dashboard card stores SGCC options only in sgcc_configs", () => {
  const snapshot = {
    schema: 1,
    id: "dashboard-card-1",
    name: "Gas snapshot",
    saved_at: "2026-09-05T08:55:40.426Z",
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
    source_bookmark_id: "bookmark-1",
    source_external_bookmark: true,
    source_external_bookmark_owner_id: "user-1",
    source_external_bookmark_id: "external-1",
  };
  const exported = advancedHistoryDashboardCard(
    snapshot,
    {
      graph_height: 420,
      default_hours: 24,
      large_range_automatic_detail: true,
      large_range_detail_threshold_days: 31,
      card_options: { numeric: { show_fill: true } },
      entity_options: {
        "sensor.gas": { show_state: false },
        "sensor.temperature::humidity": { line_width: 2 },
        "sensor.unrelated": { show_state: true },
      },
      config_entry_id: "not-exported",
    },
    "Gas",
    ["sensor.gas", "sensor.temperature", "sensor.gas"],
    [{
      type: "custom:statistics-graph-chart-card",
      entities: ["sensor.gas"],
      energy_date_sync: true,
      energy_collection_key: "energy_advanced_history_panel_test",
    }],
    "Gas panel",
  );

  assert.equal(exported.type, "custom:advanced-history-sgcc-card");
  assert.equal(exported.schema, 1);
  assert.equal(exported.title, "Gas");
  assert.equal(exported.show_date_picker, true);
  assert.equal(exported.date_picker_group, "Gas panel");
  assert.equal(exported.entities, undefined);
  assert.deepEqual(exported.sgcc_configs, [{
    type: "custom:statistics-graph-chart-card",
    show_fill: true,
    entities: [{
      entity: "sensor.gas",
      show_state: false,
    }],
  }]);
  assert.equal(Object.keys(exported.sgcc_configs[0])[0], "type");
  assert.deepEqual(exported.snapshot, {
    id: "dashboard-card-1",
    chart: {
      running_total_axes: { primary: true },
      exclude_y2_comparison: true,
      show_comparison_banner: false,
    },
    period: snapshot.period,
  });
  assert.equal(exported.settings, undefined);
  const exportedKeys = Object.keys(exported);
  assert.ok(exportedKeys.indexOf("title") < exportedKeys.indexOf("sgcc_configs"));
  assert.ok(exportedKeys.indexOf("snapshot") > exportedKeys.indexOf("sgcc_configs"));
  for (const key of DASHBOARD_STORED_SGCC_OMIT_KEYS) {
    assert.equal(exported.sgcc_configs[0][key], undefined);
  }

  const customBackground = advancedHistoryDashboardCard(
    snapshot,
    {},
    "Gas",
    ["sensor.gas"],
    [{
      type: "custom:statistics-graph-chart-card",
      entities: ["sensor.gas"],
      card_background_color: "#123456",
    }],
    "Gas panel",
  );
  assert.equal(customBackground.sgcc_configs[0].card_background_color, "#123456");
});

test("dashboard export generates a UUID date-picker group without a configured panel name", () => {
  const exported = advancedHistoryDashboardCard({
    targets: { entity_id: ["sensor.gas"] },
    chart: {},
  });

  assert.match(
    exported.date_picker_group,
    /^advanced-history-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("native dashboard handoff reads entities from canonical SGCC configs", () => {
  const card = {
    type: "custom:advanced-history-sgcc-card",
    sgcc_configs: [{
      entities: [
        { entity: "sensor.gas", enabled: false },
        { entity: "sensor.temperature", y_axis: "secondary" },
      ],
    }],
  };
  assert.deepEqual(dashboardCardEntityIds([card]), [
    "sensor.gas",
    "sensor.temperature",
  ]);
  const [hiddenOnLoad] = dashboardCardsWithHiddenEntitiesOnLoad([card]);
  assert.deepEqual(hiddenOnLoad.sgcc_configs[0].entities[0], {
    entity: "sensor.gas",
    enabled: true,
    auto_hide: true,
  });
});

test("dashboard export can add a uniquely named destination view", () => {
  const original = {
    views: [
      { title: "Energy", path: "energy", cards: [] },
      { title: "Energy 2", path: "energy-2", cards: [] },
    ],
  };

  const result = dashboardConfigWithNewView(original, "Energy", "sections");

  assert.equal(result.viewIndex, 2);
  assert.deepEqual(result.config.views[2], {
    title: "Energy",
    path: "energy-3",
    type: "sections",
    sections: [],
  });
  assert.equal(original.views.length, 2);
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
    AdvancedHistorySgccCard,
    applyDashboardRuntimeState,
    cardConfigWithTitle,
    containSgccEditorConfigEvent,
    compactDashboardSnapshot,
    dashboardConfigWithDateNavigation,
    dashboardDatePickerVisible,
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

  const titled = cardConfigWithTitle({ type: "custom:advanced-history-sgcc-card" }, "Gas");
  assert.equal(titled.title, "Gas");
  assert.equal(cardConfigWithTitle(titled, "").title, undefined);
  assert.equal(dashboardDatePickerVisible({}), true);
  assert.equal(dashboardDatePickerVisible({ show_date_picker: false }), false);
  assert.equal(dashboardDatePickerVisible({
    sgcc_configs: [{ show_date_picker: false }],
  }), false);
  assert.equal(dashboardDatePickerVisible({
    show_date_picker: true,
    sgcc_configs: [{ show_date_picker: false }],
  }), true);
  assert.deepEqual(compactDashboardSnapshot({
    schema: 1,
    id: "dashboard-card-2",
    name: "Gas snapshot",
    saved_at: "2026-09-05T08:55:40.426Z",
    targets: { entity_id: ["sensor.gas"] },
    hidden_targets: { entity_id: [] },
    chart: {
      defaults_mode: "overrides",
      card_options: { height: 500 },
      entity_options: { "sensor.gas": { enabled: true } },
      attribute_selection: { "sensor.gas": ["state"] },
      default_hours: 24,
      source_graph_height: 500,
      running_total_axes: { primary: true },
    },
  }), {
    id: "dashboard-card-2",
    chart: { running_total_axes: { primary: true } },
  });
  const dateNavigationConfig = dashboardConfigWithDateNavigation({
    show_date_picker: true,
    date_picker_group: "old-group",
    sgcc_configs: [{ type: "numeric" }, { type: "state" }],
  }, {
    show_date_picker: false,
    date_picker_group: "shared-group",
  });
  assert.equal(dateNavigationConfig.show_date_picker, false);
  assert.equal(dateNavigationConfig.date_picker_group, "shared-group");
  for (const config of dateNavigationConfig.sgcc_configs) {
    for (const key of DASHBOARD_STORED_SGCC_OMIT_KEYS) {
      assert.equal(config[key], undefined);
    }
  }

  const group = `test-${Date.now()}-${Math.random()}`;
  const periodOwner = Object.assign(Object.create(AdvancedHistorySgccCard.prototype), {
    _dashboardConfig: {
      date_picker_group: group,
      sgcc_configs: [{ date_picker_group: "stale-group" }],
    },
    _dashboardPeriodState: null,
  });
  const periodFollower = Object.assign(Object.create(AdvancedHistorySgccCard.prototype), {
    _dashboardConfig: { date_picker_group: group },
    _dashboardPeriodState: null,
  });
  const ownerStore = periodOwner._createDashboardPeriodStore();
  const followerStore = periodFollower._createDashboardPeriodStore();
  assert.equal(followerStore, ownerStore);
  assert.equal(periodOwner._dashboardPeriodStoreFollower, false);
  assert.equal(periodFollower._dashboardPeriodStoreFollower, true);

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

  const hiddenLegendEntry = {
    dataset: { id: "sensor.gas__0" },
    classList: { contains: (name) => name === "legend-hidden" },
  };
  const visibilityContext = Object.assign(
    Object.create(AdvancedHistorySgccCard.prototype),
    {
      _dashboardConfig: {
        snapshot: { chart: { card_options: { stale: true } } },
        sgcc_configs: [{
          type: "custom:statistics-graph-chart-card",
          entities: ["sensor.gas"],
        }],
      },
      _graphCards: [{
        _entities: [{ entity: "sensor.gas" }],
        shadowRoot: {
          querySelectorAll: (selector) => (
            selector.startsWith(".sgc-detail") ? [hiddenLegendEntry] : []
          ),
        },
      }],
    },
  );
  visibilityContext._syncDashboardSgccVisibilityFromCards();
  assert.equal(
    visibilityContext._dashboardConfig.sgcc_configs[0].entities[0].enabled,
    false,
  );
  assert.deepEqual(visibilityContext._dashboardConfig.snapshot, { chart: {} });

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
