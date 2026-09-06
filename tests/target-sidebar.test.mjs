import assert from "node:assert/strict";
import test from "node:test";

import { StorageMethods } from "../custom_components/advanced_history/frontend/storage.js";
import { TargetPickerMethods } from "../custom_components/advanced_history/frontend/target-picker.js";

test("target sidebars require Home Assistant 2026.9 unless legacy layout is selected", () => {
  const context = {
    _hass: { config: { version: "2026.9.0b1" } },
    config: { use_legacy_target_picker: false },
    _homeAssistantVersionAtLeast: TargetPickerMethods.prototype._homeAssistantVersionAtLeast,
  };

  assert.equal(TargetPickerMethods.prototype._useTargetSidebar.call(context), true);
  context._hass.config.version = "2026.8.7";
  assert.equal(TargetPickerMethods.prototype._useTargetSidebar.call(context), false);
  context._hass.config.version = "2027.1.0";
  context.config.use_legacy_target_picker = true;
  assert.equal(TargetPickerMethods.prototype._useTargetSidebar.call(context), false);
});

test("primary and secondary target panes keep independent visibility", () => {
  const context = {
    _narrow: false,
    _targetPrimarySourcesShown: false,
    _targetSecondarySourcesShown: true,
  };

  assert.equal(
    TargetPickerMethods.prototype._targetSidebarShown.call(context, "primary"),
    false,
  );
  assert.equal(
    TargetPickerMethods.prototype._targetSidebarShown.call(context, "secondary"),
    true,
  );
});

test("broad-target detection ignores entity additions and unchanged targets", () => {
  const current = {
    area_id: ["lounge"],
    device_id: [],
    entity_id: ["sensor.temperature"],
  };
  const addedArea = { ...current, area_id: ["lounge", "kitchen"] };
  const addedDevice = { ...current, device_id: "device-one" };
  const addedEntity = { ...current, entity_id: [...current.entity_id, "sensor.humidity"] };

  assert.equal(
    TargetPickerMethods.prototype._broadTargetAdded.call({}, current, addedArea),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._broadTargetAdded.call({}, current, addedDevice),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._broadTargetAdded.call({}, current, addedEntity),
    false,
  );
  assert.equal(
    TargetPickerMethods.prototype._broadTargetAdded.call({}, current, current),
    false,
  );

  const context = {
    _broadTargetAdded: TargetPickerMethods.prototype._broadTargetAdded,
  };
  assert.equal(
    TargetPickerMethods.prototype._shouldWarnAboutBroadTarget.call(
      context,
      "primary",
      current,
      addedArea,
    ),
    false,
  );
  assert.equal(
    TargetPickerMethods.prototype._shouldWarnAboutBroadTarget.call(
      context,
      "secondary",
      current,
      addedArea,
    ),
    true,
  );
});

