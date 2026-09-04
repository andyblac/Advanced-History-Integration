import assert from "node:assert/strict";
import test from "node:test";

import { EnergyMethods } from "../custom_components/advanced_history/frontend/energy.js";
import { GraphMethods } from "../custom_components/advanced_history/frontend/graphs.js";

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
    _setPanelRollingHours: () => {},
    _beginGraphDataSourceCycle: () => {},
    _beginEnergyInteractionLoading: () => {},
    _syncDashboardEnergyController: () => {},
  });

  context._setDashboardEnergyPeriod(
    new Date(2026, 7, 3),
    new Date(2026, 7, 9),
  );

  assert.deepEqual(calls.map(([name]) => name), ["period", "graph", "refresh"]);
  assert.equal(calls[1][1].getTime(), collection.start.getTime());
  assert.equal(calls[1][2].getTime(), collection.end.getTime());
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
