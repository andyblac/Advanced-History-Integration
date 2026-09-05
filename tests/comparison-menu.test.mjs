import assert from "node:assert/strict";
import test from "node:test";

import { EnergyMethods } from "../custom_components/advanced_history/frontend/energy.js";
import {
  GraphMethods,
  withoutDashboardWrapperNavigation,
} from "../custom_components/advanced_history/frontend/graphs.js";

test("comparison menu enables the selected comparison type", () => {
  const calls = [];
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCompareChoice: "last_year",
    _energyCollection: {
      compare: "",
      setCompare(value) {
        this.compare = value;
        calls.push(["set", value]);
      },
      refresh: () => calls.push(["refresh"]),
    },
    _beginGraphDataSourceCycle: () => calls.push(["cycle"]),
    _beginEnergyInteractionLoading: () => calls.push(["loading"]),
    _energyApplyCompareMode: (...args) => calls.push(["apply", ...args]),
    _syncY1ComparisonToggle: (active) => calls.push(["sync", active]),
  });

  context._setY1ComparisonEnabled(true);

  assert.equal(context._energyCollection.compare, "yoy");
  assert.deepEqual(calls, [
    ["cycle"],
    ["loading"],
    ["set", "yoy"],
    ["apply", "yoy", true],
    ["refresh"],
    ["sync", true],
  ]);
});

test("comparison menu clamps count and refreshes an active comparison", () => {
  const calls = [];
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCompareCount: 1,
    _energyCollection: { compare: "previous" },
    _beginGraphDataSourceCycle: () => calls.push("cycle"),
    _energyApplyCompareMode: (...args) => calls.push(args),
    _recordChange: () => calls.push("record"),
  });

  context._setY1ComparisonCount(99);

  assert.equal(context._energyCompareCount, 10);
  assert.deepEqual(calls, ["cycle", ["previous", true], "record"]);
});

test("dashboard comparison refresh keeps the chart mounted", () => {
  const elements = {
    "period-loading-banner": { hidden: false },
    "period-loading-text": { textContent: "" },
    "compare-banner": { hidden: false },
    charts: { hidden: false },
  };
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: true,
    _periodRestoreLoading: false,
    _customLocalize: () => "Loading requested range",
    shadowRoot: { getElementById: (id) => elements[id] },
  });

  context._beginEnergyInteractionLoading();

  assert.equal(context._energyInteractionLoading, true);
  assert.equal(elements["period-loading-banner"].hidden, true);
  assert.equal(elements["compare-banner"].hidden, true);
  assert.equal(elements.charts.hidden, false);
});

test("panel date refresh keeps the current chart visible", () => {
  const elements = {
    "period-loading-banner": { hidden: true },
    "period-loading-text": { textContent: "" },
    "compare-banner": { hidden: false },
    charts: { hidden: true },
  };
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: false,
    _periodRestoreLoading: false,
    _customLocalize: () => "Loading requested range",
    shadowRoot: { getElementById: (id) => elements[id] },
  });

  context._beginEnergyInteractionLoading();

  assert.equal(elements["period-loading-banner"].hidden, false);
  assert.equal(elements.charts.hidden, false);
});

test("dashboard navigation locks the rendered card height", () => {
  const values = new Map();
  const card = {
    getBoundingClientRect: () => ({ height: 487.2 }),
    style: {
      getPropertyValue: (property) => values.get(property) || "",
      setProperty: (property, value) => values.set(property, value),
      removeProperty: (property) => values.delete(property),
    },
  };
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: true,
    _periodRestoreLoading: false,
    _customLocalize: () => "Loading requested range",
    shadowRoot: {
      querySelector: (selector) => selector === "ha-card.dashboard-card" ? card : null,
      getElementById: () => null,
    },
  });

  context._beginEnergyInteractionLoading();

  assert.equal(values.get("height"), "488px");
  assert.equal(values.get("min-height"), "488px");
  assert.equal(values.get("max-height"), "488px");

  context._releaseDashboardCardLayout();
  assert.equal(values.size, 0);
});

