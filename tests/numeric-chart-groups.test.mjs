import assert from "node:assert/strict";
import test from "node:test";

import { GraphMethods } from "../custom_components/advanced_history/frontend/graphs.js";

function context(singleGraph = false) {
  return {
    _activeSnapshot: { single_graph: singleGraph },
    _hass: {
      config: { unit_system: { temperature: "°C" } },
      states: {
        "sensor.room_temperature": {
          attributes: { device_class: "temperature", unit_of_measurement: "°C" },
        },
        "sensor.outside_temperature": {
          attributes: { device_class: "temperature", unit_of_measurement: "°C" },
        },
        "sensor.room_humidity": {
          attributes: { device_class: "humidity", unit_of_measurement: "%" },
        },
        "sensor.battery_voltage": {
          attributes: { device_class: "voltage", unit_of_measurement: "V" },
        },
        "sensor.gas_energy": {
          attributes: { device_class: "energy", unit_of_measurement: "kWh" },
        },
        "climate.room": { attributes: { temperature: 20, current_temperature: 19 } },
      },
    },
    _seriesKey: GraphMethods.prototype._seriesKey,
    _seriesDescriptor: GraphMethods.prototype._seriesDescriptor,
    _numericSeriesGroup: GraphMethods.prototype._numericSeriesGroup,
    _cardOptions() { return {}; },
  };
}

test("numeric charts use Home Assistant's unit and device-class grouping", () => {
  const target = context();
  const groups = GraphMethods.prototype._numericSeriesGroups.call(target, [
    "sensor.room_temperature",
    "sensor.outside_temperature",
    "sensor.room_humidity",
    "sensor.battery_voltage",
    { entity: "climate.room", attribute: "current_temperature" },
    { entity: "climate.room", attribute: "temperature" },
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => [group.unit, group.deviceClass, group.series.length]),
    [
      ["°C", "temperature", 4],
      ["%", "humidity", 1],
      ["V", "voltage", 1],
    ],
  );
});

test("the explicit single-graph option keeps numeric series together", () => {
  const target = context(true);
  const series = ["sensor.room_temperature", "sensor.room_humidity"];
  const groups = GraphMethods.prototype._numericSeriesGroups.call(target, series);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "single");
  assert.deepEqual(groups[0].series, series);
});

test("secondary-axis series remain overlaid on the primary chart", () => {
  const target = context();
  target._y2ResolvedEntityIds = new Set(["sensor.outside_temperature"]);
  const series = ["sensor.gas_energy", "sensor.outside_temperature"];
  const groups = GraphMethods.prototype._numericSeriesGroups.call(target, series);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].unit, "kWh");
  assert.deepEqual(groups[0].series, series);
});

test("a chart containing only secondary-axis series stays together", () => {
  const target = context();
  target._y2ResolvedEntityIds = new Set([
    "sensor.outside_temperature",
    "sensor.battery_voltage",
  ]);
  const series = ["sensor.outside_temperature", "sensor.battery_voltage"];
  const groups = GraphMethods.prototype._numericSeriesGroups.call(target, series);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].series, series);
});

test("state strips are available only for a mixed timeline chart", () => {
  const target = context();
  target._isNumeric = GraphMethods.prototype._isNumeric;
  const mixed = ["sensor.room_temperature", "climate.room"];

  assert.equal(
    GraphMethods.prototype._stateStripsAvailable.call(target, mixed),
    true,
  );
  assert.equal(
    GraphMethods.prototype._stateStripsAvailable.call(target, ["sensor.room_temperature"]),
    false,
  );

  target._cardOptions = () => ({ chart_mode: "bar" });
  assert.equal(
    GraphMethods.prototype._stateStripsAvailable.call(target, mixed),
    false,
  );
});

test("state strips remain opt-in even when mixed series are available", () => {
  const target = context();
  target._isNumeric = GraphMethods.prototype._isNumeric;
  target._stateStripsAvailable = GraphMethods.prototype._stateStripsAvailable;
  const mixed = ["sensor.room_temperature", "climate.room"];

  assert.equal(GraphMethods.prototype._stateStripsEnabled.call(target, mixed), false);
  target._activeSnapshot.state_strips = true;
  assert.equal(GraphMethods.prototype._stateStripsEnabled.call(target, mixed), true);
});

test("embedded state strips retain the mixed-chart automatic heading", () => {
  assert.equal(
    GraphMethods.prototype._hasMultipleChartGroups.call(
      {},
      [{ series: ["sensor.room_temperature"] }],
      ["climate.room"],
    ),
    true,
  );
});
