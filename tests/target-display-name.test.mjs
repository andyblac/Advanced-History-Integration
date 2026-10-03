import assert from "node:assert/strict";
import test from "node:test";

import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";

test("single-clicking a target row toggles its chart visibility", () => {
  const chip = {
    localName: "ha-target-picker-item-row",
    type: "entity",
    itemId: "sensor.gas",
  };
  const label = { localName: "span" };
  // HA 2026.9 renders the row content inside its own native button. That is
  // the row hit target, not one of Advanced History's action controls.
  const nativeRowButton = { localName: "button", dataset: {} };
  const calls = [];
  let callback;
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout(next) {
      callback = next;
      return 1;
    },
    clearTimeout() {},
  };
  const context = {
    _targets: { entity_id: ["sensor.gas"] },
    _y2Targets: { entity_id: [] },
    _nativeTargetChipEventDetails:
      TargetPickerMethods.prototype._nativeTargetChipEventDetails,
    _toggleTargetVisibility: (...args) => calls.push(args),
  };

  try {
    TargetPickerMethods.prototype._nativeTargetChipClicked.call(context, {
      detail: 1,
      composedPath: () => [label, nativeRowButton, chip],
    }, "primary");
    // HA may redraw the native row before the single-click delay completes.
    // The action must use the identifier captured from the original event.
    chip.itemId = undefined;
    callback();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  assert.deepEqual(calls, [["primary", "entity_id", "sensor.gas"]]);
});

test("redrawn native rows retain their decorated entity identifier", () => {
  const chip = {
    localName: "ha-target-picker-item-row",
    type: "",
    itemId: undefined,
    dataset: {
      advancedHistoryItemType: "entity",
      advancedHistoryItemId: "climate.lounge",
    },
  };
  const context = {
    _targets: { entity_id: ["climate.lounge"] },
    _y2Targets: { entity_id: [] },
  };

  const details = TargetPickerMethods.prototype._nativeTargetChipEventDetails.call(
    context,
    { composedPath: () => [chip] },
    "primary",
  );

  assert.equal(details.kind, "entity_id");
  assert.equal(details.itemId, "climate.lounge");
});

test("native 2026.9 rows receive direct visibility listeners", () => {
  const listeners = {};
  const options = {};
  const chip = {
    localName: "ha-target-picker-item-row",
    dataset: {},
    addEventListener(type, listener, value) {
      listeners[type] = listener;
      options[type] = value;
    },
  };
  const calls = [];
  const context = {
    _nativeTargetChipClicked: (...args) => calls.push(["click", ...args]),
    _nativeTargetChipDoubleClicked: (...args) => calls.push(["dblclick", ...args]),
  };

  TargetPickerMethods.prototype._bindNativeTargetRowVisibility.call(
    context,
    chip,
    "secondary",
  );
  // Re-syncing the same row must not stack duplicate handlers.
  TargetPickerMethods.prototype._bindNativeTargetRowVisibility.call(
    context,
    chip,
    "secondary",
  );
  const clickEvent = {};
  const doubleClickEvent = {};
  listeners.click(clickEvent);
  listeners.dblclick(doubleClickEvent);

  assert.equal(chip.dataset.advancedHistoryVisibilityBound, "secondary");
  assert.deepEqual(options, {
    click: { capture: true },
    dblclick: { capture: true },
  });
  assert.deepEqual(calls, [
    ["click", clickEvent, "secondary"],
    ["dblclick", doubleClickEvent, "secondary"],
  ]);
});

test("target-row action buttons do not toggle chart visibility", () => {
  const chip = {
    localName: "ha-target-picker-item-row",
    type: "entity",
    itemId: "sensor.gas",
  };
  const attributes = {
    localName: "button",
    dataset: { advancedHistorySeries: "sensor.gas" },
  };
  const context = {
    _targets: { entity_id: ["sensor.gas"] },
    _y2Targets: { entity_id: [] },
  };

  const details = TargetPickerMethods.prototype._nativeTargetChipEventDetails.call(
    context,
    { composedPath: () => [attributes, chip] },
    "primary",
  );

  assert.equal(details, undefined);
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

test("native 2026.9 target rows are recognised as editable targets", () => {
  const row = {
    localName: "ha-target-picker-item-row",
    type: "entity",
    itemId: "climate.lounge",
  };
  const context = {
    _targets: { entity_id: ["climate.lounge"] },
    _y2Targets: { entity_id: [] },
  };
  const details = TargetPickerMethods.prototype._nativeTargetChipEventDetails.call(
    context,
    { composedPath: () => [row] },
    "primary",
  );

  assert.equal(details.chip, row);
  assert.equal(details.kind, "entity_id");
});

test("native target discovery includes legacy chips and 2026.9 item rows", () => {
  const chip = { localName: "ha-target-picker-value-chip" };
  const row = { localName: "ha-target-picker-item-row" };
  const group = {
    shadowRoot: {
      querySelectorAll(selector) {
        assert.equal(selector, "ha-target-picker-item-row:not([sub-entry])");
        return [row];
      },
    },
  };
  const targetPicker = {
    shadowRoot: {
      querySelectorAll(selector) {
        if (selector === "ha-target-picker-value-chip") return [chip];
        if (selector === "ha-target-picker-item-group") return [group];
        return [];
      },
    },
  };

  assert.deepEqual(
    TargetPickerMethods.prototype._nativeTargetPickerItems(targetPicker),
    [chip, row],
  );
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
    blur() { listeners.blur?.(); },
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
    _nativeTargetItemControlHost:
      TargetPickerMethods.prototype._nativeTargetItemControlHost,
  };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => input };

  try {
    await TargetPickerMethods.prototype._beginTargetNameEdit.call(
      context,
      chip,
      "sensor.gas",
    );
    let keydownStopped = false;
    let keydownPrevented = false;
    listeners.keydown({
      key: "Enter",
      stopPropagation() { keydownStopped = true; },
      preventDefault() { keydownPrevented = true; },
    });
    assert.equal(keydownStopped, true);
    assert.equal(keydownPrevented, true);
    let keyupStopped = false;
    listeners.keyup({ stopPropagation() { keyupStopped = true; } });
    assert.equal(keyupStopped, true);
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
