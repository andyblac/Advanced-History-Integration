import {
  BOOKMARKS_STORAGE_KEY,
  CURRENT_SNAPSHOT_STORAGE_KEY,
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  REDO_STORAGE_KEY,
  STORAGE_KEY,
  UNDO_LIMIT,
  UNDO_STORAGE_KEY,
} from "./constants.js";

export class StorageMethods {
  _loadTargets() {
    const params = new URLSearchParams(location.search);
    const fromUrl = { area_id: params.getAll("area_id"), device_id: params.getAll("device_id"), entity_id: params.getAll("entity_id") };
    const previous = this._loadCurrentSnapshot();
    const hasUrlTargets = Object.values(fromUrl).some((items) => items.length);
    if (hasUrlTargets) {
      if (
        previous?.targets &&
        this._targetCount(this._normalizeTargets(previous.targets)) &&
        this._snapshotFingerprint(previous) !== this._snapshotFingerprint({
          ...previous,
          targets: fromUrl,
        })
      ) {
        this._archiveSnapshot(previous);
        this._pushUndoSnapshot(previous);
        this._saveLibrary(REDO_STORAGE_KEY, []);
        this._incomingTargetOverride = true;
      }
      this._targets = fromUrl;
    }
    else {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (stored) this._targets = this._normalizeTargets(stored);
      } catch (_) { /* Ignore corrupt local storage. */ }
    }
    if (
      !hasUrlTargets &&
      previous?.targets &&
      JSON.stringify(this._normalizeTargets(previous.targets)) === JSON.stringify(this._targets)
    ) {
      this._currentSnapshot = this._clone(previous);
      this._activeSnapshot = this._clone(previous.chart);
      this._pendingPeriodRestore = this._clone(previous.period);
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
    ["area_id", "device_id", "entity_id"].forEach((key) => {
      url.searchParams.delete(key);
      this._targets[key].forEach((value) => url.searchParams.append(key, value));
    });
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  _clone(value) {
    if (value == null) return value;
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  _loadLibrary(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  _saveLibrary(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error("Advanced History: unable to save chart library", error);
      this._notice = this._customLocalize("save_library_error");
      return false;
    }
  }

  _newSnapshotId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  _captureSnapshot(name = "") {
    const collection = this._energyCollection;
    const period = collection?.start ? {
      start: collection.start.toISOString(),
      end: collection.end?.toISOString?.() || null,
      compare: collection.compare ?? "",
    } : this._clone(this._pendingPeriodRestore);
    return {
      schema: 1,
      id: this._newSnapshotId(),
      name,
      saved_at: new Date().toISOString(),
      targets: this._clone(this._targets),
      chart: {
        card_options: this._clone(this._effectiveCardOptionsConfig()),
        entity_options: this._clone(this._effectiveEntityOptionsConfig()),
        default_hours: this._effectiveDefaultHours(),
        graph_height: this._effectiveGraphHeight(),
        compare: this._clone(this._snapshotCompareSetting()),
      },
      period,
    };
  }

  _snapshotFingerprint(snapshot) {
    return JSON.stringify({
      targets: snapshot.targets,
      chart: snapshot.chart,
      period: snapshot.period,
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
    const targets = this._normalizeTargets(snapshot?.targets || this._targets);
    const names = [
      ...targets.area_id.map((id) => this._areaName(id)),
      ...targets.device_id.map((id) => this._deviceName(id)),
      ...targets.entity_id.map((id) => this._entityName(id)),
    ];
    if (!names.length) return this._customLocalize("empty_chart");
    return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  }

  _recordChange(snapshot = null) {
    const source = snapshot ? this._clone(snapshot) : this._captureSnapshot();
    source.id = this._newSnapshotId();
    source.name = this._snapshotLabel(source);
    source.saved_at = new Date().toISOString();
    const previous = this._currentSnapshot || this._loadCurrentSnapshot();
    const changed = previous && this._snapshotFingerprint(previous) !== this._snapshotFingerprint(source);

    if (changed && !this._incomingTargetOverride) {
      this._pushUndoSnapshot(previous);
      this._saveLibrary(REDO_STORAGE_KEY, []);
    }

    this._incomingTargetOverride = false;
    this._currentSnapshot = this._clone(source);
    this._saveCurrentSnapshot(source);
    this._updateUndoRedoButtons();
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
    if (!this._targetCount(this._normalizeTargets(snapshot.targets))) return false;
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
    const items = this._loadLibrary(BOOKMARKS_STORAGE_KEY);
    if (this._saveLibrary(BOOKMARKS_STORAGE_KEY, [snapshot, ...items])) {
      return true;
    }
    return false;
  }

  _applySnapshot(snapshot, recordChange = true) {
    if (!snapshot?.targets || !snapshot?.chart) return;
    if (
      recordChange &&
      this._targetCount(this._targets) &&
      !this._targetCount(this._normalizeTargets(snapshot.targets))
    ) {
      this._archiveCurrentChart();
    }
    this._activeSnapshot = this._clone(snapshot.chart);
    this._pendingPeriodRestore = this._clone(snapshot.period);
    this._targets = this._normalizeTargets(snapshot.targets);
    this._saveTargets();
    this._notice = "";
    if (recordChange) this._recordChange(snapshot);
    else this._updateUndoRedoButtons();
    this._render();
  }

  _effectiveCardOptionsConfig() {
    const defaults = this.config.card_options;
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
    return Number(this._activeSnapshot?.graph_height ?? this.config.graph_height) || 300;
  }

  _effectiveCompare() {
    if (this._activeSnapshot && Object.prototype.hasOwnProperty.call(this._activeSnapshot, "compare")) {
      return this._activeSnapshot.compare;
    }
    return this.config.compare !== undefined ? this.config.compare : this._energyCompare;
  }

  _snapshotCompareSetting() {
    if (this._activeSnapshot && Object.prototype.hasOwnProperty.call(this._activeSnapshot, "compare")) {
      return this._activeSnapshot.compare;
    }
    return this.config.compare;
  }

  _restorePendingPeriod(collection) {
    const pendingPeriod = this._pendingPeriodRestore;
    if (!pendingPeriod?.start || !collection) return false;
    const start = new Date(pendingPeriod.start);
    const end = pendingPeriod.end ? new Date(pendingPeriod.end) : undefined;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
      this._pendingPeriodRestore = null;
      return false;
    }
    collection.setPeriod(start, end);
    if (typeof collection.setCompare === "function") {
      collection.setCompare(pendingPeriod.compare || "");
    }
    this._pendingPeriodRestore = null;
    collection.refresh?.();
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
    const targets = this._normalizeTargets(snapshot.targets || {});
    const count = this._targetCount(targets);
    const hours = Number(snapshot.chart?.default_hours) || 24;
    const height = Number(snapshot.chart?.graph_height) || 300;
    const periodStart = snapshot.period?.start ? new Date(snapshot.period.start) : null;
    const periodEnd = snapshot.period?.end ? new Date(snapshot.period.end) : null;
    const dateFormatter = new Intl.DateTimeFormat(this._hass.locale?.language, { dateStyle: "medium" });
    const period = periodStart && !Number.isNaN(periodStart.getTime())
      ? `${dateFormatter.format(periodStart)}${periodEnd && !Number.isNaN(periodEnd.getTime()) ? ` – ${dateFormatter.format(periodEnd)}` : ""}`
      : this._customLocalize(hours === 1 ? "hour_one" : "hour_many", { count: hours });
    const targetCount = this._customLocalize(count === 1 ? "target_one" : "target_many", { count });
    return `${targetCount} · ${period} · ${height}px · ${this._formatSnapshotTime(snapshot.saved_at)}`;
  }

  _libraryRows(items) {
    if (!items.length) return `<div class="library-empty">${this._escape(this._customLocalize("nothing_saved"))}</div>`;
    const deleteLabel = this._localize("ui.common.delete", "Delete");
    return items.map((item) => `
      <div class="library-row">
        <button class="library-main" data-open-snapshot="${this._escape(item.id)}">
          <span class="library-name">${this._escape(item.name || this._snapshotLabel(item))}</span>
          <span class="library-summary">${this._escape(this._snapshotSummary(item))}</span>
        </button>
        <button class="delete" data-delete-snapshot="${this._escape(item.id)}" title="${this._escape(deleteLabel)}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
      </div>`).join("");
  }

  _openLibrary(kind = "bookmarks") {
    if (this.shadowRoot.querySelector(".backdrop")) return;
    this._renderLibrary(kind);
  }

  _renderLibrary(kind) {
    this.shadowRoot.querySelector(".backdrop")?.remove();
    const isBookmarks = kind === "bookmarks";
    const key = isBookmarks ? BOOKMARKS_STORAGE_KEY : HISTORY_STORAGE_KEY;
    const items = this._loadLibrary(key);
    const title = this._customLocalize(isBookmarks ? "bookmarks" : "chart_history");
    const clearLabel = this._customLocalize(isBookmarks ? "clear_bookmarks" : "clear_history");
    const close = this._localize("ui.common.close", "Close");
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="dialog-title"><h2>${title}</h2><span class="count">${items.length}${isBookmarks ? "" : ` / ${HISTORY_LIMIT}`}</span></header>
      ${isBookmarks ? `<div class="library-save"><input id="bookmark-name" maxlength="80" placeholder="${this._escape(this._customLocalize("bookmark_name"))}" value="${this._escape(this._snapshotLabel())}"><button data-action="save-current">${this._escape(this._customLocalize("save_current"))}</button></div>` : ""}
      <div class="library-list">${this._libraryRows(items)}</div>
      <footer class="dialog-actions"><button data-action="clear" style="margin-right:auto" ${items.length ? "" : "disabled"}>${this._escape(clearLabel)}</button><button data-action="close">${this._escape(close)}</button></footer>
    </section>`;
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-action="close"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="save-current"]')?.addEventListener("click", () => {
      const input = backdrop.querySelector("#bookmark-name");
      if (this._saveCurrentBookmark(input.value)) this._renderLibrary(kind);
    });
    backdrop.querySelector('[data-action="clear"]').addEventListener("click", () => {
      const message = this._customLocalize(isBookmarks ? "confirm_clear_bookmarks" : "confirm_clear_history");
      if (!items.length || !window.confirm(message)) return;
      this._saveLibrary(key, []);
      this._renderLibrary(kind);
    });
    backdrop.querySelectorAll("[data-open-snapshot]").forEach((button) => button.addEventListener("click", () => {
      const snapshot = items.find((item) => item.id === button.dataset.openSnapshot);
      if (snapshot) this._applySnapshot(snapshot);
    }));
    backdrop.querySelectorAll("[data-delete-snapshot]").forEach((button) => button.addEventListener("click", () => {
      this._saveLibrary(key, items.filter((item) => item.id !== button.dataset.deleteSnapshot));
      this._renderLibrary(kind);
    }));
    this.shadowRoot.append(backdrop);
    backdrop.querySelector("#bookmark-name")?.select();
  }

}