test("dashboard legend clicks lock the card before SGCC redraws", () => {
  const listeners = new Map();
  const card = {
    shadowRoot: {
      addEventListener: (type, listener, capture) => listeners.set(type, { listener, capture }),
    },
  };
  let locks = 0;
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _dashboardCardMode: true,
    _lockDashboardCardLayout: () => { locks += 1; },
  });

  context._guardDashboardLegendLayout(card);
  assert.equal(listeners.get("pointerdown").capture, true);
  assert.equal(listeners.get("click").capture, true);

  listeners.get("pointerdown").listener({
    target: { closest: (selector) => selector.includes("sgc-detail-legend-entity") },
  });
  assert.equal(locks, 1);

  listeners.get("click").listener({ target: { closest: () => null } });
  assert.equal(locks, 1);
  assert.equal(card.__advancedHistoryLegendLayoutGuard, true);
});

test("axis badges hide and restore every main legend series on their axis", () => {
  const legendEntry = (id, hidden = false) => {
    const classes = new Set(hidden ? ["legend-hidden"] : []);
    return {
      dataset: { id },
      classList: {
        contains: (name) => classes.has(name),
      },
      click: () => {
        if (classes.has("legend-hidden")) classes.delete("legend-hidden");
        else classes.add("legend-hidden");
      },
    };
  };
  const gas = legendEntry("sensor.gas__0", true);
  const power = legendEntry("sensor.power__1");
  const temperature = legendEntry("sensor.temperature__2");
  const entries = [gas, power, temperature];
  const buttonState = new Map();
  const button = (id) => ({
    classList: {
      toggle: (name, active) => buttonState.set(`${id}:${name}`, active),
    },
    setAttribute: (name, value) => buttonState.set(`${id}:${name}`, value),
  });
  const buttons = {
    "toggle-y1-visibility": button("y1"),
    "toggle-y2-visibility": button("y2"),
  };
  const card = {
    _entities: [
      { entity: "sensor.gas" },
      { entity: "sensor.power", y_axis: "primary" },
      { entity: "sensor.temperature", y_axis: "secondary" },
      { entity: "sensor.gas", _compareOf: 0 },
    ],
    shadowRoot: {
      querySelectorAll: (selector) => selector.startsWith(".sgc-detail") ? entries : [],
    },
  };
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _graphCards: [card],
    shadowRoot: { getElementById: (id) => buttons[id] },
  });

  // A mixed axis is treated as visible: clicking it hides only the remaining
  // visible entries, just like individually clicking each legend item.
  context._toggleAxisLegendVisibility("primary");
  assert.equal(context._legendEntryHidden(gas), true);
  assert.equal(context._legendEntryHidden(power), true);
  assert.equal(context._legendEntryHidden(temperature), false);
  assert.equal(buttonState.get("y1:all-hidden"), true);
  assert.equal(buttonState.get("y1:aria-pressed"), "false");

  context._toggleAxisLegendVisibility("primary");
  assert.equal(context._legendEntryHidden(gas), false);
  assert.equal(context._legendEntryHidden(power), false);
  assert.equal(context._legendEntryHidden(temperature), false);
  assert.equal(buttonState.get("y1:all-hidden"), false);
  assert.equal(buttonState.get("y1:aria-pressed"), "true");
});

test("dashboard SGCC inherits the wrapper background when transparency is the default", () => {
  const values = new Map();
  const card = {
    style: {
      setProperty: (key, value) => values.set(key, value),
      removeProperty: (key) => values.delete(key),
    },
  };
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _dashboardCardMode: true,
  });

  context._applyDashboardGraphBackground(card, { card_background_color: "transparent" });
  assert.equal(values.get("--ha-card-background"), "transparent");
  assert.equal(values.get("--card-background-color"), "transparent");

  context._applyDashboardGraphBackground(card, { card_background_color: "#123456" });
  assert.equal(values.size, 0);
});

