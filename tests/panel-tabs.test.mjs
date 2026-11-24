import assert from "node:assert/strict";
import test from "node:test";

import { PanelTabsMethods } from "../custom_components/advanced_history/frontend/panel-tabs.js";
import { StorageMethods } from "../custom_components/advanced_history/frontend/storage.js";
import { cardConfigToSnapshot, consumeCardHandoff, installCardHandoffApi } from "../custom_components/advanced_history/frontend/card-handoff.js";
import { CARD_HANDOFF_QUERY_PARAM } from "../custom_components/advanced_history/frontend/constants.js";

function browserStorage(t) {
  const values = new Map();
  for (const [key, value] of Object.entries({
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    location: { search: "" },
    window: { location: { origin: "http://homeassistant.local" }, dispatchEvent() {} },
    history: { pushState(_state, _title, url) { globalThis.location.search = new URL(url, "http://homeassistant.local").search; } },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  return values;
}

function handoffContext() {
  let nextId = 0;
  const context = Object.assign(Object.create(PanelTabsMethods.prototype), {
    maxTabs: 2,
    _panelTabs: [],
    _panelTabsStorageInspected: true,
    _clone: structuredClone,
    _newSnapshotId: () => `snapshot-${++nextId}`,
    _panelTabId: () => `tab-${++nextId}`,
    _captureTargetSidebarPanelState: () => ({}),
    _panelTabsDependencySupported: () => true,
    _desktopPanelLayoutAvailable: () => true,
    _capturePanelTabState() { return structuredClone(this.displayedState); },
    _restorePanelTab(tab) { this.displayedState = structuredClone(tab.state); },
  });
  for (let index = 0; index < context.maxTabs; index++) {
    context._panelTabs.push({ id: `regular-${index}`, state: context._blankPanelTabState() });
  }
  context._activePanelTabId = context._panelTabs[0].id;
  context._restorePanelTab(context._panelTabs[0]);
  return context;
}

function openMoreInfo(context, entity) {
  context._pendingPanelTabHandoff = {
    moreInfo: true,
    snapshot: cardConfigToSnapshot({ entities: [{ entity }], hours_to_show: 4 }, null, true),
  };
  assert.equal(context._openPendingPanelTabHandoff(), true);
  return context._panelTabs.find((tab) => tab.id === context._activePanelTabId);
}

test("More Info handoff survives navigation and is consumed only once", (t) => {
  browserStorage(t);
  installCardHandoffApi();
  assert.equal(window.advancedHistory.openCard({ entities: ["sensor.room"], moreInfo: true }), true);
  const params = new URLSearchParams(location.search);
  assert.ok(params.has(CARD_HANDOFF_QUERY_PARAM));
  const handoff = consumeCardHandoff(params);
  assert.equal(handoff.openMode, "more_info");
  assert.deepEqual(handoff.snapshot.targets.entity_id, ["sensor.room"]);
  assert.equal(consumeCardHandoff(params), null);
  assert.equal(window.advancedHistory.openCard({ entities: ["sensor.other"], newPanel: true }), true);
  assert.equal(consumeCardHandoff(new URLSearchParams(location.search)).openMode, "new_panel");
});

test("loading a More Info link queues the dedicated tab without replacing regular targets", async (t) => {
  browserStorage(t);
  installCardHandoffApi();
  window.advancedHistory.openCard({ entities: ["sensor.room"], moreInfo: true });
  const storage = Object.assign(Object.create(StorageMethods.prototype), {
    _targets: { area_id: [], device_id: [], entity_id: ["sensor.original"] },
    _validateSharedSnapshot: (snapshot) => snapshot,
    _sharedSnapshotFromUrl: async () => null,
    _loadCurrentSnapshot: () => null,
  });
  await storage._loadTargets();
  assert.equal(storage._pendingPanelTabHandoff.moreInfo, true);
  assert.deepEqual(storage._pendingPanelTabHandoff.snapshot.targets.entity_id, ["sensor.room"]);
  assert.deepEqual(storage._targets.entity_id, ["sensor.original"]);
  assert.equal(storage._incomingTargetOverride, undefined);
});

test("More Info reuses one tab at the regular panel limit, including on mobile", (t) => {
  browserStorage(t);
  const context = handoffContext();
  context._desktopPanelLayoutAvailable = () => false;
  const original = structuredClone(context._panelTabs);
  const first = openMoreInfo(context, "sensor.room");
  assert.equal(first.name, "More-Info");
  assert.equal(context._panelTabs.length, 3);
  context.displayedState.undo = [{ targets: { entity_id: ["sensor.old"] } }];
  context.displayedState.loaded_bookmark_id = "old-bookmark";
  const second = openMoreInfo(context, "sensor.other");
  assert.equal(second.id, first.id);
  assert.equal(context._panelTabs.length, 3);
  assert.deepEqual(context._panelTabs.slice(0, 2), original);
  assert.deepEqual(second.state.snapshot.targets.entity_id, ["sensor.other"]);
  assert.deepEqual(second.state.undo, []);
  assert.equal(second.state.loaded_bookmark_id, null);
});

test("restoring a full panel collection retains and reuses the extra More-Info tab", (t) => {
  browserStorage(t);
  const first = handoffContext();
  const special = openMoreInfo(first, "sensor.room");
  const restored = handoffContext();
  restored._pendingPanelTabHandoff = { moreInfo: true, snapshot: special.state.snapshot };
  assert.equal(restored._restorePersistedPanelTabs(), true);
  assert.equal(restored._panelTabs.length, 3);
  assert.equal(restored._activePanelTabId, special.id);
  assert.equal(openMoreInfo(restored, "sensor.other").id, special.id);
  assert.equal(restored._regularPanelTabCount(), 2);
  restored._panelTabs.splice(0, 1);
  restored._addPanelTab();
  assert.equal(restored._regularPanelTabCount(), 2);
  assert.equal(restored._panelTabs.length, 3);
});

test("bookmarks saved from More Info are independent chart snapshots", (t) => {
  browserStorage(t);
  const context = handoffContext();
  const tab = openMoreInfo(context, "sensor.room");
  let saved;
  const storage = Object.assign(Object.create(StorageMethods.prototype), {
    _clone: structuredClone,
    _activeSnapshot: tab.state.snapshot.chart,
    _targets: tab.state.snapshot.targets,
    _hiddenTargets: tab.state.snapshot.hidden_targets,
    _y2Targets: tab.state.snapshot.y2_targets,
    _hiddenY2Targets: tab.state.snapshot.hidden_y2_targets,
    _capturePeriodSnapshot: () => ({ start: "2026-11-24T00:00:00Z", end: "2026-11-24T04:00:00Z" }),
    _normalizeSnapshotChart: (chart) => chart,
    _newSnapshotId: () => "saved-bookmark",
    _loadLibrary: () => [],
    _saveLibrary: (_key, items) => { saved = items[0]; return true; },
    _snapshotFingerprint: JSON.stringify,
    _setExternalBookmarkAlias() {},
    _recordChange() {},
  });
  assert.equal(storage._saveCurrentBookmark("Room temperature"), true);
  assert.equal(saved.name, "Room temperature");
  assert.equal(saved.kind, undefined);
  assert.equal(saved.chart.kind, undefined);
  assert.equal(saved.chart.single_graph, true);
  assert.equal(saved.source_bookmark_id, undefined);
  openMoreInfo(context, "sensor.other");
  assert.deepEqual(saved.targets.entity_id, ["sensor.room"]);
  assert.deepEqual(saved.chart.entity_options, {});
});

function scrollFixture({ scrollLeft, clientWidth = 300, scrollWidth = 800 }) {
  const starts = [0, 180, 360, 540, 720];
  const tabs = {
    scrollLeft,
    clientWidth,
    scrollWidth,
    getBoundingClientRect: () => ({ left: 50 }),
    querySelectorAll: () => starts.map((left) => ({
      getBoundingClientRect: () => ({
        left: 50 + left - scrollLeft,
        width: 180,
      }),
    })),
    scrollTo(options) {
      this.lastScroll = options;
    },
  };
  return tabs;
}

test("panel tab arrows scroll to tab snap points in both directions", () => {
  const context = Object.create(PanelTabsMethods.prototype);
  const tabs = scrollFixture({ scrollLeft: 180 });

  context._scrollPanelTabs(tabs, 1);
  assert.deepEqual(tabs.lastScroll, { left: 360, behavior: "smooth" });

  tabs.scrollLeft = 540;
  context._scrollPanelTabs(tabs, -1);
  assert.deepEqual(tabs.lastScroll, { left: 360, behavior: "smooth" });
});

test("panel tab arrows clamp scrolling to the available range", () => {
  const context = Object.create(PanelTabsMethods.prototype);
  const tabs = scrollFixture({ scrollLeft: 500 });

  context._scrollPanelTabs(tabs, 1);
  assert.deepEqual(tabs.lastScroll, { left: 500, behavior: "smooth" });

  tabs.scrollLeft = 0;
  context._scrollPanelTabs(tabs, -1);
  assert.deepEqual(tabs.lastScroll, { left: 0, behavior: "smooth" });
});
