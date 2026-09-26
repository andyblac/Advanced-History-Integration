import assert from "node:assert/strict";
import test from "node:test";

import { StorageMethods } from "../custom_components/advanced_history/frontend/storage.js";

const bookmarks = [
  { id: "one", name: "One" },
  { id: "two", name: "Two" },
  { id: "three", name: "Three" },
];

test("bookmark reorder persists the complete reordered personal library", () => {
  const saves = [];
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _loadLibrary: () => bookmarks,
    _saveLibrary: (key, items) => {
      saves.push({ key, items });
      return true;
    },
  });

  assert.equal(context._saveBookmarkOrder(["three", "one", "two"]), true);
  assert.deepEqual(saves[0].items, [bookmarks[2], bookmarks[0], bookmarks[1]]);
});

test("bookmark reorder rejects incomplete, duplicate, unknown, and unchanged orders", () => {
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _loadLibrary: () => bookmarks,
    _saveLibrary: () => assert.fail("invalid order must not be saved"),
  });

  assert.equal(context._saveBookmarkOrder(["one", "two"]), false);
  assert.equal(context._saveBookmarkOrder(["one", "one", "three"]), false);
  assert.equal(context._saveBookmarkOrder(["one", "two", "missing"]), false);
  assert.equal(context._saveBookmarkOrder(["one", "two", "three"]), false);
});

test("only editable bookmark rows expose reorder handles", () => {
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _escape: (value) => String(value),
    _localize: (_key, fallback) => fallback,
    _customLocalize: (key) => key,
    _snapshotSummary: () => "summary",
    _snapshotLabel: () => "snapshot",
    _bookmarkHasChanges: () => false,
    _hass: { user: { id: "user", is_admin: false } },
  });

  const editable = context._libraryRows(bookmarks, true, { readOnly: false });
  const shared = context._libraryRows(bookmarks, true, { readOnly: true });
  const history = context._libraryRows(bookmarks, false, { readOnly: false });

  assert.match(editable, /data-drag-bookmark="one"/);
  assert.match(editable, /data-bookmark-row="three"/);
  assert.doesNotMatch(shared, /data-drag-bookmark/);
  assert.doesNotMatch(history, /data-drag-bookmark/);
  assert.match(editable, /data-rename-snapshot="one"/);
  assert.doesNotMatch(shared, /data-rename-snapshot/);
  assert.doesNotMatch(history, /data-rename-snapshot/);
});

test("bookmark rename preserves the snapshot and syncs the personal library", () => {
  const saves = [];
  const current = { id: "current", name: "One" };
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _loadedBookmarkId: "one",
    _currentSnapshot: current,
    _loadLibrary: () => bookmarks.map((bookmark) => ({ ...bookmark })),
    _saveLibrary: (key, items) => {
      saves.push({ key, items });
      return true;
    },
    _saveCurrentSnapshot: (snapshot) => saves.push({ current: { ...snapshot } }),
  });

  assert.equal(context._renameBookmark("one", "  New name  "), true);
  assert.equal(saves[0].items[0].name, "New name");
  assert.equal(saves[0].items[0].id, "one");
  assert.equal(current.name, "New name");
  assert.deepEqual(saves[1].current, current);
});

test("bookmark rename rejects blank, unknown, and unchanged names", () => {
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _loadLibrary: () => bookmarks.map((bookmark) => ({ ...bookmark })),
    _saveLibrary: () => assert.fail("invalid rename must not be saved"),
  });

  assert.equal(context._renameBookmark("one", "  "), false);
  assert.equal(context._renameBookmark("missing", "New name"), false);
  assert.equal(context._renameBookmark("one", "One"), false);
});

test("bookmark snapshots capture the selected detail mode", () => {
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _activeSnapshot: {
      defaults_mode: "overrides",
      card_options: {},
      entity_options: {},
    },
    _detailMode: "manual",
    _detailModeValue: () => "manual",
    _capturePeriodSnapshot: () => null,
    _newSnapshotId: () => "snapshot",
    _targets: {},
    _hiddenTargets: {},
    _y2Targets: {},
    _hiddenY2Targets: {},
    _targetPrimarySourceFilters: {},
    _targetSecondarySourceFilters: {},
  });

  assert.equal(context._captureSnapshot().chart.detail_mode, "manual");
});

test("legacy bookmark detail mode is treated as Auto", () => {
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    config: {},
  });
  const legacyChart = {
    defaults_mode: "overrides",
    card_options: {},
    entity_options: {},
  };
  const normalized = context._normalizeSnapshotChart(legacyChart);

  assert.equal(normalized.detail_mode, "auto");
  assert.equal(legacyChart.detail_mode, undefined);
});

test("legacy and explicit Auto bookmark fingerprints match", () => {
  const context = Object.create(StorageMethods.prototype);
  const snapshot = {
    targets: {},
    hidden_targets: {},
    y2_targets: {},
    hidden_y2_targets: {},
    target_filters: {},
    y2_target_filters: {},
    chart: { defaults_mode: "overrides" },
    period: null,
  };

  assert.equal(
    context._snapshotFingerprint(snapshot),
    context._snapshotFingerprint({
      ...snapshot,
      chart: { ...snapshot.chart, detail_mode: "auto" },
    }),
  );
});

test("changing detail mode marks a loaded legacy bookmark as changed", () => {
  const base = {
    targets: { entity_id: ["sensor.power"] },
    hidden_targets: {},
    y2_targets: {},
    hidden_y2_targets: {},
    target_filters: {},
    y2_target_filters: {},
    chart: { defaults_mode: "overrides" },
    period: null,
  };
  const context = Object.assign(Object.create(StorageMethods.prototype), {
    _loadedBookmarkId: "bookmark",
    _loadedExternalBookmark: false,
    _loadedExternalBookmarkOwnerId: null,
    _loadedExternalBookmarkId: null,
    _loadedBookmarkDirty: false,
    _freshSnapshotSessionFingerprint: null,
    _currentSnapshot: structuredClone(base),
    _incomingTargetOverride: false,
    _periodRestoreLoading: false,
    _captureSnapshot: () => ({
      ...structuredClone(base),
      chart: { ...base.chart, detail_mode: "manual" },
    }),
    _snapshotTargetCount: () => 1,
    _newSnapshotId: () => "current",
    _snapshotLabel: () => "Current",
    _pushUndoSnapshot: () => {},
    _saveLibrary: () => true,
    _saveCurrentSnapshot: () => {},
    _updateUndoRedoButtons: () => {},
    _persistPanelTabs: () => {},
  });
  context._loadedBookmarkBaselineFingerprint = context._snapshotFingerprint(base);

  context._recordChange(null, true);

  assert.equal(context._loadedBookmarkDirty, true);
});