test("target sidebar panes and chips receive axis-specific counts", () => {
  const elements = new Map();
  const element = () => ({
    dataset: {},
    hidden: false,
    listeners: {},
    addEventListener(name, listener) { this.listeners[name] = listener; },
  });
  for (const id of [
    "target-sources-pane-primary",
    "target-sources-pane-secondary",
    "target-sources-chip-primary",
    "target-sources-chip-secondary",
  ]) elements.set(id, element());
  const toolbar = element();
  const context = {
    _narrow: false,
    _hass: { config: { version: "2026.9.0" } },
    config: { use_legacy_target_picker: false },
    _targets: { area_id: [], device_id: [], entity_id: ["sensor.one"] },
    _y2Targets: { area_id: [], device_id: ["device-two"], entity_id: ["sensor.two"] },
    _targetPrimarySourceFilters: { types: ["sensor/temperature"] },
    _targetSecondarySourceFilters: {},
    shadowRoot: {
      getElementById(id) { return elements.get(id); },
      querySelector(selector) { return selector === ".target-sidebar-toolbar" ? toolbar : null; },
    },
    _customLocalize(key) { return key === "primary_axis" ? "Primary axis" : "Secondary axis"; },
    _targetCount(targets) {
      return targets.area_id.length + targets.device_id.length + targets.entity_id.length;
    },
    _secondaryAxisEditable() { return true; },
    clearedAxes: [],
    _requestClearTargetSources(axis) { this.clearedAxes.push(axis); },
  };
  for (const name of [
    "_homeAssistantVersionAtLeast",
    "_useTargetSidebar",
    "_targetSidebarShown",
    "_saveTargetSidebarState",
    "_setTargetSidebarShown",
    "_targetSourceFilters",
    "_targetSourceFilterCount",
    "_syncTargetSidebarChipWeight",
    "_syncTargetSidebarHeader",
    "_syncTargetSidebars",
  ]) context[name] = TargetPickerMethods.prototype[name];

  context._syncTargetSidebars();

  assert.equal(elements.get("target-sources-pane-primary").count, 2);
  assert.equal(elements.get("target-sources-pane-secondary").count, 2);
  assert.equal(elements.get("target-sources-chip-primary").label, "Primary axis");
  assert.equal(elements.get("target-sources-chip-secondary").label, "Secondary axis");
  assert.equal(elements.get("target-sources-chip-primary").count, 1);
  assert.equal(elements.get("target-sources-chip-secondary").count, 0);
  assert.equal(
    elements.get("target-sources-chip-primary").dataset.advancedHistoryHasTargets,
    "",
  );
  assert.equal(
    elements.get("target-sources-chip-secondary").dataset.advancedHistoryHasTargets,
    "",
  );
  assert.equal(
    elements.get("target-sources-pane-primary").dataset.advancedHistoryHasTargets,
    "",
  );
  assert.equal(
    elements.get("target-sources-pane-secondary").dataset.advancedHistoryHasTargets,
    "",
  );
  assert.equal(
    elements.get("target-sources-chip-primary").dataset.advancedHistoryThemeMode,
    "light",
  );
  assert.equal(toolbar.hidden, true);

  context._targets = { area_id: [], device_id: [], entity_id: [] };
  context._targetPrimarySourceFilters = { types: ["sensor/temperature"] };
  context._syncTargetSidebars();
  assert.equal(elements.get("target-sources-chip-primary").active, true);
  assert.equal(
    elements.get("target-sources-chip-primary").dataset.advancedHistoryHasTargets,
    undefined,
  );
  assert.equal(
    elements.get("target-sources-pane-primary").dataset.advancedHistoryHasTargets,
    undefined,
  );

  context._hass.themes = { darkMode: true };
  context._targetPrimarySourceFilters = {};
  context._syncTargetSidebars();
  assert.equal(elements.get("target-sources-chip-primary").active, true);
  assert.equal(
    elements.get("target-sources-chip-secondary").dataset.advancedHistoryThemeMode,
    "dark",
  );
  assert.equal(
    elements.get("target-sources-pane-secondary").dataset.advancedHistoryThemeMode,
    "dark",
  );

  elements.get("target-sources-pane-primary").listeners["close-filter-pane"]();
  assert.equal(elements.get("target-sources-pane-primary").hidden, true);
  assert.equal(elements.get("target-sources-pane-secondary").hidden, false);
  assert.equal(toolbar.hidden, false);

  elements.get("target-sources-pane-primary").listeners["clear-filter"]();
  elements.get("target-sources-pane-secondary").listeners["clear-filter"]();
  assert.deepEqual(context.clearedAxes, ["primary", "secondary"]);
});