test("dashboard period store publishes local state without an Energy request", async () => {
  const context = Object.create(EnergyMethods.prototype);
  const store = context._createDashboardPeriodStore();
  const updates = [];
  store.subscribe((data) => updates.push(data));
  const start = new Date(2026, 7, 3, 0, 0, 0, 0);
  const end = new Date(2026, 7, 9, 23, 59, 59, 999);

  store.setPeriod(start, end);
  store.setCompare("previous");
  store.refresh();
  store.refresh();
  await Promise.resolve();

  assert.equal(updates.length, 1);
  assert.equal(updates[0].start.getTime(), start.getTime());
  assert.equal(updates[0].end.getTime(), end.getTime());
  assert.equal(updates[0].compareMode, "previous");

  const remounted = context._createDashboardPeriodStore();
  assert.equal(remounted.start.getTime(), start.getTime());
  assert.equal(remounted.end.getTime(), end.getTime());
  assert.equal(remounted.compare, "previous");
});

test("dashboard navigation uses SGCC's native date-picker synchronization", () => {
  let received;
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: true,
    _dashboardConfig: { snapshot: { id: "test-card" } },
    _dashboardDatePickerGroup: () => "shared-group",
    _graphCards: [{
      _onDatePickerSyncEvent: (event) => { received = event.detail; },
    }],
  });
  const start = new Date("2026-09-01T00:00:00.000Z");
  const end = new Date("2026-09-30T23:59:59.999Z");

  context._syncGraphCardsToEnergyPeriod({ start, end });

  assert.equal(received.group, "shared-group");
  assert.equal(received.mode, "custom");
  assert.equal(received.customStart, start.toISOString());
  assert.equal(received.customEnd, end.toISOString());
});

test("dashboard runtime drops legacy Energy navigation options", () => {
  const config = withoutDashboardWrapperNavigation({
    energy_date_sync: true,
    energy_collection_key: "legacy",
    show_date_picker: true,
    date_picker_group: "legacy-group",
    entities: ["sensor.gas"],
  });

  assert.deepEqual(config, { entities: ["sensor.gas"] });
});

test("dashboard controller binds local state after its date picker loads", async () => {
  const host = {
    isConnected: true,
    innerHTML: "",
    replaceChildren() { this.innerHTML = ""; },
  };
  const compareHost = {};
  let bound = false;
  let pickerLoaded = false;
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: true,
    _escape: (value) => value,
    _localize: (_key, fallback) => fallback,
    _ensureDashboardDatePickerLoaded: async () => { pickerLoaded = true; },
    _bindDashboardPeriodStore: (_token, boundHost, boundCompareHost) => {
      bound = boundHost === host && boundCompareHost === compareHost;
    },
    shadowRoot: {
      getElementById: (id) => id === "date-controller" ? host : compareHost,
    },
  });

  await context._renderEnergyController();

  assert.equal(pickerLoaded, true);
  assert.equal(bound, true);
});

test("hidden dashboard date controls still bind to their shared period group", async () => {
  const host = {
    isConnected: true,
    innerHTML: "",
    replaceChildren() { this.innerHTML = ""; },
  };
  const compareHost = {};
  let boundRenderControls;
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _dashboardCardMode: true,
    _dashboardDatePickerVisible: () => false,
    _escape: (value) => value,
    _localize: (_key, fallback) => fallback,
    _ensureDashboardDatePickerLoaded: async () => {
      throw new Error("hidden controls must not wait for the picker");
    },
    _bindDashboardPeriodStore: (_token, boundHost, boundCompareHost, renderControls) => {
      assert.equal(boundHost, host);
      assert.equal(boundCompareHost, compareHost);
      boundRenderControls = renderControls;
    },
    shadowRoot: {
      getElementById: (id) => id === "date-controller" ? host : compareHost,
    },
  });

  await context._renderEnergyController();

  assert.equal(boundRenderControls, false);
});

