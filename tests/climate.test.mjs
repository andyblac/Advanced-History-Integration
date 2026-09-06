import assert from "node:assert/strict";
import test from "node:test";

import {
  climateHistoryAttributes,
  climateModeAnnotations,
  withClimateModeAnnotations,
  withoutClimateModeAnnotations,
} from "../custom_components/advanced_history/frontend/climate.js";
import { nativeHistoryAttributeColor } from "../custom_components/advanced_history/frontend/history-series.js";
import { GraphMethods } from "../custom_components/advanced_history/frontend/graphs.js";

test("uses the current and single target temperature attributes", () => {
  assert.deepEqual(climateHistoryAttributes({
    attributes: {
      current_temperature: 19,
      temperature: 21,
    },
  }), ["current_temperature", "temperature"]);
});

test("keeps the climate state alongside its native temperature series", () => {
  const context = {
    _hass: {
      states: {
        "climate.lounge": {
          state: "heat",
          attributes: { current_temperature: 19, temperature: 21 },
        },
      },
    },
    _seriesKey: GraphMethods.prototype._seriesKey,
  };

  assert.deepEqual(
    GraphMethods.prototype._nativeHistorySeries.call(context, "climate.lounge"),
    [
      { entity: "climate.lounge", attribute: null, key: "climate.lounge" },
      {
        entity: "climate.lounge",
        attribute: "current_temperature",
        key: "climate.lounge::current_temperature",
      },
      {
        entity: "climate.lounge",
        attribute: "temperature",
        key: "climate.lounge::temperature",
      },
    ],
  );
});

test("keeps humidifier and water-heater states alongside native attributes", () => {
  const context = {
    _hass: {
      states: {
        "humidifier.room": {
          state: "on",
          attributes: { current_humidity: 48, humidity: 50 },
        },
        "water_heater.tank": {
          state: "heat_pump",
          attributes: { current_temperature: 49, temperature: 55 },
        },
      },
    },
    _seriesKey: GraphMethods.prototype._seriesKey,
  };

  for (const [entity, attributes] of [
    ["humidifier.room", ["current_humidity", "humidity"]],
    ["water_heater.tank", ["current_temperature", "temperature"]],
  ]) {
    const series = GraphMethods.prototype._nativeHistorySeries.call(context, entity);
    assert.equal(series[0].key, entity);
    assert.equal(series[0].attribute, null);
    assert.deepEqual(series.slice(1).map(({ attribute }) => attribute), attributes);
  }
});

test("uses the target range instead of the single target temperature", () => {
  assert.deepEqual(climateHistoryAttributes({
    attributes: {
      current_temperature: 19,
      temperature: 21,
      target_temp_low: 18,
      target_temp_high: 23,
    },
  }), ["current_temperature", "target_temp_low", "target_temp_high"]);
});

test("uses Home Assistant's native graph palette for climate attributes", () => {
  const original = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (property) => ({
      "--graph-color-1": " #current ",
      "--graph-color-2": " #target ",
    }[property] || ""),
  });
  try {
    const state = { attributes: { current_temperature: 19, temperature: 21 } };
    assert.equal(
      nativeHistoryAttributeColor({}, "climate.lounge", state, "current_temperature"),
      "#current",
    );
    assert.equal(
      nativeHistoryAttributeColor({}, "climate.lounge", state, "temperature"),
      "#target",
    );
  } finally {
    if (original === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = original;
  }
});

test("creates native SGCC spans for Home Assistant climate modes", () => {
  const annotations = climateModeAnnotations("climate.lounge");

  assert.deepEqual(
    annotations.map(({ entity, state, type }) => ({ entity, state, type })),
    [
      { entity: "climate.lounge", state: "auto", type: "span" },
      { entity: "climate.lounge", state: "cool", type: "span" },
      { entity: "climate.lounge", state: "dry", type: "span" },
      { entity: "climate.lounge", state: "fan_only", type: "span" },
      { entity: "climate.lounge", state: "heat", type: "span" },
      { entity: "climate.lounge", state: "heat_cool", type: "span" },
    ],
  );
  assert.match(
    annotations.find(({ state }) => state === "heat").color,
    /--state-climate-heat-color/,
  );
});

test("does not add climate annotations to another domain", () => {
  assert.deepEqual(climateModeAnnotations("sensor.temperature"), []);
});

test("creates uniquely identified spans for each climate entity", () => {
  const annotations = climateModeAnnotations([
    "climate.lounge",
    "sensor.temperature",
    "climate.bedroom",
    "climate.lounge",
  ]);

  assert.equal(annotations.length, 12);
  assert.equal(new Set(annotations.map(({ id }) => id)).size, 12);
  assert.deepEqual(
    [...new Set(annotations.map(({ entity }) => entity))],
    ["climate.lounge", "climate.bedroom"],
  );
});

test("preserves user annotations while replacing generated climate spans", () => {
  const user = { type: "line", time: "2026-09-05T12:00:00Z", label: "User" };
  const oldGenerated = climateModeAnnotations("climate.old")[0];
  const merged = withClimateModeAnnotations(
    { annotations: [user, oldGenerated] },
    "climate.new",
  );

  assert.deepEqual(withoutClimateModeAnnotations(merged.annotations), [user]);
  assert.equal(merged.annotations.length, 7);
  assert.ok(merged.annotations.slice(1).every(({ entity }) => entity === "climate.new"));
});
