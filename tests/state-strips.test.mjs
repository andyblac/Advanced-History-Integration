import assert from "node:assert/strict";
import test from "node:test";

import { cardConfigToSnapshot } from "../custom_components/advanced_history/frontend/card-handoff.js";
import {
  GraphMethods,
  stateStripPresentationOptions,
} from "../custom_components/advanced_history/frontend/graphs.js";

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
  assert.equal(
    GraphMethods.prototype._stateStripPlotHeight.call({}, 900, 320),
    780,
  );
  assert.equal(
    GraphMethods.prototype._stateStripPlotHeight.call({}, 260, 360),
    200,
  );
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
