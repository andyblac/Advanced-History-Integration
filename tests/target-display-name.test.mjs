import assert from "node:assert/strict";
import test from "node:test";

import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";

test("target visibility clicks are limited to the target icon", () => {
  const chip = {};
  const icon = { dataset: { advancedHistoryVisibilityToggle: "" } };
  const label = { dataset: {} };
  const iconEvent = { composedPath: () => [icon, chip] };
  const labelEvent = { composedPath: () => [label, chip] };

  assert.equal(
    TargetPickerMethods.prototype._nativeTargetChipIconClicked(iconEvent, chip),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._nativeTargetChipIconClicked(labelEvent, chip),
    false,
  );
});

test("double-click starts inline editing for an explicit entity target", () => {
  const chip = {
    localName: "ha-target-picker-value-chip",
    type: "entity",
    itemId: "sensor.gas",
  };
  const pending = {};
  const calls = [];
  const previousWindow = globalThis.window;
  globalThis.window = { clearTimeout: (timer) => calls.push(["clear", timer]) };
  const context = {
    _targets: { entity_id: ["sensor.gas"] },
    _y2Targets: { entity_id: [] },
    _targetChipClickTimers: new WeakMap([[chip, pending]]),
    _nativeTargetChipEventDetails:
      TargetPickerMethods.prototype._nativeTargetChipEventDetails,
    _beginTargetNameEdit: (...args) => calls.push(["edit", ...args]),
  };
  const event = {
    composedPath: () => [chip],
    preventDefault: () => calls.push(["prevent"]),
    stopPropagation: () => calls.push(["stop"]),
  };

  try {
    TargetPickerMethods.prototype._nativeTargetChipDoubleClicked.call(
      context,
      event,
      "primary",
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  assert.deepEqual(calls, [
    ["clear", pending],
    ["prevent"],
    ["stop"],
    ["edit", chip, "sensor.gas"],
  ]);
});

test("leaving an unchanged inline name edit preserves automatic naming", async () => {
  const listeners = {};
  const input = {
    dataset: {},
    style: {},
    value: "",
    setAttribute() {},
    addEventListener(type, listener) { listeners[type] = listener; },
    focus() {},
    select() {},
    remove() {},
  };
  const label = {
    nodeType: 1,
    textContent: "Gas meter · Back Garden",
    style: { display: "" },
    matches: () => false,
  };
  const tag = {
    childNodes: [label],
    querySelector: () => null,
    insertBefore(node) { assert.equal(node, input); },
  };
  const chip = {
    updateComplete: Promise.resolve(),
    shadowRoot: { querySelector: () => tag },
    focus() {},
  };
  const saves = [];
  const context = {
    _entityName: () => "Gas meter",
    _localize: (_key, fallback) => fallback,
    _setTargetDisplayName: (...args) => saves.push(args),
    _entityDisplayName: () => "Gas meter · Back Garden",
  };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => input };

  try {
    await TargetPickerMethods.prototype._beginTargetNameEdit.call(
      context,
      chip,
      "sensor.gas",
    );
    listeners.blur();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  assert.deepEqual(saves, []);
  assert.equal(label.textContent, "Gas meter · Back Garden");
});

test("target display names are stored only in the active panel snapshot", () => {
  const otherPanel = {
    entity_options: {
      "sensor.gas": { name: "Other panel name" },
    },
  };
  const calls = [];
  const context = {
    _activeSnapshot: {
      entity_options: {
        "sensor.gas": { color: "#ff0000" },
      },
    },
    _clone: structuredClone,
    _recordChange: (...args) => calls.push(["record", ...args]),
    _nativeTargetPicker: null,
    _nativeY2TargetPicker: null,
    _renderGraphs: () => calls.push(["render"]),
  };

  TargetPickerMethods.prototype._setTargetDisplayName.call(
    context,
    "sensor.gas",
    "Boiler gas",
  );

  assert.deepEqual(context._activeSnapshot.entity_options["sensor.gas"], {
    color: "#ff0000",
    name: "Boiler gas",
  });
  assert.equal(otherPanel.entity_options["sensor.gas"].name, "Other panel name");
  assert.deepEqual(calls, [["record", null, true], ["render"]]);
});

test("the native target picker receives the panel-specific display name", () => {
  const originalState = {
    entity_id: "sensor.gas",
    state: "10",
    attributes: { friendly_name: "Gas meter" },
  };
  const context = {
    _hass: { states: { "sensor.gas": originalState } },
    _areas: [{ area_id: "back_garden", name: "Back Garden" }],
    _devices: [{ id: "gas_meter", area_id: "back_garden" }],
    _entities: [{ entity_id: "sensor.gas", device_id: "gas_meter" }],
    _targets: { entity_id: ["sensor.gas"] },
    _y2Targets: { entity_id: [] },
    config: { include_hidden: false, entity_options: {} },
    _activeSnapshot: {
      entity_options: { "sensor.gas": { name: "GAS" } },
    },
    _clone: structuredClone,
    _effectiveEntityOptionsConfig() {
      return this._activeSnapshot.entity_options;
    },
  };

  const pickerHass = TargetPickerMethods.prototype._targetPickerHass.call(context);

  assert.equal(pickerHass.states["sensor.gas"].attributes.friendly_name, "GAS");
  assert.equal(originalState.attributes.friendly_name, "Gas meter");

  context._activeSnapshot.entity_options = {};
  const resetPickerHass = TargetPickerMethods.prototype._targetPickerHass.call(context);
  assert.equal(
    resetPickerHass.states["sensor.gas"].attributes.friendly_name,
    "Gas meter · Back Garden",
  );
});

test("clearing a target display name preserves its other panel options", () => {
  const context = {
    _activeSnapshot: {
      entity_options: {
        "sensor.gas": { color: "#ff0000", name: "Boiler gas" },
      },
    },
    _clone: structuredClone,
    _recordChange: () => {},
    _nativeTargetPicker: null,
    _nativeY2TargetPicker: null,
    _renderGraphs: () => {},
  };

  TargetPickerMethods.prototype._setTargetDisplayName.call(
    context,
    "sensor.gas",
    "   ",
  );

  assert.deepEqual(context._activeSnapshot.entity_options["sensor.gas"], {
    color: "#ff0000",
  });
});
