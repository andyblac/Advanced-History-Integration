import {
  BOOKMARKS_DIRTY_STORAGE_KEY,
  BOOKMARKS_LIMIT,
  BOOKMARKS_STORAGE_KEY,
  CARD_HANDOFF_QUERY_PARAM,
  CURRENT_SNAPSHOT_STORAGE_KEY,
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  REDO_STORAGE_KEY,
  SHARE_QUERY_PARAM,
  STORAGE_KEY,
  UNDO_LIMIT,
  UNDO_STORAGE_KEY,
} from "./constants.js";
import { consumeCardHandoff } from "./card-handoff.js";

export class StorageMethods {
  async _loadTargets() {
    const params = new URLSearchParams(location.search);
    const handedOffSnapshot = this._validateSharedSnapshot(consumeCardHandoff(params));
    const sharedSnapshot = await this._sharedSnapshotFromUrl(params);
    if (params.has(CARD_HANDOFF_QUERY_PARAM) && !handedOffSnapshot) {
      const url = new URL(location.href);
      url.searchParams.delete(CARD_HANDOFF_QUERY_PARAM);
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (params.has(SHARE_QUERY_PARAM) && !sharedSnapshot) {
      const url = new URL(location.href);
      url.searchParams.delete(SHARE_QUERY_PARAM);
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      this._notice = this._customLocalize("shared_link_invalid");
    }
    const fromUrl = { area_id: params.getAll("area_id"), device_id: params.getAll("device_id"), entity_id: params.getAll("entity_id") };
    const y2FromUrl = { area_id: params.getAll("y2_area_id"), device_id: params.getAll("y2_device_id"), entity_id: params.getAll("y2_entity_id") };
    const previous = this._loadCurrentSnapshot();
    const incomingSnapshot = handedOffSnapshot || sharedSnapshot;
    if (incomingSnapshot) {
      this._loadedBookmarkId = null;
      this._loadedExternalBookmark = false;
      if (
        previous?.targets &&
        this._snapshotTargetCount(previous) &&
        this._snapshotFingerprint(previous) !== this._snapshotFingerprint(incomingSnapshot)
      ) {
        this._archiveSnapshot(previous);
        this._pushUndoSnapshot(previous);
        this._saveLibrary(REDO_STORAGE_KEY, []);
      }
      this._targets = this._normalizeTargets(incomingSnapshot.targets);
      this._hiddenTargets = this._normalizeTargets(incomingSnapshot.hidden_targets || {});
      this._y2Targets = this._normalizeTargets(incomingSnapshot.y2_targets || {});
      this._hiddenY2Targets = this._normalizeTargets(incomingSnapshot.hidden_y2_targets || {});
      incomingSnapshot.chart = this._normalizeSnapshotChart(incomingSnapshot.chart);
      this._excludeY2Comparison = Boolean(incomingSnapshot.chart.exclude_y2_comparison);
      this._activeSnapshot = this._clone(incomingSnapshot.chart);
      this._panelTimeRange = this._clone(incomingSnapshot.chart?.time_range) || null;
      this._pendingPeriodRestore = this._clone(incomingSnapshot.period);
      if (this._pendingPeriodRestore?.start) {
        this._beginPeriodRestore(this._pendingPeriodRestore);
      }
      this._currentSnapshot = this._clone(incomingSnapshot);
      this._incomingTargetOverride = true;
      this._pruneHiddenTargets();
      this._saveCurrentSnapshot(incomingSnapshot);
      this._replaceIncomingUrlWithTargets();
      return;
    }
    const hasUrlTargets = [...Object.values(fromUrl), ...Object.values(y2FromUrl)]
      .some((items) => items.length);
    if (hasUrlTargets) {
      this._loadedBookmarkId = null;
      this._loadedExternalBookmark = false;
      if (
        previous?.targets &&
        this._snapshotTargetCount(previous) &&
        this._snapshotFingerprint(previous) !== this._snapshotFingerprint({
          ...previous,
          targets: fromUrl,
          y2_targets: y2FromUrl,
        })
      ) {
        this._archiveSnapshot(previous);
        this._pushUndoSnapshot(previous);
        this._saveLibrary(REDO_STORAGE_KEY, []);
        this._incomingTargetOverride = true;
      }
      this._targets = fromUrl;
      this._hiddenTargets = { area_id: [], device_id: [], entity_id: [] };
      this._y2Targets = y2FromUrl;
      this._hiddenY2Targets = { area_id: [], device_id: [], entity_id: [] };
    }
    else {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (stored) this._targets = this._normalizeTargets(stored);
      } catch (_) { /* Ignore corrupt local storage. */ }
    }
    if (
      previous?.targets &&
      JSON.stringify(this._normalizeTargets(previous.targets)) === JSON.stringify(this._targets) &&
      JSON.stringify(this._normalizeTargets(previous.y2_targets || {})) === JSON.stringify(this._y2Targets)
    ) {
      this._currentSnapshot = this._clone(previous);
      this._loadedBookmarkId = previous.source_bookmark_id || null;
      this._loadedExternalBookmark = Boolean(previous.source_external_bookmark);
      const loadedBookmark = this._loadedBookmarkId
        ? this._loadLibrary(BOOKMARKS_STORAGE_KEY).find((item) => item.id === this._loadedBookmarkId)
        : null;
      this._loadedBookmarkBaselineFingerprint = loadedBookmark
        ? this._snapshotFingerprint(loadedBookmark)
        : null;
      this._loadedBookmarkDirty = Boolean(
        loadedBookmark &&
        this._snapshotFingerprint(previous) !== this._loadedBookmarkBaselineFingerprint
      );
      previous.chart = this._normalizeSnapshotChart(previous.chart);
      this._excludeY2Comparison = Boolean(previous.chart.exclude_y2_comparison);
      this._activeSnapshot = this._clone(previous.chart);
      this._currentSnapshot.chart = this._clone(previous.chart);
      this._saveCurrentSnapshot(this._currentSnapshot);
      this._panelTimeRange = this._clone(previous.chart?.time_range) || null;
      this._pendingPeriodRestore = this._clone(previous.period);
      if (this._pendingPeriodRestore?.start) {
        this._beginPeriodRestore(this._pendingPeriodRestore);
      }
      this._hiddenTargets = this._normalizeTargets(previous.hidden_targets || {});
      this._y2Targets = this._normalizeTargets(previous.y2_targets || {});
      this._hiddenY2Targets = this._normalizeTargets(previous.hidden_y2_targets || {});
      this._pruneHiddenTargets();
    }
  }

  _normalizeTargets(value) {
    const list = (item) => item == null ? [] : Array.isArray(item) ? item : [item];
    return {
      area_id: [...new Set(list(value.area_id))],
      device_id: [...new Set(list(value.device_id))],
      entity_id: [...new Set(list(value.entity_id))],
    };
  }