test("dashboard SGCC does not expose its local period store as an Energy collection", () => {
  const store = { start: new Date(), end: new Date() };
  const connection = {
    sendMessagePromise: async () => [],
  };
  const hass = { connection };
  const card = { __advancedHistorySourceTracker: { record() {} } };
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _dashboardCardMode: true,
    _energyCollection: store,
    _panelEnergyCollectionKey: () => "advanced_history_test",
  });

  context._setGraphCardHass(card, hass);

  assert.equal(card.hass.connection._advanced_history_test, undefined);
  assert.equal(connection._advanced_history_test, undefined);
});

test("dashboard date control formats a compact range with a separate year", () => {
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _hass: { locale: { language: "en-GB" }, config: { time_zone: "UTC" } },
    _resolvedTimeZone: () => "UTC",
  });
  const parts = context._dashboardEnergyPeriodParts(
    new Date("2020-08-04T00:00:00.000Z"),
    new Date("2020-08-11T00:00:00.000Z"),
  );

  assert.match(parts.primary, /4/);
  assert.match(parts.primary, /10/);
  assert.match(parts.primary, /Aug/);
  assert.equal(parts.secondary, "2020");
  assert.equal(parts.kind, "week");
});

test("dashboard date control shifts the complete selected period", () => {
  let shifted;
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCollection: {
      start: new Date(2026, 7, 4, 0, 0, 0, 0),
      end: new Date(2026, 7, 10, 23, 59, 59, 999),
    },
    _panelTimeRange: null,
    _setDashboardEnergyPeriod: (start, end) => { shifted = { start, end }; },
  });

  context._shiftDashboardEnergyPeriod(1);

  assert.equal(shifted.start.getDate(), 11);
  assert.equal(shifted.end.getDate(), 17);
});

test("dashboard navigation starts SGCC loading before the Energy refresh", () => {
  const calls = [];
  const graphCard = {
    _handleEnergyDate: (start, end) => calls.push(["graph", start, end]),
  };
  const collection = {
    setPeriod(start, end) {
      this.start = start;
      this.end = end;
      calls.push(["period"]);
    },
    refresh: () => calls.push(["refresh"]),
  };
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCollection: collection,
    _graphCards: [graphCard],
    _panelTimeRange: { start: 600, end: 840 },
    _panelRollingHours: 4,
    _setPanelRollingHours: () => {},
    _updateGraphHourOptionsInPlace: () => calls.push(["hours"]),
    _beginGraphDataSourceCycle: () => {},
    _beginEnergyInteractionLoading: () => {},
    _syncDashboardEnergyController: () => {},
  });

  context._setDashboardEnergyPeriod(
    new Date(2026, 7, 3),
    new Date(2026, 7, 9),
  );

  assert.deepEqual(calls.map(([name]) => name), ["hours", "period", "graph", "refresh"]);
  assert.equal(calls[2][1].getTime(), collection.start.getTime());
  assert.equal(calls[2][2].getTime(), collection.end.getTime());
  assert.equal(context._panelTimeRange, null);
});

test("date navigation keeps graphs mounted when detail resolution is unchanged", () => {
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _largeRangeDetailProfile: () => ({
      automatic: true,
      groupBy: "6h",
      key: "2026-08-01|2026-09-01",
    }),
  });
  const first = context._largeRangeDetailRenderKey();
  context._largeRangeDetailProfile = () => ({
    automatic: true,
    groupBy: "6h",
    key: "2026-09-01|2026-10-01",
  });

  assert.equal(context._largeRangeDetailRenderKey(), first);
  context._largeRangeDetailProfile = () => ({
    automatic: false,
    groupBy: "date",
    key: "2026-09-01|2026-10-01",
  });
  assert.notEqual(context._largeRangeDetailRenderKey(), first);
});

