import {
  CARD_HANDOFF_QUERY_PARAM,
  PANEL_TABS_STORAGE_KEY,
  REDO_STORAGE_KEY,
  SHARE_QUERY_PARAM,
  UNDO_STORAGE_KEY,
} from "./constants.js";

export class PanelTabsMethods {
  _panelTabId() {
    return globalThis.crypto?.randomUUID?.()
      || `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  _desktopPanelTabsEnabled() {
    if (this._narrow) return false;
    return typeof globalThis.matchMedia !== "function"
      || globalThis.matchMedia("(min-width: 769px)").matches;
  }

  _panelTabLabel(index) {
    return this._customLocalize("panel_number", { number: index + 1 });
  }

  _capturePanelTabState() {
    const snapshot = this._captureSnapshot();
    return {
      snapshot,
      current_snapshot: this._clone(snapshot),
      undo: this._clone(this._loadLibrary(UNDO_STORAGE_KEY)),
      redo: this._clone(this._loadLibrary(REDO_STORAGE_KEY)),
      loaded_bookmark_id: this._loadedBookmarkId || null,
      loaded_bookmark_baseline: this._loadedBookmarkBaselineFingerprint || null,
      loaded_bookmark_dirty: Boolean(this._loadedBookmarkDirty),
      fresh_snapshot_fingerprint: this._freshSnapshotSessionFingerprint || null,
      notice: this._notice || "",
      large_range_fine_detail: Boolean(this._largeRangeFineDetail),
      large_range_detail_dismissed_key: this._largeRangeDetailDismissedKey || null,
    };
  }

  _saveActivePanelTab() {
    const tab = this._panelTabs.find((item) => item.id === this._activePanelTabId);
    if (tab) tab.state = this._capturePanelTabState();
    return tab;
  }

  _persistPanelTabs() {
    if (!this._desktopPanelTabsEnabled() || !this._panelTabs?.length) return;
    this._saveActivePanelTab();
    try {
      localStorage.setItem(PANEL_TABS_STORAGE_KEY, JSON.stringify({
        schema: 1,
        active_id: this._activePanelTabId,
        tabs: this._panelTabs,
      }));
    } catch (error) {
      console.error("Advanced History: unable to save panel tabs", error);
    }
  }

  _restorePersistedPanelTabs() {
    if (!this._desktopPanelTabsEnabled()) return false;
    const params = new URLSearchParams(location.search);
    if (
      params.has(SHARE_QUERY_PARAM)
      || params.has(CARD_HANDOFF_QUERY_PARAM)
      || this._incomingTargetOverride
    ) return false;
    try {
      const stored = JSON.parse(localStorage.getItem(PANEL_TABS_STORAGE_KEY) || "null");
      if (stored?.schema !== 1 || !Array.isArray(stored.tabs)) return false;
      const tabs = stored.tabs.filter((tab) => (
        typeof tab?.id === "string"
        && tab.state?.snapshot?.targets
        && tab.state?.snapshot?.chart
      ));
      if (!tabs.length) return false;
      this._panelTabs = this._clone(tabs);
      this._activePanelTabId = this._panelTabs.some((tab) => tab.id === stored.active_id)
        ? stored.active_id
        : this._panelTabs[0].id;
      const active = this._panelTabs.find((tab) => tab.id === this._activePanelTabId);
      this._restorePanelTab(active);
      return true;
    } catch (error) {
      console.warn("Advanced History: unable to restore panel tabs", error);
      return false;
    }
  }

  _blankPanelTabState() {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const chart = {
      card_options: this._clone(this.config.card_options || {}),
      entity_options: this._clone(this.config.entity_options || {}),
      default_hours: Number(this.config.default_hours) || 24,
      graph_height: Number(this.config.graph_height) || 300,
    };
    if (this.config.compare !== undefined) chart.compare = this._clone(this.config.compare);
    const snapshot = {
      schema: 1,
      id: this._newSnapshotId(),
      name: "",
      saved_at: new Date().toISOString(),
      targets: { area_id: [], device_id: [], entity_id: [] },
      hidden_targets: { area_id: [], device_id: [], entity_id: [] },
      chart,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        compare: "",
        compare_choice: null,
        compare_count: 1,
      },
      source_bookmark_id: null,
    };
    return {
      snapshot,
      current_snapshot: this._clone(snapshot),
      undo: [],
      redo: [],
      loaded_bookmark_id: null,
      loaded_bookmark_baseline: null,
      loaded_bookmark_dirty: false,
      fresh_snapshot_fingerprint: null,
      notice: "",
      large_range_fine_detail: false,
      large_range_detail_dismissed_key: null,
    };
  }

  _restorePanelTab(tab) {
    const state = tab?.state || this._blankPanelTabState();
    tab.state = state;
    this._loadedBookmarkId = state.loaded_bookmark_id || null;
    this._loadedBookmarkBaselineFingerprint = state.loaded_bookmark_baseline || null;
    this._loadedBookmarkDirty = Boolean(state.loaded_bookmark_dirty);
    this._freshSnapshotSessionFingerprint = state.fresh_snapshot_fingerprint || null;
    this._notice = state.notice || "";
    this._largeRangeFineDetail = Boolean(state.large_range_fine_detail);
    this._largeRangeDetailDismissedKey = state.large_range_detail_dismissed_key || null;
    this._largeRangeDetailStateKey = null;
    this._energyCompare = null;
    this._energyCompareChoice = state.snapshot?.period?.compare_choice || null;
    this._energyCompareCount = Math.max(
      1,
      Math.min(10, Math.trunc(Number(state.snapshot?.period?.compare_count)) || 1),
    );
    this._energyComparePeriodKind = null;
    this._energyResetPending = false;
    this._saveLibrary(UNDO_STORAGE_KEY, this._clone(state.undo || []));
    this._saveLibrary(REDO_STORAGE_KEY, this._clone(state.redo || []));
    this._currentSnapshot = this._clone(state.current_snapshot || state.snapshot);
    this._saveCurrentSnapshot(this._currentSnapshot);
    this._applySnapshot(this._clone(state.snapshot), false, true);
  }

  _addPanelTab() {
    if (!this._desktopPanelTabsEnabled()) return;
    this._saveActivePanelTab();
    const tab = { id: this._panelTabId(), state: this._blankPanelTabState() };
    this._panelTabs.push(tab);
    this._activePanelTabId = tab.id;
    this._restorePanelTab(tab);
    this._persistPanelTabs();
  }

  _switchPanelTab(id) {
    if (!this._desktopPanelTabsEnabled() || id === this._activePanelTabId) return;
    const tab = this._panelTabs.find((item) => item.id === id);
    if (!tab) return;
    this._saveActivePanelTab();
    this._activePanelTabId = tab.id;
    this._restorePanelTab(tab);
    this._persistPanelTabs();
  }

  async _closePanelTab(id) {
    if (!this._desktopPanelTabsEnabled() || this._panelTabs.length < 2) return;
    const index = this._panelTabs.findIndex((item) => item.id === id);
    if (index < 0) return;

    const previousActiveId = this._activePanelTabId;
    if (id !== previousActiveId) this._switchPanelTab(id);
    const cleared = await this._requestClearCurrentChart();
    if (!cleared) {
      if (previousActiveId !== id) this._switchPanelTab(previousActiveId);
      return;
    }

    this._panelTabs.splice(index, 1);
    const next = this._panelTabs.find((item) => item.id === previousActiveId)
      || this._panelTabs[Math.min(index, this._panelTabs.length - 1)];
    this._activePanelTabId = next.id;
    this._restorePanelTab(next);
    this._persistPanelTabs();
  }

  _renderPanelTabs() {
    if (!this._desktopPanelTabsEnabled() || this._panelTabs.length < 2) return "";
    const close = this._localize("ui.common.close", "Close");
    return `<nav class="panel-tabs" aria-label="${this._escape(this._customLocalize("panels"))}">
      ${this._panelTabs.map((tab, index) => `<span class="panel-tab${tab.id === this._activePanelTabId ? " active" : ""}">
        <button class="panel-tab-select" data-panel-tab="${this._escape(tab.id)}" ${tab.id === this._activePanelTabId ? 'aria-current="page"' : ""}>${this._escape(this._panelTabLabel(index))}</button>
        <button class="panel-tab-close" data-close-panel="${this._escape(tab.id)}" title="${this._escape(close)}" aria-label="${this._escape(close)}"><ha-icon icon="mdi:close"></ha-icon></button>
      </span>`).join("")}
    </nav>`;
  }

  _bindPanelTabs() {
    this.shadowRoot.getElementById("add-panel")?.addEventListener("click", () => this._addPanelTab());
    for (const button of this.shadowRoot.querySelectorAll("[data-panel-tab]")) {
      button.addEventListener("click", () => this._switchPanelTab(button.dataset.panelTab));
    }
    for (const button of this.shadowRoot.querySelectorAll("[data-close-panel]")) {
      button.addEventListener("click", () => this._closePanelTab(button.dataset.closePanel));
    }
  }
}