test("clearing an axis is confirmed and deliberately excluded from undo history", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      async loadCardHelpers() {
        return { async showConfirmationDialog() { return true; } };
      },
    },
  });
  try {
    let clearedAxis = null;
    const requestContext = {
      _targets: { area_id: [], device_id: [], entity_id: ["sensor.one"] },
      _targetCount(targets) { return targets.entity_id.length; },
      _targetSourceFilterCount() { return 0; },
      _customLocalize(key) { return key; },
      _localize(_key, fallback) { return fallback; },
      _addNativeConfirmationCloseButton() { return () => {}; },
      _clearTargetSources(axis) { clearedAxis = axis; },
    };
    const confirmed = await TargetPickerMethods.prototype._requestClearTargetSources.call(
      requestContext,
      "primary",
    );
    assert.equal(confirmed, true);
    assert.equal(clearedAxis, "primary");

    const empty = { area_id: [], device_id: [], entity_id: [] };
    const clearContext = {
      _targets: { area_id: [], device_id: [], entity_id: ["sensor.one"] },
      _y2Targets: { area_id: [], device_id: [], entity_id: ["sensor.two"] },
      _hiddenTargets: { area_id: [], device_id: [], entity_id: ["sensor.one"] },
      _hiddenY2Targets: empty,
      _targetPrimarySourceFilters: { types: ["sensor"] },
      _targetSecondarySourceFilters: {},
      _targetCount(targets) {
        const value = targets || this._targets;
        return value.area_id.length + value.device_id.length + value.entity_id.length
          + (targets ? 0 : this._y2Targets.entity_id.length);
      },
      _saveTargets() {},
      _recordChange() { assert.equal(this._incomingTargetOverride, true); },
      _clearUndoRedoHistory() { this.undoHistoryCleared = true; },
      _syncAxisTargetLayout() {},
      _syncY2ComparisonToggle() {},
      _syncY1ComparisonToggle() {},
      _syncNativeTargetVisibility() {},
      _syncTargetSidebars() {},
      _renderGraphs() {},
      shadowRoot: {
        getElementById() { return null; },
        querySelector() { return null; },
      },
    };
    TargetPickerMethods.prototype._clearTargetSources.call(clearContext, "primary");
    assert.deepEqual(clearContext._targets, empty);
    assert.deepEqual(clearContext._hiddenTargets, empty);
    assert.deepEqual(clearContext._targetPrimarySourceFilters, {});
    assert.equal(clearContext.undoHistoryCleared, true);
    assert.deepEqual(clearContext._y2Targets.entity_id, ["sensor.two"]);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
});

test("populated native axis chips override the inner label weight", async () => {
  const values = new Map();
  const assistChip = {
    active: false,
    updates: 0,
    style: {
      setProperty(name, value) { values.set(name, value); },
      removeProperty(name) { values.delete(name); },
    },
    requestUpdate() { this.updates += 1; },
  };
  const chip = {
    localName: "ha-filter-pane-chip",
    updateComplete: Promise.resolve(),
    shadowRoot: {
      querySelector(selector) {
        assert.equal(selector, "ha-assist-chip");
        return assistChip;
      },
    },
  };

  await TargetPickerMethods.prototype._syncTargetSidebarChipWeight.call({}, chip, true);
  assert.equal(
    values.get("--md-assist-chip-label-text-weight"),
    "var(--ha-font-weight-bold,700)",
  );
  assert.equal(assistChip.active, true);
  assert.equal(assistChip.updates, 1);

  await TargetPickerMethods.prototype._syncTargetSidebarChipWeight.call({}, chip, false);
  assert.equal(values.has("--md-assist-chip-label-text-weight"), false);
});