test("day navigation updates existing SGCC cards without rebuilding them", () => {
  let graphUpdates = 0;
  let graphRenders = 0;
  let refreshes = 0;
  const collection = {
    start: new Date(2026, 8, 4, 0, 0, 0, 0),
    end: new Date(2026, 8, 4, 23, 59, 59, 999),
    setPeriod(start, end) {
      this.start = start;
      this.end = end;
    },
    refresh: () => { refreshes += 1; },
  };
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCollection: collection,
    _panelTimeRange: null,
    _graphCards: [{}],
    _beginGraphDataSourceCycle: () => {},
    _beginEnergyInteractionLoading: () => {},
    _updateGraphHourOptionsInPlace: () => { graphUpdates += 1; },
    _renderGraphs: () => { graphRenders += 1; },
    _syncPanelTimeRangeControl: () => {},
  });

  context._applyPanelTimeRangePeriod(new Date(2026, 8, 3));

  assert.equal(graphUpdates, 1);
  assert.equal(graphRenders, 0);
  assert.equal(refreshes, 1);
});

test("calendar comparison legends use their actual year", () => {
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _hass: { locale: { language: "en-GB" } },
    _energyCompareChoice: "previous_period",
    _energyCompareCount: 4,
    _energyCollection: {
      compare: "previous",
      start: new Date(2026, 0, 1),
      end: new Date(2027, 0, 1),
    },
    _resolvedTimeZone: () => "Europe/London",
    _customLocalize: (key) => ({
      compare_previous_period: "Previous period",
    })[key] || key,
  });

  const replacements = context._comparisonSeriesPeriodReplacements();

  assert.deepEqual(
    replacements.map((item) => item.periodLabel),
    ["2025", "2024", "2023", "2022"],
  );
  assert.equal(
    context._replaceComparisonSeriesPeriodLabel(
      "GAS (previous period ×2)",
      replacements,
    ),
    "GAS (2024)",
  );
});

test("comparison legend relabeling supports other comparison types", () => {
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _hass: { locale: { language: "en-GB" } },
    _energyCompareChoice: "last_year",
    _energyCompareCount: 2,
    _energyCollection: {
      compare: "yoy",
      start: new Date(2026, 8, 1),
      end: new Date(2026, 9, 1),
    },
    _resolvedTimeZone: () => "Europe/London",
    _customLocalize: (key) => ({
      compare_previous_year: "Last year",
    })[key] || key,
  });

  const replacements = context._comparisonSeriesPeriodReplacements();

  assert.equal(
    context._replaceComparisonSeriesPeriodLabel(
      "GAS (last year ×2)",
      replacements,
    ),
    `GAS (${replacements[1].periodLabel})`,
  );
  assert.match(replacements[1].periodLabel, /2024/);
});

test("tooltip mutations relabel comparisons before the layout frame", () => {
  const firstCard = {};
  const secondCard = {};
  const relabeled = [];
  const context = Object.assign(Object.create(GraphMethods.prototype), {
    _applyComparisonSeriesPeriodLabels: (card) => relabeled.push(card),
  });
  const mutation = (card) => ({
    target: { getRootNode: () => ({ host: card }) },
  });

  context._applyComparisonLabelsForMutations([
    mutation(firstCard),
    mutation(firstCard),
    mutation(secondCard),
  ]);

  assert.deepEqual(relabeled, [firstCard, secondCard]);
});

test("comparison date ranges use abbreviated month names", () => {
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _hass: { locale: { language: "en-GB" } },
    _resolvedTimeZone: () => "Europe/London",
  });

  const label = context._energyCompactCompareRangeLabel(
    new Date(2026, 7, 24),
    new Date(2026, 7, 30, 23, 59),
    "week",
    false,
    new Date(2026, 8, 1),
  );

  assert.match(label, /Aug/);
  assert.doesNotMatch(label, /August/);
  assert.doesNotMatch(label, /2026/);

  const historicalLabel = context._energyCompactCompareRangeLabel(
    new Date(2025, 7, 4),
    new Date(2025, 7, 10, 23, 59),
    "week",
    false,
    new Date(2026, 8, 1),
  );
  assert.match(historicalLabel, /2025/);
});