  _saveTargets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._targets));
    const url = new URL(location.href);
    url.searchParams.delete(SHARE_QUERY_PARAM);
    url.searchParams.delete(CARD_HANDOFF_QUERY_PARAM);
    ["area_id", "device_id", "entity_id"].forEach((key) => {
      url.searchParams.delete(key);
      this._targets[key].forEach((value) => url.searchParams.append(key, value));
      const y2Key = `y2_${key}`;
      url.searchParams.delete(y2Key);
      this._y2Targets[key].forEach((value) => url.searchParams.append(y2Key, value));
    });
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  _clone(value) {
    if (value == null) return value;
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  _storageKey(key) {
    if (key !== BOOKMARKS_STORAGE_KEY) return key;
    const userId = this._hass?.user?.id;
    return userId ? `${key}.${userId}` : key;
  }

  _bookmarkDirtyKey() {
    const userId = this._hass?.user?.id;
    return userId ? `${BOOKMARKS_DIRTY_STORAGE_KEY}.${userId}` : BOOKMARKS_DIRTY_STORAGE_KEY;
  }

  _loadRawLibrary(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  _loadLibrary(key) {
    return this._loadRawLibrary(this._storageKey(key));
  }

  _saveLocalLibrary(key, items) {
    try {
      localStorage.setItem(this._storageKey(key), JSON.stringify(items));
      return true;
    } catch (error) {
      console.error("Advanced History: unable to save chart library", error);
      this._notice = this._customLocalize("save_library_error");
      return false;
    }
  }

  _bookmarksDirty() {
    try {
      return localStorage.getItem(this._bookmarkDirtyKey()) === "1";
    } catch (_) {
      return false;
    }
  }

  _setBookmarksDirty(dirty) {
    try {
      if (dirty) localStorage.setItem(this._bookmarkDirtyKey(), "1");
      else localStorage.removeItem(this._bookmarkDirtyKey());
    } catch (_) { /* Server sync can continue without a local dirty marker. */ }
  }

  async _saveBookmarksToServer(items) {
    this._setBookmarksDirty(true);
    await this._hass.callWS({
      type: "advanced_history/bookmarks/save",
      bookmarks: this._clone(items),
    });
    this._setBookmarksDirty(false);
  }

  _queueBookmarkSync(items) {
    const bookmarks = this._clone(items);
    this._bookmarkSaveQueue = this._bookmarkSaveQueue
      .catch(() => undefined)
      .then(() => this._saveBookmarksToServer(bookmarks))
      .catch((error) => {
        console.error("Advanced History: unable to sync bookmarks", error);
        this._notice = this._customLocalize("bookmark_sync_error");
      });
  }

  _saveLibrary(key, items) {
    const savedItems = key === BOOKMARKS_STORAGE_KEY
      ? items.slice(0, BOOKMARKS_LIMIT)
      : items;
    const saved = this._saveLocalLibrary(key, savedItems);
    if (saved && key === BOOKMARKS_STORAGE_KEY) {
      if (this._bookmarkSyncReady) this._queueBookmarkSync(savedItems);
      else this._setBookmarksDirty(true);
    }
    return saved;
  }

  async _loadSyncedBookmarks() {
    const localBookmarks = this._loadLibrary(BOOKMARKS_STORAGE_KEY)
      .slice(0, BOOKMARKS_LIMIT);

    try {
      const result = await this._hass.callWS({ type: "advanced_history/bookmarks/get" });
      this._updateBookmarkCatalog(result);
      const remoteBookmarks = Array.isArray(result?.bookmarks)
        ? result.bookmarks.slice(0, BOOKMARKS_LIMIT)
        : [];
      const useLocal = this._bookmarksDirty() || !result?.initialized;
      const bookmarks = useLocal ? localBookmarks : remoteBookmarks;
      if (useLocal) await this._saveBookmarksToServer(bookmarks);
      this._saveLocalLibrary(BOOKMARKS_STORAGE_KEY, bookmarks);
      this._bookmarkSyncReady = true;
    } catch (error) {
      console.warn("Advanced History: bookmark sync is unavailable; using this device", error);
      if (localBookmarks.length) this._setBookmarksDirty(true);
      this._bookmarkSyncReady = false;
    }
  }

  async _refreshSyncedBookmarks() {
    if (!this._bookmarkSyncReady) {
      await this._loadSyncedBookmarks();
      return;
    }

    await this._bookmarkSaveQueue;
    try {
      if (this._bookmarksDirty()) {
        await this._saveBookmarksToServer(this._loadLibrary(BOOKMARKS_STORAGE_KEY));
      }
      const result = await this._hass.callWS({ type: "advanced_history/bookmarks/get" });
      this._updateBookmarkCatalog(result);
      if (result?.initialized && Array.isArray(result.bookmarks)) {
        this._saveLocalLibrary(
          BOOKMARKS_STORAGE_KEY,
          result.bookmarks.slice(0, BOOKMARKS_LIMIT)
        );
      }
    } catch (error) {
      console.warn("Advanced History: unable to refresh bookmarks", error);
      this._notice = this._customLocalize("bookmark_sync_error");
    }
  }

  _updateBookmarkCatalog(result) {
    this._bookmarkCatalog = {
      shared: Array.isArray(result?.shared_bookmarks) ? result.shared_bookmarks : [],
      users: Array.isArray(result?.users) ? result.users : [],
    };
  }

  async _loadRemoteBookmarkLibrary(userId) {
    const result = await this._hass.callWS({
      type: "advanced_history/bookmarks/get",
      user_id: userId,
    });
    this._updateBookmarkCatalog(result);
    const bookmarks = Array.isArray(result?.bookmarks) ? result.bookmarks : [];
    this._bookmarkRemoteLibraries.set(userId, bookmarks);
    return bookmarks;
  }

  _newSnapshotId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  _capturePeriodSnapshot() {
    const collection = this._energyCollection;
    const validDate = (value) => {
      const date = value instanceof Date ? value : value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    let collectionStart = validDate(collection?.start);
    let collectionEnd = validDate(collection?.end);
    const fallback = this._clone(
      this._pendingPeriodRestore
      || this._currentSnapshot?.period
      || null
    );
    const rollingCompare = this._pendingRollingCompareRestore;
    if (!collectionStart && this._panelRollingHours) {
      collectionEnd = new Date();
      collectionEnd.setSeconds(0, 0);
      collectionStart = new Date(
        collectionEnd.getTime() - this._panelRollingHours * 60 * 60 * 1000,
      );
    }
    if (!collectionStart && !fallback?.start) return null;
    return {
      start: collectionStart?.toISOString() || fallback.start,
      end: collectionEnd?.toISOString() || fallback?.end || null,
      compare: collection
        ? collection.compare ?? ""
        : rollingCompare?.compare ?? fallback?.compare ?? "",
      compare_choice: this._energyCompareChoice
        || rollingCompare?.choice
        || fallback?.compare_choice
        || null,
      compare_count: Math.max(
        1,
        Math.min(
          10,
          Math.trunc(Number(
            this._energyCompareCount
            || rollingCompare?.count
            || fallback?.compare_count
          )) || 1,
        ),
      ),
    };
  }

  _captureSnapshot(name = "") {
    const period = this._capturePeriodSnapshot();
    const activeChart = this._normalizeSnapshotChart(this._activeSnapshot || {});
    const chart = {
      defaults_mode: "overrides",
      card_options: this._clone(activeChart.card_options || {}),
      entity_options: this._clone(activeChart.entity_options || {}),
    };
    const copyChartValue = (key) => {
      if (activeChart[key] !== undefined) chart[key] = this._clone(activeChart[key]);
    };
    [
      "default_hours",
      "graph_height",
      "source_graph_height",
      "single_graph",
      "attribute_selection",
      "compare",
    ].forEach(copyChartValue);
    if (this._panelTimeRange) chart.time_range = this._clone(this._panelTimeRange);
    if (this._panelRollingHours) chart.rolling_hours = this._panelRollingHours;
    else if (this._panelRollingResumeHours) {
      chart.rolling_resume_hours = this._panelRollingResumeHours;
    }
    if (this._excludeY2Comparison) chart.exclude_y2_comparison = true;
    return {
      schema: 1,
      id: this._newSnapshotId(),
      name,
      saved_at: new Date().toISOString(),
      targets: this._clone(this._targets),
      hidden_targets: this._clone(this._hiddenTargets),
      y2_targets: this._clone(this._y2Targets),
      hidden_y2_targets: this._clone(this._hiddenY2Targets),
      chart,
      period,
      source_bookmark_id: this._loadedBookmarkId || null,
      source_external_bookmark: Boolean(this._loadedExternalBookmark),
    };
  }

  _snapshotFingerprint(snapshot) {
    const period = snapshot.chart?.rolling_hours
      ? { ...snapshot.period, start: null, end: null }
      : snapshot.period;
    return JSON.stringify({
      targets: snapshot.targets,
      hidden_targets: snapshot.hidden_targets,
      y2_targets: snapshot.y2_targets,
      hidden_y2_targets: snapshot.hidden_y2_targets,
      chart: snapshot.chart,
      period,
    });
  }

  _loadCurrentSnapshot() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(CURRENT_SNAPSHOT_STORAGE_KEY) || "null");
      return snapshot?.targets && snapshot?.chart ? snapshot : null;
    } catch (_) {
      return null;
    }
  }

  _saveCurrentSnapshot(snapshot) {
    try {
      localStorage.setItem(CURRENT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error("Advanced History: unable to save current chart snapshot", error);
    }
  }

  _snapshotLabel(snapshot = null) {
    const targets = this._normalizeTargets(snapshot ? snapshot.targets : this._targets);
    const y2Targets = this._normalizeTargets(snapshot ? snapshot.y2_targets : this._y2Targets);
    const names = [
      ...targets.area_id.map((id) => this._areaName(id)),
      ...targets.device_id.map((id) => this._deviceName(id)),
      ...targets.entity_id.map((id) => this._entityName(id)),
      ...y2Targets.area_id.map((id) => this._areaName(id)),
      ...y2Targets.device_id.map((id) => this._deviceName(id)),
      ...y2Targets.entity_id.map((id) => this._entityName(id)),
    ];
    if (!names.length) return this._customLocalize("empty_chart");
    return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  }

  _recordChange(snapshot = null, bookmarkEdit = false) {
    const source = snapshot ? this._clone(snapshot) : this._captureSnapshot();
    if (!this._snapshotTargetCount(source)) {
      this._loadedBookmarkId = null;
      this._loadedExternalBookmark = false;
    }
    source.source_bookmark_id = this._loadedBookmarkId || null;
    source.source_external_bookmark = Boolean(this._loadedExternalBookmark);
    source.id = this._newSnapshotId();
    source.name = this._snapshotLabel(source);
    source.saved_at = new Date().toISOString();
    const previous = this._currentSnapshot || this._loadCurrentSnapshot();
    const sourceFingerprint = this._snapshotFingerprint(source);
    const changed = previous && this._snapshotFingerprint(previous) !== sourceFingerprint;
    const freshSessionFingerprint = this._freshSnapshotSessionFingerprint;
    const restoringFreshSession = Boolean(
      freshSessionFingerprint &&
      (
        this._periodRestoreLoading ||
        !bookmarkEdit ||
        sourceFingerprint === freshSessionFingerprint
      )
    );
    const completingFreshSession = Boolean(
      freshSessionFingerprint
      && !this._periodRestoreLoading
      && !bookmarkEdit
      && (this._loadedBookmarkId || this._loadedExternalBookmark)
    );

    if (changed && !this._incomingTargetOverride && !restoringFreshSession) {
      this._pushUndoSnapshot(previous);
      this._saveLibrary(REDO_STORAGE_KEY, []);
    }

    this._incomingTargetOverride = false;
    this._currentSnapshot = this._clone(source);
    this._saveCurrentSnapshot(source);
    if (freshSessionFingerprint && !this._periodRestoreLoading) {
      this._freshSnapshotSessionFingerprint = null;
    }
    if (completingFreshSession) {
      this._loadedBookmarkBaselineFingerprint = sourceFingerprint;
      this._loadedBookmarkDirty = false;
    } else if (
      (this._loadedBookmarkId || this._loadedExternalBookmark)
      && bookmarkEdit
      && !restoringFreshSession
    ) {
      this._loadedBookmarkDirty = Boolean(
        this._loadedBookmarkBaselineFingerprint &&
        sourceFingerprint !== this._loadedBookmarkBaselineFingerprint
      );
    } else if (!this._loadedBookmarkId && !this._loadedExternalBookmark) {
      this._loadedBookmarkDirty = false;
    }
    this._updateUndoRedoButtons();
    this._persistPanelTabs?.();
  }

  _pushUndoSnapshot(snapshot) {
    if (!snapshot?.targets || !snapshot?.chart) return;
    const items = this._loadLibrary(UNDO_STORAGE_KEY);
    const fingerprint = this._snapshotFingerprint(snapshot);
    if (items[0] && this._snapshotFingerprint(items[0]) === fingerprint) return;
    this._saveLibrary(UNDO_STORAGE_KEY, [this._clone(snapshot), ...items].slice(0, UNDO_LIMIT));
  }

  _archiveSnapshot(snapshot) {
    if (!snapshot?.targets || !snapshot?.chart) return false;
    if (!this._snapshotTargetCount(snapshot)) return false;
    const archived = this._clone(snapshot);
    archived.id = this._newSnapshotId();
    archived.name = archived.name || this._snapshotLabel(archived);
    archived.saved_at = new Date().toISOString();
    const items = this._loadLibrary(HISTORY_STORAGE_KEY);
    const fingerprint = this._snapshotFingerprint(archived);
    if (items[0] && this._snapshotFingerprint(items[0]) === fingerprint) return false;
    return this._saveLibrary(HISTORY_STORAGE_KEY, [archived, ...items].slice(0, HISTORY_LIMIT));
  }

  _archiveCurrentChart() {
    return this._archiveSnapshot(this._captureSnapshot());
  }

  _clearUndoRedoHistory() {
    this._saveLibrary(UNDO_STORAGE_KEY, []);
    this._saveLibrary(REDO_STORAGE_KEY, []);
    this._updateUndoRedoButtons();
  }

  _clearChartSessionHistory() {
    this._freshSnapshotSessionFingerprint = null;
    this._clearLoadedBookmark();
    this._clearUndoRedoHistory();
  }

  _clearCurrentChart() {
    if (!this._targetCount()) return;
    this._archiveCurrentChart();
    this._activeSnapshot = null;
    this._targets = { area_id: [], device_id: [], entity_id: [] };
    this._hiddenTargets = { area_id: [], device_id: [], entity_id: [] };
    this._y2Targets = { area_id: [], device_id: [], entity_id: [] };
    this._hiddenY2Targets = { area_id: [], device_id: [], entity_id: [] };
    this._excludeY2Comparison = false;
    this._resetEnergySelection();
    this._saveTargets();
    this._recordChange();
    this._clearChartSessionHistory();
    this._notice = "";
    this._render();
  }

  async _requestClearCurrentChart() {
    if (!this._targetCount()) return true;
    const loadedBookmarkChanged = Boolean(
      (this._loadedBookmarkId || this._loadedExternalBookmark)
      && this._loadedBookmarkDirty
    );
    const newChart = !this._loadedBookmarkId && !this._loadedExternalBookmark;
    if (!newChart && !loadedBookmarkChanged) {
      this._clearCurrentChart();
      return true;
    }

    const action = await this._showUnsavedChangesDialog({
      title: this._customLocalize("unsaved_chart_title"),
      message: this._customLocalize(
        loadedBookmarkChanged && this._loadedBookmarkId
          ? "clear_changed_bookmark_message"
          : "clear_new_chart_message"
      ),
      saveLabel: loadedBookmarkChanged && this._loadedBookmarkId
        ? this._localize("ui.common.save", "Save")
        : this._customLocalize("create_bookmark"),
      discardLabel: this._localize("ui.common.clear", "Clear"),
    });
    if (action === "save") {
      const saved = loadedBookmarkChanged && this._loadedBookmarkId
        ? this._updateBookmark(this._loadedBookmarkId)
        : this._saveCurrentBookmark(this._snapshotLabel());
      if (!saved) return false;
    } else if (action !== "discard") {
      return false;
    }
    this._clearCurrentChart();
    return true;
  }

  _showUnsavedChangesDialog({ title, message, saveLabel, discardLabel }) {
    if (this._unsavedDialogPromise) return this._unsavedDialogPromise;
    this._unsavedDialogPromise = (async () => {
      try {
        if (typeof window.loadCardHelpers !== "function") return null;
        const helpers = await window.loadCardHelpers();
        if (typeof helpers.showConfirmationDialog !== "function") return null;
        let closed = false;
        const dialogPromise = helpers.showConfirmationDialog(this, {
          title,
          text: message,
          dismissText: saveLabel,
          confirmText: discardLabel,
          destructive: true,
        });
        const stopCloseButtonSearch = this._addNativeConfirmationCloseButton(
          title,
          () => { closed = true; },
        );
        const discard = await dialogPromise;
        stopCloseButtonSearch();
        return closed ? null : discard ? "discard" : "save";
      } finally {
        this._unsavedDialogPromise = null;
      }
    })();
    return this._unsavedDialogPromise;
  }

  async _showDeleteBookmarkDialog(bookmark) {
    if (typeof window.loadCardHelpers !== "function") return false;
    const helpers = await window.loadCardHelpers();
    if (typeof helpers.showConfirmationDialog !== "function") return false;
    const title = this._customLocalize("delete_bookmark_title");
    let closed = false;
    const dialogPromise = helpers.showConfirmationDialog(this, {
      title,
      text: this._customLocalize("confirm_delete_bookmark", {
        name: bookmark.name || this._snapshotLabel(bookmark),
      }),
      dismissText: this._localize("ui.common.cancel", "Cancel"),
      confirmText: this._localize("ui.common.delete", "Delete"),
      destructive: true,
    });
    const stopCloseButtonSearch = this._addNativeConfirmationCloseButton(
      title,
      () => { closed = true; },
    );
    const confirmed = await dialogPromise;
    stopCloseButtonSearch();
    return !closed && Boolean(confirmed);
  }

  _addNativeConfirmationCloseButton(title, onClose) {
    let stopped = false;
    let attempts = 0;
    const findDialogs = (root, found = []) => {
      if (!root?.querySelectorAll) return found;
      for (const element of root.querySelectorAll("*")) {
        if (element.localName === "dialog-box") found.push(element);
        if (element.shadowRoot) findDialogs(element.shadowRoot, found);
      }
      return found;
    };
    const attach = () => {
      if (stopped) return;
      const dialog = findDialogs(document).find((item) => item._params?.title === title);
      const header = dialog?.shadowRoot?.querySelector("ha-dialog-header");
      if (dialog && header && !header.querySelector("[data-advanced-history-close]")) {
        const button = document.createElement("ha-icon-button");
        button.slot = "navigationIcon";
        button.dataset.advancedHistoryClose = "";
        button.label = this._localize("ui.common.close", "Close");
        button.path = "M19,6.41 17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12Z";
        button.addEventListener("click", () => {
          onClose();
          dialog.shadowRoot.querySelector('ha-button[slot="secondaryAction"]')?.click();
        });
        header.prepend(button);
        return;
      }
      attempts += 1;
      if (attempts < 30) requestAnimationFrame(attach);
    };
    requestAnimationFrame(attach);
    return () => { stopped = true; };
  }

  _updateUndoRedoButtons() {
    const undo = this.shadowRoot?.getElementById("undo");
    const redo = this.shadowRoot?.getElementById("redo");
    if (undo) undo.disabled = !this._loadLibrary(UNDO_STORAGE_KEY).length;
    if (redo) redo.disabled = !this._loadLibrary(REDO_STORAGE_KEY).length;
  }

  _restoreFromHistory(sourceKey, destinationKey) {
    const source = this._loadLibrary(sourceKey);
    if (!source.length) return;
    const destination = this._loadLibrary(destinationKey);
    const current = this._currentSnapshot || this._captureSnapshot();
    const restored = source[0];

    this._saveLibrary(sourceKey, source.slice(1));
    this._saveLibrary(destinationKey, [this._clone(current), ...destination].slice(0, UNDO_LIMIT));
    this._currentSnapshot = this._clone(restored);
    this._loadedBookmarkId = restored.source_bookmark_id || null;
    this._loadedExternalBookmark = Boolean(restored.source_external_bookmark);
    const loadedBookmark = this._loadedBookmarkId
      ? this._loadLibrary(BOOKMARKS_STORAGE_KEY).find((item) => item.id === this._loadedBookmarkId)
      : null;
    this._loadedBookmarkBaselineFingerprint = loadedBookmark
      ? this._snapshotFingerprint(loadedBookmark)
      : null;
    this._loadedBookmarkDirty = Boolean(
      loadedBookmark &&
      this._snapshotFingerprint(restored) !== this._loadedBookmarkBaselineFingerprint
    );
    this._saveCurrentSnapshot(restored);
    this._applySnapshot(restored, false);
  }

  _undo() {
    this._restoreFromHistory(UNDO_STORAGE_KEY, REDO_STORAGE_KEY);
  }

  _redo() {
    this._restoreFromHistory(REDO_STORAGE_KEY, UNDO_STORAGE_KEY);
  }

  _saveCurrentBookmark(name) {
    const snapshot = this._captureSnapshot(name.trim() || this._snapshotLabel());
    delete snapshot.source_bookmark_id;
    delete snapshot.source_external_bookmark;
    const items = this._loadLibrary(BOOKMARKS_STORAGE_KEY);
    if (this._saveLibrary(BOOKMARKS_STORAGE_KEY, [snapshot, ...items])) {
      this._loadedBookmarkId = snapshot.id;
      this._loadedExternalBookmark = false;
      this._loadedBookmarkBaselineFingerprint = this._snapshotFingerprint(snapshot);
      this._loadedBookmarkDirty = false;
      this._recordChange();
      return true;
    }
    return false;
  }

  _bookmarkHasChanges(bookmark) {
    if (!bookmark || bookmark.id !== this._loadedBookmarkId) return false;
    const current = this._currentSnapshot || this._captureSnapshot();
    if (!this._snapshotTargetCount(current)) return false;
    return this._loadedBookmarkDirty;
  }

  _updateBookmark(id) {
    const items = this._loadLibrary(BOOKMARKS_STORAGE_KEY);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return false;
    const current = this._captureSnapshot(items[index].name || this._snapshotLabel(items[index]));
    current.id = items[index].id;
    current.visible_everyone = Boolean(items[index].visible_everyone);
    delete current.source_bookmark_id;
    delete current.source_external_bookmark;
    items[index] = current;
    if (!this._saveLibrary(BOOKMARKS_STORAGE_KEY, items)) return false;
    this._loadedBookmarkId = current.id;
    this._loadedExternalBookmark = false;
    this._loadedBookmarkBaselineFingerprint = this._snapshotFingerprint(current);
    this._loadedBookmarkDirty = false;
    this._recordChange();
    return true;
  }

  _clearLoadedBookmark(id = null) {
    if (id && this._loadedBookmarkId !== id) return;
    this._loadedBookmarkId = null;
    this._loadedExternalBookmark = false;
    this._loadedBookmarkBaselineFingerprint = null;
    this._loadedBookmarkDirty = false;
    if (!this._currentSnapshot) return;
    this._currentSnapshot.source_bookmark_id = null;
    this._currentSnapshot.source_external_bookmark = false;
    this._saveCurrentSnapshot(this._currentSnapshot);
  }

  _applySnapshot(snapshot, recordChange = true, loadingSavedRange = false) {
    if (!snapshot?.targets || !snapshot?.chart) return;
    if (
      recordChange &&
      this._targetCount() &&
      !this._snapshotTargetCount(snapshot)
    ) {
      this._archiveCurrentChart();
    }
    snapshot = this._clone(snapshot);
    snapshot.chart = this._normalizeSnapshotChart(snapshot.chart);
    this._excludeY2Comparison = Boolean(snapshot.chart.exclude_y2_comparison);
    this._activeSnapshot = this._clone(snapshot.chart);
    const rollingHours = [1, 2, 4, 8, 12, 24].includes(Number(snapshot.chart.rolling_hours))
      ? Number(snapshot.chart.rolling_hours)
      : null;
    const rollingResumeHours = !rollingHours
      && [1, 2, 4, 8, 12, 24].includes(Number(snapshot.chart.rolling_resume_hours))
      ? Number(snapshot.chart.rolling_resume_hours)
      : null;
    this._setPanelRollingHours?.(rollingHours);
    this._panelRollingResumeHours = rollingResumeHours;
    this._panelTimeRange = this._clone(snapshot.chart.time_range) || null;
    if (this._activeSnapshot?.compare === undefined) delete this._activeSnapshot.compare;
    // A saved rolling range must resume from the current time rather than
    // restoring the timestamp captured when the panel or bookmark was saved.
    // Keep its comparison state separately so a remounted Energy collection
    // receives it without restoring those stale timestamps.
    this._pendingRollingCompareRestore = rollingHours ? {
      compare: snapshot.period?.compare || "",
      choice: snapshot.period?.compare_choice || null,
      count: Math.max(
        1,
        Math.min(10, Math.trunc(Number(snapshot.period?.compare_count)) || 1),
      ),
    } : null;
    this._pendingPeriodRestore = rollingHours ? null : this._clone(snapshot.period);
    if (this._pendingPeriodRestore?.start) {
      this._beginPeriodRestore(this._pendingPeriodRestore, loadingSavedRange);
    } else {
      this._finishPeriodRestore();
    }
    this._energyUnsubscribe?.();
    this._energyUnsubscribe = null;
    // Do not let a rolling-range restore update the Energy collection that
    // belonged to the panel being replaced. _refreshPanelRollingRange() will
    // wait for _bindEnergyCollection() to attach the new panel collection.
    if (rollingHours) this._energyCollection = null;
    if (this._energyCollection && this._pendingPeriodRestore?.start) {
      // Update the selector synchronously, but leave the refresh to
      // _bindEnergyCollection(). Starting it here can publish the restored
      // data before the replacement graph cards have subscribed to Energy.
      this._applyStoredPeriod(
        this._energyCollection,
        this._pendingPeriodRestore,
        false,
        false
      );
    }
    this._targets = this._normalizeTargets(snapshot.targets);
    this._hiddenTargets = this._normalizeTargets(snapshot.hidden_targets || {});
    this._y2Targets = this._normalizeTargets(snapshot.y2_targets || {});
    this._hiddenY2Targets = this._normalizeTargets(snapshot.hidden_y2_targets || {});
    this._pruneHiddenTargets();
    if (!this._targetCount()) this._resetEnergySelection(this._energyCollection, true);
    this._saveTargets();
    this._notice = "";
    if (recordChange) this._recordChange(snapshot);
    else this._updateUndoRedoButtons();
    this._render();
    if (rollingHours) queueMicrotask(() => this._refreshPanelRollingRange?.());
  }

  _startFreshSnapshotSession(snapshot) {
    const current = this._clone(snapshot);
    current.chart = this._normalizeSnapshotChart(current.chart);
    current.source_bookmark_id = this._loadedBookmarkId || null;
    current.source_external_bookmark = Boolean(this._loadedExternalBookmark);
    this._applySnapshot(current, false, true);
    // Keep the saved snapshot itself as the baseline. Recapturing here can
    // read the previous Energy collection before the restored period has
    // finished mounting, replacing the bookmark's date, time and comparison
    // state with stale picker values.
    this._freshSnapshotSessionFingerprint = this._snapshotFingerprint(current);
    this._loadedBookmarkBaselineFingerprint = this._freshSnapshotSessionFingerprint;
    this._loadedBookmarkDirty = false;
    this._currentSnapshot = this._clone(current);
    this._saveCurrentSnapshot(current);
    this._clearUndoRedoHistory();
  }

  _sameSnapshotOption(left, right) {
    if (Object.is(left, right)) return true;
    if (left == null || right == null || typeof left !== "object" || typeof right !== "object") {
      return false;
    }
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (_) {
      return false;
    }
  }

  _snapshotOptionOverrides(options, defaults) {
    if (!options || typeof options !== "object" || Array.isArray(options)) return {};
    const result = {};
    const baseline = defaults && typeof defaults === "object" && !Array.isArray(defaults)
      ? defaults
      : {};
    for (const [key, value] of Object.entries(options)) {
      if (!this._sameSnapshotOption(value, baseline[key])) result[key] = this._clone(value);
    }
    return result;
  }

  _normalizeSnapshotChart(chart) {
    const source = this._clone(
      chart && typeof chart === "object" && !Array.isArray(chart) ? chart : {}
    );
    if (source.defaults_mode === "overrides") return source;

    // Legacy snapshots contain the fully merged configuration. Values that
    // still match the integration defaults can safely become inherited again;
    // unmatched values are retained as possible intentional overrides.
    source.card_options = this._snapshotOptionOverrides(
      source.card_options,
      this._configuredCardOptions("timeline"),
    );
    const entityOverrides = {};
    const entityDefaults = this.config.entity_options || {};
    for (const [key, value] of Object.entries(source.entity_options || {})) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (!this._sameSnapshotOption(value, entityDefaults[key])) {
          entityOverrides[key] = this._clone(value);
        }
        continue;
      }
      const overrides = this._snapshotOptionOverrides(value, entityDefaults[key]);
      if (Object.keys(overrides).length) entityOverrides[key] = overrides;
    }
    source.entity_options = entityOverrides;
    const configuredHours = Number(this.config.default_hours) || 24;
    const configuredHeight = Number(this.config.graph_height) || 300;
    if (Number(source.default_hours) === configuredHours) delete source.default_hours;
    if (Number(source.graph_height) === configuredHeight) delete source.graph_height;
    if (this._sameSnapshotOption(source.compare, this.config.compare)) delete source.compare;
    source.defaults_mode = "overrides";
    return source;
  }

  _configuredCardOptions(mode = "timeline") {
    const configured = this.config.card_options;
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) return {};
    if (configured.numeric || configured.state) {
      return mode === "state_timeline"
        ? (configured.state || {})
        : (configured.numeric || {});
    }
    return configured;
  }

  _effectiveCardOptionsConfig(mode = "timeline") {
    const defaults = this._configuredCardOptions(mode);
    const overrides = this._activeSnapshot?.card_options;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return defaults;
    return {
      ...(defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {}),
      ...overrides,
    };
  }

  _effectiveEntityOptionsConfig() {
    const defaults = this.config.entity_options;
    const overrides = this._activeSnapshot?.entity_options;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return defaults;
    const effective = this._clone(
      defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {}
    );
    for (const [entity, options] of Object.entries(overrides)) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        effective[entity] = options;
        continue;
      }
      const entityDefaults = effective[entity];
      effective[entity] = {
        ...(entityDefaults && typeof entityDefaults === "object" && !Array.isArray(entityDefaults)
          ? entityDefaults
          : {}),
        ...options,
      };
    }
    return effective;
  }

  _effectiveDefaultHours() {
    return Number(this._activeSnapshot?.default_hours ?? this.config.default_hours) || 24;
  }

  _effectiveGraphHeight() {
    const configuredHeight =
      Number(this._activeSnapshot?.graph_height ?? this.config.graph_height) || 300;
    const sourceHeight = Number(this._activeSnapshot?.source_graph_height) || 0;
    return Math.max(configuredHeight, sourceHeight);
  }

  _effectiveCompare() {
    if (this._activeSnapshot?.compare !== undefined) {
      return this._activeSnapshot.compare;
    }
    return this.config.compare !== undefined ? this.config.compare : this._energyCompare;
  }

  _snapshotCompareSetting() {
    if (this._activeSnapshot?.compare !== undefined) {
      return this._activeSnapshot.compare;
    }
    return this.config.compare;
  }

  _applyStoredPeriod(collection, period, clearPending = true, refresh = true) {
    if (!period?.start || !collection) return false;
    const start = new Date(period.start);
    const end = period.end ? new Date(period.end) : undefined;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
      if (clearPending) this._pendingPeriodRestore = null;
      this._finishPeriodRestore();
      return false;
    }
    const duration = end?.getTime() - start.getTime();
    if (end && duration > 0 && duration <= 25 * 60 * 60 * 1000) {
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const storedFullDay = start.getTime() === dayStart.getTime()
        && Math.abs(end.getTime() - dayEnd.getTime()) < 60_000;
      const storedWrappingWindow = Boolean(
        this._panelTimeRange
        && this._panelTimeRange.end <= this._panelTimeRange.start
      );
      if (!storedFullDay && !this._panelTimeRange) {
        this._panelTimeRange = {
          start: start.getHours() * 60 + start.getMinutes(),
          end: end.getHours() * 60 + end.getMinutes(),
        };
      }
      if (!storedWrappingWindow) {
        start.setTime(dayStart.getTime());
        end.setTime(dayEnd.getTime());
      }
    }
    const currentStart = collection.start instanceof Date
      ? collection.start.getTime()
      : new Date(collection.start).getTime();
    const currentEnd = collection.end == null
      ? undefined
      : collection.end instanceof Date
        ? collection.end.getTime()
        : new Date(collection.end).getTime();
    const periodChanged = currentStart !== start.getTime()
      || currentEnd !== end?.getTime();
    const compare = period.compare || "";
    this._energyCompareChoice = period.compare_choice || null;
    this._energyCompareCount = Math.max(
      1,
      Math.min(10, Math.trunc(Number(period.compare_count)) || 1),
    );
    const compareChanged = collection.compare !== compare;
    if (periodChanged) collection.setPeriod(start, end);
    if (typeof collection.setCompare === "function") {
      if (compareChanged) collection.setCompare(compare);
    }
    if (clearPending) this._pendingPeriodRestore = null;
    if (refresh && (periodChanged || compareChanged)) collection.refresh?.();
    return true;
  }

  _restorePendingPeriod(collection, refresh = true) {
    return this._applyStoredPeriod(
      collection,
      this._pendingPeriodRestore,
      true,
      refresh
    );
  }

  _beginPeriodRestore(period, loadingSavedRange = false) {
    const expected = this._clone(period);
    const start = expected?.start ? new Date(expected.start) : null;
    const end = expected?.end ? new Date(expected.end) : null;
    if (
      start && end
      && !Number.isNaN(start.getTime())
      && !Number.isNaN(end.getTime())
      && end.getTime() > start.getTime()
      && end.getTime() - start.getTime() <= 25 * 60 * 60 * 1000
    ) {
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const storedFullDay = start.getTime() === dayStart.getTime()
        && Math.abs(end.getTime() - dayEnd.getTime()) < 60_000;
      if (!storedFullDay) {
        const storedWrappingWindow = Boolean(
          this._panelTimeRange
          && this._panelTimeRange.end <= this._panelTimeRange.start
        );
        if (!this._panelTimeRange) {
          this._panelTimeRange = {
            start: start.getHours() * 60 + start.getMinutes(),
            end: end.getHours() * 60 + end.getMinutes(),
          };
        }
        if (!storedWrappingWindow) {
          expected.start = dayStart.toISOString();
          expected.end = dayEnd.toISOString();
        }
      }
    }
    this._periodRestoreExpected = expected;
    this._periodRestoreLoading = true;
    this._energyInteractionLoading = false;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    if (banner) banner.hidden = false;
    const loadingText = this.shadowRoot?.getElementById("period-loading-text");
    if (loadingText) {
      loadingText.textContent = loadingSavedRange
        ? this._customLocalize("loading_saved_range")
        : this._customLocalize("loading_requested_range");
    }
    const compareBanner = this.shadowRoot?.getElementById("compare-banner");
    if (compareBanner) compareBanner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    if (charts) {
      charts.hidden = true;
      charts.replaceChildren();
    }
    this._cards = this._cards.filter((card) => !this._graphCards.includes(card));
    this._graphCards = [];
    if (this._periodRestoreTimer) window.clearTimeout(this._periodRestoreTimer);
    this._periodRestoreTimer = window.setTimeout(
      () => {
        this._finishPeriodRestore();
        this._renderGraphs();
      },
      300000
    );
  }

  _finishPeriodRestore() {
    this._periodRestoreLoading = false;
    this._periodRestoreExpected = null;
    if (this._periodRestoreTimer) window.clearTimeout(this._periodRestoreTimer);
    this._periodRestoreTimer = null;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    if (banner) banner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    if (charts) charts.hidden = false;
  }

  _restoredPeriodMatches(expected, actualStart, actualEnd) {
    const expectedStart = new Date(expected?.start).getTime();
    const expectedEnd = expected?.end == null
      ? undefined
      : new Date(expected.end).getTime();
    const start = actualStart instanceof Date
      ? actualStart.getTime()
      : new Date(actualStart).getTime();
    const end = actualEnd == null
      ? undefined
      : actualEnd instanceof Date
        ? actualEnd.getTime()
        : new Date(actualEnd).getTime();
    if (!Number.isFinite(expectedStart) || !Number.isFinite(start)) return false;
    if (start !== expectedStart) return false;
    if (end === expectedEnd) return true;

    // HA Energy data can describe a full local day using either the final
    // millisecond of that day or midnight at the start of the next day. Both
    // boundaries refer to the same selected day and must complete a restore.
    const dayStart = new Date(expectedStart);
    dayStart.setHours(0, 0, 0, 0);
    if (expectedStart !== dayStart.getTime()) return false;
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayTime = nextDay.getTime();
    const isFullDayEnd = (value) => Number.isFinite(value)
      && value >= nextDayTime - 60_000
      && value <= nextDayTime;
    return isFullDayEnd(expectedEnd) && isFullDayEnd(end);
  }

  _completePeriodRestoreFromData(data, collection) {
    const expected = this._periodRestoreExpected;
    if (!this._periodRestoreLoading || !expected?.start) return false;
    // setPeriod() updates the collection properties synchronously, while the
    // native picker updates only from the refreshed EnergyData payload. Use
    // that payload as the confirmation so stale cached data cannot complete
    // the restore early.
    // EnergyData carries the range used for the completed request. Never
    // substitute the collection properties here: setPeriod() changes those
    // synchronously before the refreshed data has arrived.
    const actualStart = data?.start;
    const actualEnd = data?.end;
    const expectedCompare = expected.compare || "";
    const actualCompare = data?.compareMode ?? collection?.compare ?? "";
    if (
      !this._restoredPeriodMatches(expected, actualStart, actualEnd)
      || actualCompare !== expectedCompare
    ) return false;
    this._finishPeriodRestore();
    return true;
  }

  _formatSnapshotTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(this._hass.locale?.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  _snapshotSummary(snapshot) {
    const count = this._snapshotTargetCount(snapshot);
    const hours = Number(snapshot.chart?.default_hours ?? this.config.default_hours) || 24;
    const height = Number(snapshot.chart?.graph_height ?? this.config.graph_height) || 300;
    const periodStart = snapshot.period?.start ? new Date(snapshot.period.start) : null;
    const periodEnd = snapshot.period?.end ? new Date(snapshot.period.end) : null;
    const dateFormatter = new Intl.DateTimeFormat(this._hass.locale?.language, { dateStyle: "medium" });
    const period = periodStart && !Number.isNaN(periodStart.getTime())
      ? `${dateFormatter.format(periodStart)}${periodEnd && !Number.isNaN(periodEnd.getTime()) ? ` – ${dateFormatter.format(periodEnd)}` : ""}`
      : new Intl.NumberFormat(this._hass.locale?.language, {
        style: "unit",
        unit: "hour",
        unitDisplay: "long",
      }).format(hours);
    const targetCount = this._localize(
      "ui.panel.config.automation.editor.target_summary.targets",
      `${count} ${count === 1 ? "target" : "targets"}`,
      { count }
    );
    return `${targetCount} · ${period} · ${height}px · ${this._formatSnapshotTime(snapshot.saved_at)}`;
  }

  _libraryRows(items, isBookmarks = false, options = {}) {
    if (!items.length) return `<div class="library-empty">${this._escape(this._localize("ui.components.media-browser.no_items", "No items"))}</div>`;
    const { readOnly = false, ownerUserId = null, showOwner = false } = options;
    const deleteLabel = this._localize("ui.common.delete", "Delete");
    const updateLabel = this._customLocalize("update_bookmark");
    const visibleLabel = this._customLocalize("visible_to_everyone");
    const canPublish = isBookmarks && Boolean(this._hass?.user?.is_admin);
    return items.map((item) => `
      <div class="library-row">
        <button class="library-main" data-open-snapshot="${this._escape(item.id)}" data-owner-user-id="${this._escape(item._owner_user_id || ownerUserId || "")}">
          <span class="library-name">${this._escape(item.name || this._snapshotLabel(item))}</span>
          <span class="library-summary">${showOwner && item._owner_name ? `${this._escape(item._owner_name)} · ` : ""}${this._escape(this._snapshotSummary(item))}</span>
        </button>
        ${!readOnly && isBookmarks && this._bookmarkHasChanges(item) ? `<button class="update" data-update-snapshot="${this._escape(item.id)}" title="${this._escape(updateLabel)}"><ha-icon icon="mdi:update"></ha-icon></button>` : ""}
        ${canPublish ? `<button class="visibility ${item.visible_everyone ? "active" : ""}" data-toggle-visible="${this._escape(item.id)}" data-owner-user-id="${this._escape(item._owner_user_id || ownerUserId || this._hass.user.id)}" aria-pressed="${item.visible_everyone ? "true" : "false"}" title="${this._escape(visibleLabel)}"><ha-icon icon="${item.visible_everyone ? "mdi:account-multiple" : "mdi:account-multiple-outline"}"></ha-icon></button>` : ""}
        ${readOnly ? "" : `<button class="delete" data-delete-snapshot="${this._escape(item.id)}" title="${this._escape(deleteLabel)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`}
      </div>`).join("");
  }

  _bookmarkLibraryState() {
    const currentUserId = this._hass?.user?.id;
    if (this._bookmarkLibraryView === "shared") {
      return {
        items: this._bookmarkCatalog.shared,
        readOnly: true,
        ownerUserId: null,
        showOwner: true,
      };
    }
    const selectedUserId = this._bookmarkLibraryView === "mine"
      ? currentUserId
      : this._bookmarkLibraryView;
    return {
      items: selectedUserId === currentUserId
        ? this._loadLibrary(BOOKMARKS_STORAGE_KEY)
        : (this._bookmarkRemoteLibraries.get(selectedUserId) || []),
      readOnly: selectedUserId !== currentUserId,
      ownerUserId: selectedUserId,
      showOwner: false,
    };
  }

  _bookmarkTabs() {
    const mine = this._customLocalize("my_bookmarks");
    const shared = this._customLocalize("shared_bookmarks");
    const currentUserId = this._hass?.user?.id;
    const tabs = [
      { id: "mine", label: mine },
      { id: "shared", label: shared },
    ];
    if (this._hass?.user?.is_admin) {
      for (const user of this._bookmarkCatalog.users) {
        if (!user?.id || user.id === currentUserId) continue;
        tabs.push({ id: user.id, label: user.name || user.id });
      }
    }
    return `<div class="bookmark-user-tabs" role="tablist">${tabs.map((tab) => `
      <button role="tab" data-bookmark-view="${this._escape(tab.id)}" aria-selected="${this._bookmarkLibraryView === tab.id ? "true" : "false"}">${this._escape(tab.label)}</button>
    `).join("")}</div>`;
  }

  async _openLibrary(kind = "bookmarks") {
    if (this.shadowRoot.querySelector(".backdrop") || this._libraryOpening) return;
    this._libraryOpening = true;
    try {
      if (kind === "bookmarks") {
        await this._refreshSyncedBookmarks();
        if (this._bookmarkLibraryView !== "mine" && this._bookmarkLibraryView !== "shared") {
          await this._loadRemoteBookmarkLibrary(this._bookmarkLibraryView);
        }
      }
      this._renderLibrary(kind);
    } finally {
      this._libraryOpening = false;
    }
  }

  _renderLibrary(kind) {
    this.shadowRoot.querySelector(".backdrop")?.remove();
    const isBookmarks = kind === "bookmarks";
    const key = isBookmarks ? BOOKMARKS_STORAGE_KEY : HISTORY_STORAGE_KEY;
    const bookmarkState = isBookmarks ? this._bookmarkLibraryState() : null;
    const items = isBookmarks ? bookmarkState.items : this._loadLibrary(key);
    const title = this._customLocalize(isBookmarks ? "bookmarks" : "chart_history");
    const clearLabel = this._customLocalize(isBookmarks ? "clear_bookmarks" : "clear_history");
    const copyShareLink = this._customLocalize("copy_share_link");
    const close = this._localize("ui.common.close", "Close");
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="dialog-title"><button class="dialog-close" data-action="close-dialog" title="${this._escape(close)}" aria-label="${this._escape(close)}"><ha-icon icon="mdi:close"></ha-icon></button><h2>${title}</h2><span class="count">${items.length}${isBookmarks ? "" : ` / ${HISTORY_LIMIT}`}</span></header>
      ${isBookmarks ? this._bookmarkTabs() : ""}
      ${isBookmarks && !bookmarkState.readOnly ? `<div class="library-save"><input id="bookmark-name" maxlength="80" placeholder="${this._escape(this._customLocalize("bookmark_name"))}" value="${this._escape(this._snapshotLabel())}"><button data-action="save-current">${this._escape(this._customLocalize("save_current"))}</button></div>` : ""}
      <div class="library-list">${this._libraryRows(items, isBookmarks, bookmarkState || {})}</div>
      <footer class="dialog-actions">${!isBookmarks || !bookmarkState.readOnly ? `<button data-action="clear" style="margin-right:auto" ${items.length ? "" : "disabled"}>${this._escape(clearLabel)}</button>` : `<span style="margin-right:auto"></span>`}${isBookmarks ? `<button data-action="share" ${this._targetCount() ? "" : "disabled"}>${this._escape(copyShareLink)}</button>` : ""}<button data-action="close">${this._escape(close)}</button></footer>
    </section>`;
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-action="close"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="close-dialog"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="save-current"]')?.addEventListener("click", () => {
      const input = backdrop.querySelector("#bookmark-name");
      if (this._saveCurrentBookmark(input.value)) backdrop.remove();
    });
    backdrop.querySelector('[data-action="share"]')?.addEventListener("click", (event) => this._copyShareLink(event.currentTarget));
    backdrop.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
      const message = this._customLocalize(isBookmarks ? "confirm_clear_bookmarks" : "confirm_clear_history");
      if (!items.length || !window.confirm(message)) return;
      if (isBookmarks) this._clearLoadedBookmark();
      this._saveLibrary(key, []);
      this._renderLibrary(kind);
    });
    backdrop.querySelectorAll("[data-bookmark-view]").forEach((button) => button.addEventListener("click", async () => {
      const view = button.dataset.bookmarkView;
      if (!view || view === this._bookmarkLibraryView) return;
      this._bookmarkLibraryView = view;
      if (view !== "mine" && view !== "shared" && !this._bookmarkRemoteLibraries.has(view)) {
        try {
          await this._loadRemoteBookmarkLibrary(view);
        } catch (error) {
          console.warn("Advanced History: unable to load user bookmarks", error);
          this._notice = this._customLocalize("bookmark_sync_error");
        }
      }
      this._renderLibrary(kind);
    }));
    backdrop.querySelectorAll("[data-open-snapshot]").forEach((button) => button.addEventListener("click", async () => {
      const snapshot = items.find((item) => item.id === button.dataset.openSnapshot);
      if (!snapshot) return;
      const changedLoadedBookmark = Boolean(
        (this._loadedBookmarkId || this._loadedExternalBookmark)
        && this._loadedBookmarkDirty
        && (this._loadedExternalBookmark || snapshot.id !== this._loadedBookmarkId)
      );
      const unsavedNewChart = Boolean(
        !this._loadedBookmarkId
        && !this._loadedExternalBookmark
        && this._targetCount()
      );
      if (isBookmarks && (changedLoadedBookmark || unsavedNewChart)) {
        const action = await this._showUnsavedChangesDialog({
          title: this._customLocalize(
            changedLoadedBookmark && this._loadedBookmarkId
              ? "unsaved_bookmark_title"
              : "unsaved_chart_title"
          ),
          message: this._customLocalize(
            changedLoadedBookmark && this._loadedBookmarkId
              ? "switch_bookmark_message"
              : "load_bookmark_new_chart_message"
          ),
          saveLabel: changedLoadedBookmark && this._loadedBookmarkId
            ? this._localize("ui.common.save", "Save")
            : this._customLocalize("create_bookmark"),
          discardLabel: this._localize("ui.common.dont_save", "Don't save"),
        });
        if (action === "save") {
          const saved = changedLoadedBookmark && this._loadedBookmarkId
            ? this._updateBookmark(this._loadedBookmarkId)
            : this._saveCurrentBookmark(this._snapshotLabel());
          if (!saved) return;
        } else if (action !== "discard") {
          return;
        }
      }
      const ownBookmark = isBookmarks && !bookmarkState.readOnly;
      this._loadedBookmarkId = ownBookmark ? snapshot.id : null;
      this._loadedExternalBookmark = isBookmarks && !ownBookmark;
      if (isBookmarks) this._startFreshSnapshotSession(snapshot);
      else this._applySnapshot(snapshot);
    }));
    backdrop.querySelectorAll("[data-toggle-visible]").forEach((button) => button.addEventListener("click", async () => {
      try {
        await this._hass.callWS({
          type: "advanced_history/bookmarks/set_visible_everyone",
          user_id: button.dataset.ownerUserId,
          bookmark_id: button.dataset.toggleVisible,
          visible: button.getAttribute("aria-pressed") !== "true",
        });
        await this._refreshSyncedBookmarks();
        if (this._bookmarkLibraryView !== "mine" && this._bookmarkLibraryView !== "shared") {
          await this._loadRemoteBookmarkLibrary(this._bookmarkLibraryView);
        }
        this._renderLibrary(kind);
      } catch (error) {
        console.warn("Advanced History: unable to change bookmark visibility", error);
        this._notice = this._customLocalize("bookmark_visibility_error");
      }
    }));
    backdrop.querySelectorAll("[data-update-snapshot]").forEach((button) => button.addEventListener("click", () => {
      if (this._updateBookmark(button.dataset.updateSnapshot)) this._renderLibrary(kind);
    }));
    backdrop.querySelectorAll("[data-delete-snapshot]").forEach((button) => button.addEventListener("click", async () => {
      if (isBookmarks) {
        const bookmark = items.find((item) => item.id === button.dataset.deleteSnapshot);
        if (!bookmark) return;
        if (!await this._showDeleteBookmarkDialog(bookmark)) return;
      }
      if (isBookmarks) this._clearLoadedBookmark(button.dataset.deleteSnapshot);
      this._saveLibrary(key, items.filter((item) => item.id !== button.dataset.deleteSnapshot));
      this._renderLibrary(kind);
    }));
    this.shadowRoot.append(backdrop);
    backdrop.querySelector("#bookmark-name")?.select();
  }

}
