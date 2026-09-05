import {
  CARD_HANDOFF_QUERY_PARAM,
  PANEL_TABS_SCHEMA,
  PANEL_TABS_STORAGE_KEY,
  REDO_STORAGE_KEY,
  SHARE_QUERY_PARAM,
  UNDO_STORAGE_KEY,
} from "./constants.js";

export class PanelTabsMethods {
  _desktopPanelLayoutAvailable() {
    if (this._narrow) return false;
    return typeof globalThis.matchMedia !== "function"
      || globalThis.matchMedia("(min-width: 769px)").matches;
  }

  _statisticsCardVersionParts() {
    const match = String(this._statisticsCardVersion?.() || "")
      .match(/^v?(\d+)\.(\d+)(?:\.(\d+))?/i);
    return match ? match.slice(1).map((part) => Number(part || 0)) : null;
  }

  _panelTabsDependencySupported() {
    const version = this._statisticsCardVersionParts();
    if (!version) return false;
    const [major, minor] = version;
    return major > 4 || (major === 4 && minor >= 2);
  }

  _panelTabId() {
    return globalThis.crypto?.randomUUID?.()
      || `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  _migratePersistedPanelTabs(stored) {
    // Older tab records may contain the retired per-panel Energy collection
    // key. The local period store now uses the stable tab id directly.
    if (!stored || ![1, PANEL_TABS_SCHEMA].includes(stored.schema)) return null;
    if (!Array.isArray(stored.tabs)) return null;
    const migrated = this._clone(stored);
    migrated.schema = PANEL_TABS_SCHEMA;
    migrated.tabs = migrated.tabs.map((tab) => {
      const next = { ...tab };
      delete next.energy_collection_key;
      return next;
    });
    return migrated;
  }

  _desktopPanelTabsEnabled() {
    return this._desktopPanelLayoutAvailable()
      && this._panelTabsDependencySupported();
  }

  _panelTabLabel(index) {
    return this._customLocalize("panel_number", { number: index + 1 });
  }

  _panelTabDisplayLabel(tab, index) {
    return String(tab?.name || "").trim() || this._panelTabLabel(index);
  }

  _capturePanelTabState() {
    const snapshot = this._captureSnapshot();
    return {
      snapshot,
      current_snapshot: this._clone(snapshot),
      undo: this._clone(this._loadLibrary(UNDO_STORAGE_KEY)),
      redo: this._clone(this._loadLibrary(REDO_STORAGE_KEY)),
      loaded_bookmark_id: this._loadedBookmarkId || null,
      loaded_external_bookmark: Boolean(this._loadedExternalBookmark),
      loaded_external_bookmark_owner_id: this._loadedExternalBookmarkOwnerId || null,
      loaded_external_bookmark_id: this._loadedExternalBookmarkId || null,
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
    // Storage must not depend on the current viewport or on version metadata
    // being available. Both are transient and previously allowed the initial
    // singleton tab to overwrite a saved multi-panel session.
    if (
      !this._panelTabsStorageInspected
      || this._panelTabsPersistenceSuppressed
      || !this._panelTabs?.length
    ) return;
    this._saveActivePanelTab();
    try {
      localStorage.setItem(PANEL_TABS_STORAGE_KEY, JSON.stringify({
        schema: PANEL_TABS_SCHEMA,
        active_id: this._activePanelTabId,
        tabs: this._panelTabs,
      }));
    } catch (error) {
      console.error("Advanced History: unable to save panel tabs", error);
    }
  }

  _restorePersistedPanelTabs() {
    const params = new URLSearchParams(location.search);
    if (
      params.has(SHARE_QUERY_PARAM)
      || (params.has(CARD_HANDOFF_QUERY_PARAM) && !this._pendingPanelTabHandoff)
      || this._incomingTargetOverride
    ) {
      // The incoming view intentionally replaces the active panel for this
      // session, but it must never replace the user's saved panel collection.
      this._panelTabsPersistenceSuppressed = true;
      return false;
    }
    try {
      const rawValue = localStorage.getItem(PANEL_TABS_STORAGE_KEY);
      if (!rawValue) {
        this._panelTabsStorageInspected = true;
        return false;
      }
      const rawStored = JSON.parse(rawValue);
      const stored = this._migratePersistedPanelTabs(rawStored);
      if (!stored) {
        this._panelTabsPersistenceSuppressed = true;
        return false;
      }
      const tabs = stored.tabs.filter((tab) => (
        typeof tab?.id === "string"
        && tab.state?.snapshot?.targets
        && tab.state?.snapshot?.chart
      )).slice(0, this.maxTabs);
      if (!tabs.length) {
        this._panelTabsPersistenceSuppressed = true;
        return false;
      }
      this._panelTabs = this._clone(tabs);
      this._activePanelTabId = this._panelTabs.some((tab) => tab.id === stored.active_id)
        ? stored.active_id
        : this._panelTabs[0].id;
      this._panelTabsStorageInspected = true;
      if (rawStored.schema !== PANEL_TABS_SCHEMA) {
        localStorage.setItem(PANEL_TABS_STORAGE_KEY, JSON.stringify({
          schema: PANEL_TABS_SCHEMA,
          active_id: this._activePanelTabId,
          tabs: this._panelTabs,
        }));
      }
      const active = this._panelTabs.find((tab) => tab.id === this._activePanelTabId);
      this._restorePanelTab(active);
      return true;
    } catch (error) {
      // Preserve malformed or temporarily inaccessible data for recovery
      // instead of replacing it with the constructor's blank panel.
      this._panelTabsPersistenceSuppressed = true;
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
      defaults_mode: "overrides",
      card_options: { numeric: {}, state: {} },
      entity_options: {},
    };
    const snapshot = {
      schema: 1,
      id: this._newSnapshotId(),
      name: "",
      saved_at: new Date().toISOString(),
      targets: { area_id: [], device_id: [], entity_id: [] },
      hidden_targets: { area_id: [], device_id: [], entity_id: [] },
      y2_targets: { area_id: [], device_id: [], entity_id: [] },
      hidden_y2_targets: { area_id: [], device_id: [], entity_id: [] },
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
      loaded_external_bookmark: false,
      loaded_external_bookmark_owner_id: null,
      loaded_external_bookmark_id: null,
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
    this._loadedExternalBookmark = Boolean(
      state.loaded_external_bookmark
      || state.snapshot?.source_external_bookmark
    );
    this._loadedExternalBookmarkOwnerId = state.loaded_external_bookmark_owner_id
      || state.snapshot?.source_external_bookmark_owner_id
      || null;
    this._loadedExternalBookmarkId = state.loaded_external_bookmark_id
      || state.snapshot?.source_external_bookmark_id
      || null;
    this._loadedBookmarkBaselineFingerprint = state.loaded_bookmark_baseline || null;
    this._loadedBookmarkDirty = Boolean(state.loaded_bookmark_dirty);
    this._freshSnapshotSessionFingerprint = state.fresh_snapshot_fingerprint || null;
    this._notice = state.notice || "";
    this._largeRangeFineDetail = Boolean(state.large_range_fine_detail);
    this._largeRangeDetailDismissedKey = state.large_range_detail_dismissed_key || null;
    this._largeRangeDetailStateKey = null;
    this._comparisonState = null;
    this._comparisonChoice = state.snapshot?.period?.compare_choice || null;
    this._comparisonCount = Math.max(
      1,
      Math.min(10, Math.trunc(Number(state.snapshot?.period?.compare_count)) || 1),
    );
    this._comparisonPeriodKind = null;
    this._periodResetPending = false;
    this._saveLibrary(UNDO_STORAGE_KEY, this._clone(state.undo || []));
    this._saveLibrary(REDO_STORAGE_KEY, this._clone(state.redo || []));
    this._currentSnapshot = this._clone(state.current_snapshot || state.snapshot);
    this._saveCurrentSnapshot(this._currentSnapshot);
    this._applySnapshot(this._clone(state.snapshot), false, true);
    this._scheduleExternalBookmarkRefresh?.();
  }

  _addPanelTab() {
    if (!this._desktopPanelTabsEnabled() || this._panelTabs.length >= this.maxTabs) return;
    this._saveActivePanelTab();
    const id = this._panelTabId();
    const tab = {
      id,
      state: this._blankPanelTabState(),
    };
    this._panelTabs.push(tab);
    this._activePanelTabId = tab.id;
    this._restorePanelTab(tab);
    this._persistPanelTabs();
  }

  _openPendingPanelTabHandoff() {
    const pending = this._pendingPanelTabHandoff;
    this._pendingPanelTabHandoff = null;
    if (!pending?.snapshot) return false;

    if (!this._panelTabsDependencySupported()) {
      this._applySnapshot(this._clone(pending.snapshot), false, true);
      return true;
    }
    if (this._panelTabs.length >= this.maxTabs) {
      this._saveTargets();
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: this._customLocalize("panel_limit_reached") },
        bubbles: true,
        composed: true,
      }));
      return false;
    }

    this._panelTabsStorageInspected = true;
    this._saveActivePanelTab();
    const id = this._panelTabId();
    const state = this._blankPanelTabState();
    state.snapshot = this._clone(pending.snapshot);
    state.current_snapshot = this._clone(pending.snapshot);
    const tab = {
      id,
      name: String(pending.name || "").trim().slice(0, 40),
      state,
    };
    this._panelTabs.push(tab);
    this._activePanelTabId = tab.id;
    this._restorePanelTab(tab);
    this._persistPanelTabs();
    return true;
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
    const previous = this._localize("ui.common.previous", "Previous");
    const next = this._localize("ui.common.next", "Next");
    const tabHelp = this._customLocalize("panel_tab_help");
    return `<div class="panel-tabs-shell">
      <button class="panel-tabs-scroll" data-scroll-panels="-1" title="${this._escape(previous)}" aria-label="${this._escape(previous)}" hidden><ha-icon icon="mdi:chevron-left"></ha-icon></button>
      <nav class="panel-tabs" aria-label="${this._escape(this._customLocalize("panels"))}">
        ${this._panelTabs.map((tab, index) => `<span class="panel-tab${tab.id === this._activePanelTabId ? " active" : ""}" draggable="true" data-panel-tab-item="${this._escape(tab.id)}">
          <button class="panel-tab-select" data-panel-tab="${this._escape(tab.id)}" title="${this._escape(tabHelp)}" ${tab.id === this._activePanelTabId ? 'aria-current="page"' : ""}>${this._escape(this._panelTabDisplayLabel(tab, index))}</button>
          <button class="panel-tab-close" data-close-panel="${this._escape(tab.id)}" title="${this._escape(close)}" aria-label="${this._escape(close)}"><ha-icon icon="mdi:close"></ha-icon></button>
        </span>`).join("")}
      </nav>
      <button class="panel-tabs-scroll" data-scroll-panels="1" title="${this._escape(next)}" aria-label="${this._escape(next)}" hidden><ha-icon icon="mdi:chevron-right"></ha-icon></button>
    </div>`;
  }

  _syncPanelTabScrollButtons() {
    const tabs = this.shadowRoot?.querySelector(".panel-tabs");
    if (!tabs) return;
    const buttons = this.shadowRoot.querySelectorAll("[data-scroll-panels]");
    const overflow = tabs.scrollWidth > tabs.clientWidth + 1;
    for (const button of buttons) button.hidden = !overflow;
    if (!overflow) return;
    const start = tabs.scrollLeft <= 1;
    const end = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
    this.shadowRoot.querySelector('[data-scroll-panels="-1"]').disabled = start;
    this.shadowRoot.querySelector('[data-scroll-panels="1"]').disabled = end;
  }

  _scrollPanelTabs(tabs, direction) {
    const tabItems = Array.from(tabs.querySelectorAll(".panel-tab"));
    if (!tabItems.length) return;
    const viewport = tabs.getBoundingClientRect();
    const bounds = tabItems.map((tab) => {
      const rect = tab.getBoundingClientRect();
      const left = tabs.scrollLeft + rect.left - viewport.left;
      return { left, right: left + rect.width };
    });
    let destination;
    if (direction > 0) {
      const visibleRight = tabs.scrollLeft + tabs.clientWidth;
      const target = bounds.find((item) => item.right > visibleRight + 1);
      destination = target ? target.right - tabs.clientWidth : tabs.scrollWidth;
    } else {
      const target = [...bounds].reverse().find((item) => item.left < tabs.scrollLeft - 1);
      destination = target ? target.left : 0;
    }
    tabs.scrollTo({ left: Math.max(0, destination), behavior: "smooth" });
  }

  _renamePanelTab(id, button) {
    const tab = this._panelTabs.find((item) => item.id === id);
    if (!tab || !button || button.querySelector("input")) return;
    const index = this._panelTabs.indexOf(tab);
    const previousName = String(tab.name || "");
    const input = document.createElement("input");
    input.className = "panel-tab-name-input";
    input.value = previousName || this._panelTabLabel(index);
    input.maxLength = 40;
    input.setAttribute("aria-label", this._localize("ui.common.rename", "Rename"));
    button.replaceChildren(input);
    button.draggable = false;
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) tab.name = input.value.trim();
      button.replaceChildren(document.createTextNode(this._panelTabDisplayLabel(tab, index)));
      button.draggable = true;
      if (save) this._persistPanelTabs();
    };
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("dblclick", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        button.focus();
      }
    });
    input.addEventListener("blur", () => finish(true), { once: true });
    input.focus();
    input.select();
  }

  _finishPanelTabReorder(tabs) {
    const ids = Array.from(tabs.querySelectorAll("[data-panel-tab-item]"), (item) => (
      item.dataset.panelTabItem
    ));
    const byId = new Map(this._panelTabs.map((tab) => [tab.id, tab]));
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
    if (reordered.length !== this._panelTabs.length) return;
    this._panelTabs = reordered;
    for (const [index, tab] of this._panelTabs.entries()) {
      const button = tabs.querySelector(`[data-panel-tab="${CSS.escape(tab.id)}"]`);
      if (button && !button.querySelector("input")) {
        button.textContent = this._panelTabDisplayLabel(tab, index);
      }
    }
    this._persistPanelTabs();
  }

  _bindPanelTabs() {
    this.shadowRoot.getElementById("add-panel")?.addEventListener("click", () => {
      if (!this._panelTabsDependencySupported()) {
        this.dispatchEvent(new CustomEvent("hass-notification", {
          detail: { message: this._customLocalize("add_panel_requires_version") },
          bubbles: true,
          composed: true,
        }));
        return;
      }
      this._addPanelTab();
    });
    for (const button of this.shadowRoot.querySelectorAll("[data-panel-tab]")) {
      let switchTimer = null;
      button.addEventListener("click", () => {
        if (switchTimer) window.clearTimeout(switchTimer);
        switchTimer = window.setTimeout(() => {
          switchTimer = null;
          this._switchPanelTab(button.dataset.panelTab);
        }, 220);
      });
      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (switchTimer) window.clearTimeout(switchTimer);
        switchTimer = null;
        this._renamePanelTab(button.dataset.panelTab, button);
      });
    }
    for (const button of this.shadowRoot.querySelectorAll("[data-close-panel]")) {
      button.addEventListener("click", () => this._closePanelTab(button.dataset.closePanel));
    }
    this._panelTabsResizeObserver?.disconnect();
    this._panelTabsResizeObserver = null;
    const tabs = this.shadowRoot.querySelector(".panel-tabs");
    if (!tabs) return;
    let dragging = null;
    let dragBlocked = false;
    tabs.addEventListener("pointerdown", (event) => {
      dragBlocked = Boolean(event.target.closest(".panel-tab-close, .panel-tab-name-input"));
    });
    tabs.addEventListener("dragstart", (event) => {
      if (dragBlocked) {
        event.preventDefault();
        dragBlocked = false;
        return;
      }
      dragging = event.target.closest("[data-panel-tab-item]");
      if (!dragging) return;
      dragging.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragging.dataset.panelTabItem);
    });
    tabs.addEventListener("dragover", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const target = event.target.closest("[data-panel-tab-item]");
      if (!target || target === dragging) return;
      const rect = target.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      tabs.insertBefore(dragging, after ? target.nextSibling : target);
    });
    const finishDrag = () => {
      dragBlocked = false;
      if (!dragging) return;
      dragging.classList.remove("dragging");
      dragging = null;
      this._finishPanelTabReorder(tabs);
      this._syncPanelTabScrollButtons();
    };
    tabs.addEventListener("drop", (event) => {
      event.preventDefault();
      finishDrag();
    });
    tabs.addEventListener("dragend", finishDrag);
    tabs.addEventListener("scroll", () => this._syncPanelTabScrollButtons(), { passive: true });
    for (const button of this.shadowRoot.querySelectorAll("[data-scroll-panels]")) {
      button.addEventListener("click", () => {
        this._scrollPanelTabs(tabs, Number(button.dataset.scrollPanels));
      });
    }
    this._panelTabsResizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => this._syncPanelTabScrollButtons());
    this._panelTabsResizeObserver?.observe(tabs);
    requestAnimationFrame(() => {
      this._syncPanelTabScrollButtons();
      const active = tabs.querySelector(".panel-tab.active");
      if (active) {
        const viewport = tabs.getBoundingClientRect();
        const rect = active.getBoundingClientRect();
        const left = tabs.scrollLeft + rect.left - viewport.left;
        const right = left + rect.width;
        if (left < tabs.scrollLeft) tabs.scrollLeft = left;
        else if (right > tabs.scrollLeft + tabs.clientWidth) {
          tabs.scrollLeft = right - tabs.clientWidth;
        }
      }
      this._syncPanelTabScrollButtons();
    });
  }
}
