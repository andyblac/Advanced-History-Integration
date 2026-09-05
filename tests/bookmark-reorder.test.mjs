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
});