test("only the secondary filter-pane header is mirrored", async () => {
  const styles = [];
  const pane = {
    updateComplete: Promise.resolve(),
    shadowRoot: {
      querySelector() { return styles[0] || null; },
      append(style) { styles.push(style); },
    },
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement() { return { dataset: {}, textContent: "" }; },
  };
  try {
    await TargetPickerMethods.prototype._syncTargetSidebarHeader.call({}, pane, true);
    assert.equal(styles[0].textContent, ".header{flex-direction:row-reverse}");
    await TargetPickerMethods.prototype._syncTargetSidebarHeader.call({}, pane, false);
    assert.equal(styles[0].textContent, "");
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("target sidebar collapse state survives a panel reload", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const saved = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key) { return saved.get(key) ?? null; },
      setItem(key, value) { saved.set(key, value); },
    },
  });
  try {
    const first = {
      _narrow: false,
      _targetPrimarySourcesShown: undefined,
      _targetSecondarySourcesShown: undefined,
    };
    for (const name of [
      "_targetSidebarShown",
      "_saveTargetSidebarState",
      "_setTargetSidebarShown",
    ]) first[name] = TargetPickerMethods.prototype[name];

    first._setTargetSidebarShown("primary", false);
    first._setTargetSidebarShown("secondary", true);

    const restored = {
      _narrow: false,
      _targetPrimarySourcesShown: undefined,
      _targetSecondarySourcesShown: undefined,
    };
    TargetPickerMethods.prototype._restoreTargetSidebarState.call(restored);
    assert.equal(restored._targetPrimarySourcesShown, false);
    assert.equal(restored._targetSecondarySourcesShown, true);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("each panel restores its own primary and secondary sidebar state", () => {
  const context = {
    _targetPrimarySourcesShown: true,
    _targetSecondarySourcesShown: true,
    _targetSidebarShown: TargetPickerMethods.prototype._targetSidebarShown,
    _restoreTargetSidebarState() {
      throw new Error("stored defaults should not replace a panel-specific state");
    },
  };

  const first = TargetPickerMethods.prototype._captureTargetSidebarPanelState.call(context);
  context._targetPrimarySourcesShown = false;
  context._targetSecondarySourcesShown = true;
  const second = TargetPickerMethods.prototype._captureTargetSidebarPanelState.call(context);

  TargetPickerMethods.prototype._restoreTargetSidebarPanelState.call(context, first);
  assert.equal(context._targetPrimarySourcesShown, true);
  assert.equal(context._targetSecondarySourcesShown, true);

  TargetPickerMethods.prototype._restoreTargetSidebarPanelState.call(context, second);
  assert.equal(context._targetPrimarySourcesShown, false);
  assert.equal(context._targetSecondarySourcesShown, true);
});

test("opening bookmarks can collapse both target sidebars without changing snapshots", () => {
  const changes = [];
  const context = {
    _useTargetSidebar: () => true,
    _setTargetSidebarShown(axis, shown) { changes.push([axis, shown]); },
    _syncTargetSidebars() { changes.push(["sync"]); },
  };

  TargetPickerMethods.prototype._collapseTargetSidebars.call(context);
  assert.deepEqual(changes, [
    ["primary", false],
    ["secondary", false],
    ["sync"],
  ]);
});

test("source filters match native History type and integration rules", () => {
  const context = {
    _hass: {
      states: {
        "climate.room": { attributes: {} },
        "sensor.room_temperature": { attributes: { device_class: "temperature" } },
        "sensor.room_energy": { attributes: { device_class: "energy" } },
      },
      entities: {
        "climate.room": { platform: "wiser" },
        "sensor.room_temperature": { platform: "wiser" },
        "sensor.room_energy": { platform: "mqtt" },
      },
    },
    _entities: [],
    _targetPrimarySourceFilters: {
      types: ["climate", "sensor/temperature"],
      integrations: ["wiser"],
    },
    _targetSecondarySourceFilters: { types: ["sensor/energy"] },
    _targetSourceFilters: TargetPickerMethods.prototype._targetSourceFilters,
  };

  assert.equal(
    TargetPickerMethods.prototype._entityMatchesSourceFilters.call(
      context,
      "climate.room",
      "primary",
    ),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._entityMatchesSourceFilters.call(
      context,
      "sensor.room_temperature",
      "primary",
    ),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._entityMatchesSourceFilters.call(
      context,
      "sensor.room_energy",
      "primary",
    ),
    false,
  );
  assert.equal(
    TargetPickerMethods.prototype._entityMatchesSourceFilters.call(
      context,
      "sensor.room_energy",
      "secondary",
    ),
    true,
  );
});

test("source filters run against every resolved entity before the display limit", () => {
  const entities = Array.from({ length: 35 }, (_, index) => {
    const climate = index >= 30;
    return {
      entity_id: `${climate ? "climate" : "sensor"}.entity_${index + 1}`,
      area_id: "lounge",
      platform: climate ? "wiser" : "mqtt",
    };
  });
  const states = Object.fromEntries(
    entities.map((entity) => [entity.entity_id, { attributes: {} }]),
  );
  const context = {
    _hass: { states, entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])) },
    _entities: entities,
    _devices: [],
    _targets: { area_id: ["lounge"], device_id: [], entity_id: [] },
    _hiddenTargets: { area_id: [], device_id: [], entity_id: [] },
    _y2Targets: { area_id: [], device_id: [], entity_id: [] },
    _hiddenY2Targets: { area_id: [], device_id: [], entity_id: [] },
    _targetPrimarySourceFilters: { types: ["climate"] },
    config: { include_hidden: false },
    maxEntities: 30,
    _secondaryAxisVisible() { return false; },
    _normalizeTargets(value) {
      return {
        area_id: [...(value.area_id || [])],
        device_id: [...(value.device_id || [])],
        entity_id: [...(value.entity_id || [])],
      };
    },
    _customLocalize() { return "entity limit"; },
  };
  for (const name of [
    "_targetSourceFilters",
    "_entityMatchesSourceFilters",
    "_resolvedEntityIds",
  ]) context[name] = TargetPickerMethods.prototype[name];

  assert.deepEqual(context._resolvedEntityIds(), [
    "climate.entity_31",
    "climate.entity_32",
    "climate.entity_33",
    "climate.entity_34",
    "climate.entity_35",
  ]);
  assert.equal(context._notice, undefined);
});

