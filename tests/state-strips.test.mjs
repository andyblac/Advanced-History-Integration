import assert from "node:assert/strict";
import test from "node:test";

import { cardConfigToSnapshot } from "../custom_components/advanced_history/frontend/card-handoff.js";
import {
  GraphMethods,
  stateStripPresentationOptions,
} from "../custom_components/advanced_history/frontend/graphs.js";
import { nativeStateMap, timelineStateColors, withBooleanStateColors } from "../custom_components/advanced_history/frontend/state-colors.js";

test("More Info retains original timeline colours even when Activity uses the opposite mapping", () => {
  const labels = new Map([["On", "on"], ["Off", "off"]]);
  const colors = timelineStateColors([{
    id: "sensor.heating",
    data: [
      { value: ["sensor.heating", 0, 1, "On", "#f4bd4a"] },
      { value: ["sensor.heating", 1, 2, "Off", "#4269d0"] },
    ],
  }], "sensor.heating", labels);
  const map = nativeStateMap({ states: {
    "sensor.heating": { state: "on", attributes: {} },
  } }, "sensor.heating", ["on", "off"], colors);
  assert.equal(map.find(({ value }) => value === "on").color,
    "#f4bd4a");
  assert.equal(map.find(({ value }) => value === "off").color,
    "#4269d0");
  assert.deepEqual([...timelineStateColors(undefined, "sensor.heating", labels)], []);
});

test("resolved native colours are authoritative and fallback colours allow theme overrides", () => {
  const hass = { states: {
    "sensor.heating": { state: "on", attributes: {} },
  } };
  const colors = new Map([["on", "#4269cf"], ["off", "#fac344"]]);
  const stateMap = nativeStateMap(hass, "sensor.heating", ["off", "on"], colors);
  const byState = Object.fromEntries(stateMap.map(({ value, color }) => [value, color]));
  assert.equal(byState.on, "#4269cf");
  assert.equal(byState.off, "#fac344");
  assert.equal(byState.unknown, "var(--history-unknown-color, var(--state-inactive-color))");
  assert.equal(byState.unavailable, "var(--history-unavailable-color, var(--state-unavailable-color))");

  // An enum's declared ordering is a fallback, after exact theme variables.
  hass.states["sensor.heating"].attributes = { device_class: "enum", options: ["off", "on"] };
  const enumMap = nativeStateMap(hass, "sensor.heating");
  assert.equal(enumMap.find(({ value }) => value === "off").color,
    "var(--state-sensor-enum-off-color, var(--state-sensor-off-color, var(--graph-color-1, var(--color-1))))");

  hass.states["binary_sensor.heating"] = { state: "on", attributes: { device_class: "running" } };
  const binaryMap = nativeStateMap(hass, "binary_sensor.heating", [], colors);
  assert.equal(binaryMap.find(({ value }) => value === "on").color, "#4269cf");
  assert.equal(binaryMap.find(({ value }) => value === "off").color, "#fac344");
});

test("generic sensor state colours stay stable across current-state changes", () => {
  const hass = { states: {
    "sensor.heating": { state: "on", attributes: {} },
  } };
  const before = nativeStateMap(hass, "sensor.heating");
  hass.states["sensor.heating"].state = "off";
  const after = nativeStateMap(hass, "sensor.heating");
  for (const state of ["on", "off"]) {
    assert.equal(before.find(({ value }) => value === state).color,
      after.find(({ value }) => value === state).color);
  }
  assert.notEqual(before.find(({ value }) => value === "on").color,
    before.find(({ value }) => value === "off").color);
});

test("boolean state maps receive distinct semantic colours", () => {
  assert.deepEqual(withBooleanStateColors([
    { value: "false", label: "False" },
    { value: "true", label: "True" },
  ]), [
    {
      value: "false",
      label: "False",
      color: "var(--state-inactive-color, var(--disabled-text-color, #9e9e9e))",
    },
    {
      value: "true",
      label: "True",
      color: "var(--state-active-color, var(--success-color, #43a047))",
    },
  ]);
  assert.deepEqual(withBooleanStateColors([
    { value: "true", label: "True", color: "#123456" },
  ]), [
    { value: "true", label: "True", color: "#123456" },
  ]);
  assert.deepEqual(withBooleanStateColors([
    {
      value: "false",
      label: "False",
      color: "var(--state-inactive-color, var(--disabled-text-color, #9e9e9e))",
    },
    {
      value: "true",
      label: "True",
      color: "var(--state-active-color, var(--success-color, #43a047))",
    },
  ], "#00bcd4", true), [
    {
      value: "false",
      label: "False",
      color: "var(--state-inactive-color, var(--disabled-text-color, #9e9e9e))",
    },
    { value: "true", label: "True", color: "#00bcd4" },
  ]);
});

test("state-strip handoff records the Advanced History layout without persisting its render marker", () => {
  const snapshot = cardConfigToSnapshot({
    type: "custom:statistics-graph-chart-card",
    entities: [
      { entity: "sensor.temperature" },
      {
        entity: "binary_sensor.heating",
        graph_type: "state_strip",
        state_map: { on: "#f00", off: "#999" },
      },
    ],
  });

  assert.equal(snapshot.chart.state_strips, true);
  assert.equal(
    snapshot.chart.entity_options["binary_sensor.heating"].graph_type,
    undefined,
  );
  assert.deepEqual(
    snapshot.chart.entity_options["binary_sensor.heating"].state_map,
    { on: "#f00", off: "#999" },
  );
});

test("the state-strip axis control toggles a bookmarkable chart option", () => {
  let renders = 0;
  const target = {
    _activeSnapshot: { card_options: {}, entity_options: {} },
    _stateStripsAvailable: () => true,
    _clone: structuredClone,
    _recordChange: () => {},
    _syncStateStripsButton: () => {},
    _renderGraphs: () => { renders += 1; },
  };

  GraphMethods.prototype._toggleStateStrips.call(target);
  assert.equal(target._activeSnapshot.state_strips, true);
  GraphMethods.prototype._toggleStateStrips.call(target);
  assert.equal(target._activeSnapshot.state_strips, undefined);
  assert.equal(renders, 2);
});

test("an auto-height state-strip chart gives remaining card space to its plot", () => {
  const configs = [];
  const card = {
    __advancedHistoryConfig: { height: "auto" },
    shadowRoot: {
      querySelector(selector) {
        return {
          getBoundingClientRect: () => ({
            height: selector === "ha-card.sgc-card" ? 320 : 200,
          }),
        };
      },
    },
    setConfig: (config) => configs.push(config),
  };
  const context = {
    _hass: {},
    _setGraphCardHass() {},
  };

  GraphMethods.prototype._fitAutomaticNumericCard.call(context, card, 900);
  assert.equal(configs.at(-1).height, 780);

  GraphMethods.prototype._fitAutomaticNumericCard.call(context, card, 260);
  assert.equal(configs.at(-1).height, 200);
});

test("state strips inherit state-timeline label defaults", () => {
  assert.deepEqual(
    stateStripPresentationOptions(
      {},
      { state_timeline_show_labels: false, state_timeline_label_font_size: 14 },
    ),
    {
      options: { state_strip_labels: false, state_strip_height: 20 },
      labelFontSize: 14,
    },
  );
});

test("explicit state-strip options override inherited timeline defaults", () => {
  assert.deepEqual(
    stateStripPresentationOptions(
      { state_strip_labels: true, state_strip_height: 30 },
      { state_timeline_show_labels: false, state_timeline_label_font_size: 16 },
    ),
    {
      options: { state_strip_labels: true, state_strip_height: 30 },
      labelFontSize: 16,
    },
  );
});