test("area targets expose every filtered entity in stable registry order", () => {
  const entities = [
    { entity_id: "climate.itrv", area_id: "lounge", platform: "wiser" },
    { entity_id: "climate.room", area_id: "lounge", platform: "wiser" },
    { entity_id: "light.lounge", area_id: "lounge", platform: "hue" },
  ];
  const context = {
    _hass: {
      states: Object.fromEntries(entities.map(({ entity_id }) => [entity_id, { attributes: {} }])),
      entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    },
    _entities: entities,
    _devices: [],
    _targets: {
      area_id: ["lounge"],
      device_id: [],
      // This entity was selected before its containing area. It must not be
      // duplicated or change the resolved/chart order.
      entity_id: ["climate.room"],
    },
    _hiddenTargets: { area_id: [], device_id: [], entity_id: [] },
    _y2Targets: { area_id: [], device_id: [], entity_id: [] },
    _hiddenY2Targets: { area_id: [], device_id: [], entity_id: [] },
    _targetPrimarySourceFilters: { types: ["climate"] },
    config: { include_hidden: false },
    maxEntities: 30,
    _secondaryAxisVisible() { return false; },
    _normalizeTargets(value) {
      return {
        area_id: [...(value.area_id || [])],
        device_id: [...(value.device_id || [])],
        entity_id: [...(value.entity_id || [])],
      };
    },
    _customLocalize() { return "entity limit"; },
  };
  for (const name of [
    "_targetSourceFilters",
    "_entityMatchesSourceFilters",
    "_resolvedEntityIds",
    "_resolvedEntityIdsForAxis",
  ]) context[name] = TargetPickerMethods.prototype[name];

  assert.deepEqual(context._resolvedEntityIdsForAxis("primary"), [
    "climate.itrv",
    "climate.room",
  ]);
  assert.equal(context._enabledResolvedEntityIds.size, 2);
});

test("an entity resolved through an area can be hidden independently", () => {
  const context = {
    _hass: { states: { "climate.room": { attributes: {} } }, entities: {} },
    _entities: [{ entity_id: "climate.room", area_id: "lounge" }],
    _devices: [],
    _targets: { area_id: ["lounge"], device_id: [], entity_id: [] },
    _hiddenTargets: { area_id: [], device_id: [], entity_id: ["climate.room"] },
    _y2Targets: { area_id: [], device_id: [], entity_id: [] },
    _hiddenY2Targets: { area_id: [], device_id: [], entity_id: [] },
    _targetPrimarySourceFilters: {},
    config: { include_hidden: false },
    maxEntities: 30,
    _secondaryAxisVisible() { return false; },
    _normalizeTargets(value) {
      return {
        area_id: [...(value.area_id || [])],
        device_id: [...(value.device_id || [])],
        entity_id: [...(value.entity_id || [])],
      };
    },
  };
  for (const name of [
    "_targetSourceFilters",
    "_entityMatchesSourceFilters",
    "_resolvedEntityIds",
    "_targetsResolveItem",
    "_entityResolvedByParentTarget",
  ]) context[name] = TargetPickerMethods.prototype[name];

  assert.deepEqual(context._resolvedEntityIds(), ["climate.room"]);
  assert.equal(context._enabledResolvedEntityIds.has("climate.room"), false);
  assert.equal(context._targetsResolveItem(context._targets, "entity_id", "climate.room"), true);
});

test("attribute controls accept climate entities resolved by either axis", () => {
  const context = {
    _targets: { area_id: ["lounge"], device_id: [], entity_id: [] },
    _y2Targets: { area_id: [], device_id: [], entity_id: ["climate.bedroom"] },
    _targetsResolveItem(targets, kind, id) {
      return kind === "entity_id" && (
        targets.entity_id.includes(id)
        || (targets.area_id.includes("lounge") && id === "climate.lounge")
      );
    },
  };

  assert.equal(
    TargetPickerMethods.prototype._seriesTargetAvailable.call(
      context,
      "climate.lounge",
      "primary",
    ),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._seriesTargetAvailable.call(
      context,
      "climate.bedroom",
      "secondary",
    ),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._seriesTargetAvailable.call(
      context,
      "climate.bedroom",
      "primary",
    ),
    false,
  );
});

test("climate attribute choices exclude the base-state series descriptor", () => {
  const entity = "climate.lounge";
  const context = {
    _hass: {
      states: {
        [entity]: {
          state: "heat",
          attributes: {
            current_temperature: 19.5,
            temperature: 21,
          },
        },
      },
    },
    _seriesDescriptors() {
      return [
        { entity, attribute: null },
        { entity, attribute: "current_temperature" },
        { entity, attribute: "temperature" },
      ];
    },
    _effectiveEntityOptionsConfig() { return {}; },
    _nativeHistorySeries() {
      return [
        { entity, attribute: null },
        { entity, attribute: "current_temperature" },
        { entity, attribute: "temperature" },
      ];
    },
    _localize(_key, fallback) { return fallback; },
    _seriesChoiceValue(_entity, attribute) {
      return attribute == null ? "heat" : String(this._hass.states[entity].attributes[attribute]);
    },
    _attributeDisplayName(_entity, attribute) {
      assert.equal(typeof attribute, "string");
      return attribute;
    },
    _seriesStateMap() { return []; },
    _seriesStateMapValues() { return []; },
  };

  const choices = TargetPickerMethods.prototype._seriesChoices.call(context, entity);

  assert.deepEqual(
    choices.map((choice) => choice.value),
    ["state", "current_temperature", "temperature"],
  );
});

test("only independent entity targets qualify for their own remove control", () => {
  const context = {
    _entities: [
      { entity_id: "climate.lounge", area_id: "lounge" },
      { entity_id: "climate.bedroom", area_id: "bedroom" },
    ],
    _devices: [],
  };
  const targets = {
    area_id: ["lounge"],
    device_id: [],
    entity_id: ["climate.lounge", "climate.bedroom"],
  };

  assert.equal(
    TargetPickerMethods.prototype._entityResolvedByParentTarget.call(
      context,
      targets,
      "climate.lounge",
    ),
    true,
  );
  assert.equal(
    TargetPickerMethods.prototype._entityResolvedByParentTarget.call(
      context,
      targets,
      "climate.bedroom",
    ),
    false,
  );
});

test("native parent targets supply the authoritative resolved entity set", () => {
  const rows = [
    {
      type: "area",
      _entries: { referenced_entities: ["climate.lounge", "sensor.temperature"] },
    },
    {
      type: "entity",
      _entries: { referenced_entities: ["climate.explicit"] },
    },
  ];
  const nativeGroup = {
    dataset: {},
    shadowRoot: {
      querySelectorAll() { return rows; },
    },
  };
  const generatedEntityGroup = {
    dataset: { advancedHistoryResolvedAxis: "primary" },
    shadowRoot: {
      querySelectorAll() {
        throw new Error("generated entity rows must not be treated as parents");
      },
    },
  };
  const targetPicker = {
    shadowRoot: {
      querySelectorAll() { return [nativeGroup, generatedEntityGroup]; },
    },
  };

  assert.deepEqual(
    [...TargetPickerMethods.prototype._nativeParentResolvedEntityIds(targetPicker)],
    ["climate.lounge", "sensor.temperature"],
  );
});

test("an unchanged resolved entity group is not rebuilt during live state updates", async () => {
  let itemWrites = 0;
  let hassWrites = 0;
  let updateRequests = 0;
  const group = {
    dataset: {
      advancedHistoryResolvedAxis: "primary",
      advancedHistoryEntitySignature: JSON.stringify(["climate.lounge"]),
    },
    updateComplete: Promise.resolve(),
    set items(_value) { itemWrites += 1; },
    set hass(_value) { hassWrites += 1; },
    requestUpdate() { updateRequests += 1; },
  };
  const host = {
    querySelector() { return group; },
  };
  const targetPicker = {
    shadowRoot: {
      querySelector(selector) {
        return selector === ".item-groups" ? host : null;
      },
    },
  };

  await TargetPickerMethods.prototype._syncResolvedEntityTargetGroup.call(
    {},
    targetPicker,
    "primary",
    ["climate.lounge"],
  );

  assert.equal(itemWrites, 0);
  assert.equal(hassWrites, 0);
  assert.equal(updateRequests, 0);
});

test("parent membership is resolved through Home Assistant and cached", async () => {
  const calls = [];
  const context = {
    _hass: {
      async callWS(message) {
        calls.push(message);
        return { referenced_entities: ["climate.lounge", "climate.itrv"] };
      },
    },
  };
  const targets = {
    area_id: ["lounge"],
    device_id: [],
    entity_id: ["climate.lounge"],
  };

  const first = await TargetPickerMethods.prototype._resolvedParentEntityIds.call(
    context,
    "primary",
    targets,
  );
  const second = await TargetPickerMethods.prototype._resolvedParentEntityIds.call(
    context,
    "primary",
    targets,
  );

  assert.deepEqual([...first], ["climate.lounge", "climate.itrv"]);
  assert.equal(second, first);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    type: "extract_from_target",
    target: { area_id: ["lounge"] },
    expand_group: false,
    primary_entities_only: false,
  });
});

test("source filters are captured and restored as chart snapshot state", () => {
  const context = {
    _activeSnapshot: {},
    _targets: { area_id: ["lounge"], device_id: [], entity_id: [] },
    _hiddenTargets: { area_id: [], device_id: [], entity_id: [] },
    _y2Targets: { area_id: [], device_id: [], entity_id: [] },
    _hiddenY2Targets: { area_id: [], device_id: [], entity_id: [] },
    _targetPrimarySourceFilters: { types: ["climate"] },
    _targetSecondarySourceFilters: { integrations: ["mqtt"] },
    _loadedBookmarkId: null,
    _loadedExternalBookmark: false,
    _loadedExternalBookmarkOwnerId: null,
    _loadedExternalBookmarkId: null,
    _excludeY2Comparison: false,
    _comparisonBannerVisible: true,
    _panelTimeRange: null,
    _panelRollingHours: null,
    _panelRollingResumeHours: null,
    _capturePeriodSnapshot() { return { start: "2026-09-06T00:00:00Z", end: "2026-09-06T23:59:59Z" }; },
    _normalizeSnapshotChart(value) { return value; },
    _clone(value) { return value == null ? value : structuredClone(value); },
    _newSnapshotId() { return "snapshot-id"; },
  };

  const snapshot = StorageMethods.prototype._captureSnapshot.call(context);
  assert.deepEqual(snapshot.target_filters, { types: ["climate"] });
  assert.deepEqual(snapshot.y2_target_filters, { integrations: ["mqtt"] });

  const restored = {
    _normalizeTargetSourceFilters: TargetPickerMethods.prototype._normalizeTargetSourceFilters,
  };
  TargetPickerMethods.prototype._restoreTargetSourceFilters.call(restored, snapshot);
  assert.deepEqual(restored._targetPrimarySourceFilters, { types: ["climate"] });
  assert.deepEqual(restored._targetSecondarySourceFilters, { integrations: ["mqtt"] });

  const changed = structuredClone(snapshot);
  changed.target_filters = { types: ["sensor/temperature"] };
  assert.notEqual(
    StorageMethods.prototype._snapshotFingerprint.call(context, snapshot),
    StorageMethods.prototype._snapshotFingerprint.call(context, changed),
  );
});
