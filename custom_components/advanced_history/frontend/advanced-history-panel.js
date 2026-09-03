import {
  CARD_DEFAULT_MODULE_URLS,
  CARD_RESOURCE_MATCH,
  CARD_TAG,
  DATE_PICKER_AUTO_HIDE_STORAGE_KEY,
} from "./constants.js";
import { EnergyMethods } from "./energy.js";
import { DiagnosticsMethods } from "./diagnostics.js";
import { GraphMethods } from "./graphs.js";
import { ShareMethods } from "./share.js";
import { StorageMethods } from "./storage.js";
import { panelStyles as css } from "./styles.js";
import { PanelTabsMethods } from "./panel-tabs.js";
import { TargetPickerMethods } from "./target-picker.js";
import { customLocalize, loadTranslations } from "./translations.js";
import {
  addCardsToDashboard,
  dashboardCardSnapshots,
} from "./panel-export.js";

class AdvancedHistoryPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._panel = null;
    this._areas = [];
    this._devices = [];
    this._entities = [];
    this._targets = { area_id: [], device_id: [], entity_id: [] };
    this._hiddenTargets = { area_id: [], device_id: [], entity_id: [] };
    this._y2Targets = { area_id: [], device_id: [], entity_id: [] };
    this._hiddenY2Targets = { area_id: [], device_id: [], entity_id: [] };
    this._excludeY2Comparison = false;
    this._loaded = false;
    this._initialized = false;
    this._cards = [];
    this._graphCards = [];
    this._cardLoadError = "";
    this._notice = "";
    this._energyRenderToken = null;
    this._energyCompare = null;
    this._energyCompareChoice = null;
    this._energyCompareCount = 1;
    this._energyComparePeriodKind = null;
    this._energyUnsubscribe = null;
    this._nativeTargetPicker = null;
    this._nativeY2TargetPicker = null;
    this._editorAutoColors = new Map();
    this._activeSnapshot = null;
    this._energyCollection = null;
    this._panelTimeRange = null;
    this._panelRollingHours = null;
    this._panelRollingResumeHours = null;
    this._panelRollingTimer = null;
    this._pendingRollingCompareRestore = null;
    this._panelTimeRangePreview = false;
    this._pendingPeriodRestore = null;
    this._currentSnapshot = null;
    this._freshSnapshotSessionFingerprint = null;
    this._incomingTargetOverride = false;
    this._bookmarkSyncReady = false;
    this._bookmarkSaveQueue = Promise.resolve();
    this._loadedBookmarkId = null;
    this._loadedExternalBookmark = false;
    this._loadedExternalBookmarkOwnerId = null;
    this._loadedExternalBookmarkId = null;
    this._externalBookmarkRefreshToken = 0;
    this._loadedBookmarkBaselineFingerprint = null;
    this._loadedBookmarkDirty = false;
    this._bookmarkCatalog = { shared: [], users: [] };
    this._bookmarkLibraryView = "mine";
    this._bookmarkRemoteLibraries = new Map();
    this._unsavedDialogPromise = null;
    this._periodRestoreLoading = false;
    this._periodRestoreExpected = null;
    this._periodRestoreTimer = null;
    this._energyInteractionLoading = false;
    this._energyResetPending = false;
    try {
      this._datePickerAutoHide = localStorage.getItem(DATE_PICKER_AUTO_HIDE_STORAGE_KEY) === "true";
    } catch (_) {
      this._datePickerAutoHide = false;
    }
    this._datePickerAutoHideTimer = null;
    this._panelTimeRangeDialogOpen = false;
    this._largeRangeFineDetail = false;
    this._largeRangeDetailStateKey = null;
    this._largeRangeDetailDismissedKey = null;
    this._versionLogged = false;
    const initialPanelTabId = globalThis.crypto?.randomUUID?.()
      || `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this._panelTabs = [{ id: initialPanelTabId, state: null }];
    this._activePanelTabId = initialPanelTabId;
    this._panelTabsStorageInspected = false;
    this._panelTabsPersistenceSuppressed = false;
    this._pendingPanelTabHandoff = null;
    this._persistPanelsOnPageHide = () => this._persistPanelTabs();
    this._refreshAliasOnVisibility = () => {
      if (document.visibilityState === "visible") {
        this._scheduleExternalBookmarkRefresh?.();
      }
    };
  }

  set hass(value) {
    this._hass = value;
    if (this._nativeTargetPicker) {
      this._nativeTargetPicker.hass = this._targetPickerHass();
      this._syncNativeTargetVisibility("primary");
    }
    if (this._nativeY2TargetPicker) {
      this._nativeY2TargetPicker.hass = this._targetPickerHass();
      this._syncNativeTargetVisibility("secondary");
    }
    for (const card of this._cards) this._setGraphCardHass(card, value);
    if (!this._loaded && value) this._initialize();
  }
  get hass() { return this._hass; }
  set panel(value) {
    this._panel = value;
    if (!this._versionLogged && this.config.integration_version) {
      console.info(`%c ADVANCED-HISTORY-PANEL %c v${this.config.integration_version} `, "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white");
      this._versionLogged = true;
    }
    if (!this._loaded && this._hass) this._initialize();
  }
  get panel() { return this._panel; }
  set narrow(value) {
    const changed = this._narrow !== value;
    this._narrow = value;
    if (changed && this._initialized && this.isConnected) this._render();
  }
  get narrow() { return this._narrow; }
  get config() { return this._panel?.config || {}; }
  get maxEntities() { return Number(this.config.max_entities) || 30; }
  get maxTabs() {
    return Math.max(1, Math.min(50, Math.trunc(Number(this.config.max_tabs)) || 10));
  }

  _comparisonIsActive(value = this._effectiveCompare?.()) {
    return value !== null
      && value !== undefined
      && value !== false
      && value !== ""
      && (!Array.isArray(value) || value.length > 0);
  }

  _syncY2ComparisonToggle(compareActive = this._comparisonIsActive()) {
    const button = this.shadowRoot?.getElementById("toggle-y2-comparison");
    if (!button) return;
    const excluded = Boolean(this._excludeY2Comparison);
    button.hidden = !compareActive || !this._targetCount(this._y2Targets);
    button.classList.toggle("active", !excluded);
    button.setAttribute("aria-pressed", String(!excluded));
    const label = this._customLocalize(
      excluded ? "include_y2_comparison" : "exclude_y2_comparison",
    );
    button.title = label;
    button.setAttribute("aria-label", label);
    button.querySelector("ha-icon")?.setAttribute("icon", "mdi:compare-horizontal");
  }

  _toggleY2Comparison() {
    this._excludeY2Comparison = !this._excludeY2Comparison;
    this._syncY2ComparisonToggle(true);
    this._recordChange(null, true);
    this._renderGraphs();
  }

  async _addCurrentPanelToDashboard(button) {
    const cards = dashboardCardSnapshots(this._graphCards, {
      start: this._energyCollection?.start,
      end: this._energyCollection?.end,
      rollingHours: this._panelRollingHours,
    });
    if (!cards.length) return;
    const runningTotalEnabled = Object.values(
      this._activeSnapshot?.series_transforms || {}
    ).includes("running_total") || Object.values(
      this._activeSnapshot?.running_total_axes || {}
    ).includes(true);
    if (button) button.disabled = true;
    try {
      await addCardsToDashboard({
        hass: this._hass,
        container: this,
        cards,
        ensureNativeHistory: () => this._loadNativeHistoryPicker(true),
        labels: {
          dialogTitle: this._customLocalize("add_current_panel_to_dashboard"),
          fallbackTitle: this._customLocalize("dashboard_yaml_fallback_title"),
          copyYaml: this._customLocalize("copy_dashboard_yaml"),
          copied: this._customLocalize("dashboard_yaml_copied"),
          copyFailed: this._customLocalize("dashboard_yaml_copy_error"),
          hideEntitiesOnLoad: this._customLocalize("hide_entities_on_load"),
          hideEntitiesOnLoadNote: this._customLocalize("hide_entities_on_load_note"),
          exportWarning: runningTotalEnabled
            ? this._customLocalize("running_total_export_warning")
            : "",
          close: this._localize("ui.common.close", "Close"),
        },
      });
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  _localize(key, fallback, replacements) {
    return this._hass?.localize?.(key, replacements) || fallback;
  }

  _customLocalize(key, replacements) {
    const language = this._hass?.locale?.language || this._hass?.language;
    return customLocalize(language, key, replacements);
  }

  connectedCallback() {
    window.addEventListener("pagehide", this._persistPanelsOnPageHide);
    document.addEventListener("visibilitychange", this._refreshAliasOnVisibility);
    if (!this._initialized || !this._hass) return;
    queueMicrotask(() => {
      if (!this.isConnected) return;
      if (!this._energyUnsubscribe) this._render();
      if (this._panelRollingHours) this._refreshPanelRollingRange();
      this._scheduleExternalBookmarkRefresh?.();
    });
  }

  disconnectedCallback() {
    this._persistPanelTabs();
    window.removeEventListener("pagehide", this._persistPanelsOnPageHide);
    document.removeEventListener("visibilitychange", this._refreshAliasOnVisibility);
    this._panelTabsResizeObserver?.disconnect();
    this._panelTabsResizeObserver = null;
    this._disconnectDynamicGraphLayout?.();
    this._energyRenderToken = null;
    this._energyUnsubscribe?.();
    this._energyUnsubscribe = null;
    this._energyCollection = null;
    if (this._panelRollingTimer) window.clearTimeout(this._panelRollingTimer);
    this._panelRollingTimer = null;
    if (this._periodRestoreTimer) window.clearTimeout(this._periodRestoreTimer);
    this._periodRestoreTimer = null;
    if (this._datePickerAutoHideTimer) window.clearTimeout(this._datePickerAutoHideTimer);
    this._datePickerAutoHideTimer = null;
  }

  async _initialize() {
    this._loaded = true;
    await loadTranslations(this._hass?.locale?.language || this._hass?.language);
    await this._loadTargets();
    this._loadingView();
    try {
      [this._areas, this._devices, this._entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
      ]);
    } catch (error) {
      console.warn("Advanced History: registry lookup failed", error);
      this._entities = Object.keys(this._hass.states).map((entity_id) => ({ entity_id }));
    }
    await Promise.all([
      this._loadEnergyTranslations(),
      this._ensureCardLoaded(),
      this._loadSyncedBookmarks(),
      this._loadNativeHistoryPicker().catch((error) => {
        console.error("Advanced History: native target picker preload failed", error);
      }),
    ]);
    this._initialized = true;
    const restoredPanels = this._restorePersistedPanelTabs();
    const openedHandoffPanel = this._openPendingPanelTabHandoff?.();
    if (this.isConnected && !restoredPanels && !openedHandoffPanel) this._render();
    this._scheduleExternalBookmarkRefresh?.();
  }

  async _loadEnergyTranslations() {
    if (typeof this._hass?.loadFragmentTranslation !== "function") return;
    try {
      const results = await Promise.allSettled([
        this._hass.loadFragmentTranslation("lovelace"),
        this._hass.loadFragmentTranslation("energy"),
        this._hass.loadFragmentTranslation("history"),
      ]);
      for (const result of results) {
        if (result.status === "rejected") console.debug("Advanced History: optional translation fragment unavailable", result.reason);
      }
    } catch (error) {
      console.warn("Advanced History: Energy translations could not be loaded", error);
    }
  }

  async _ensureCardLoaded(cacheBust = false) {
    this._cardLoadError = "";
    if (customElements.get(CARD_TAG)) return true;

    const configured = this.config.card_module_url;
    const candidates = configured ? [configured] : [];
    if (!configured) {
      try {
        const resources = await this._hass.callWS({ type: "lovelace/resources" });
        for (const resource of Array.isArray(resources) ? resources : []) {
          const url = resource?.url;
          if (typeof url === "string" && url.toLowerCase().includes(CARD_RESOURCE_MATCH)) {
            candidates.push(url);
          }
        }
      } catch (error) {
        console.debug("Advanced History: dashboard resources could not be inspected", error);
      }
      candidates.push(...CARD_DEFAULT_MODULE_URLS);
    }

    for (const candidate of [...new Set(candidates)]) {
      const separator = candidate.includes("?") ? "&" : "?";
      const url = cacheBust ? `${candidate}${separator}advanced_history_retry=${Date.now()}` : candidate;
      try {
        await import(/* @vite-ignore */ url);
        if (customElements.get(CARD_TAG)) return true;
      } catch (error) { console.debug(`Advanced History: unable to import ${url}`, error); }
    }
    this._cardLoadError = this._customLocalize("card_load_error");
    return false;
  }

  async _retryCardLoad(button) {
    if (button) {
      button.disabled = true;
      const label = button.querySelector("span");
      if (label) label.textContent = `${this._localize("ui.common.loading", "Loading")}…`;
    }
    await this._ensureCardLoaded(true);
    this._render();
  }

  _loadingView() {
    const history = this._localize("panel.history", "History");
    const loading = this._localize("ui.common.loading", "Loading");
    this.shadowRoot.innerHTML = `<style>${css}</style><div class="appbar"><h1>${this._escape(history)}</h1></div><main class="content"><div class="start"><p>${this._escape(loading)}…</p></div></main>`;
  }

  _render() {
    const title = this.config.title || this._localize("panel.history", "History");
    const removeAll = this._localize("ui.panel.history.remove_all", "Remove all selections");
    const bookmarks = this._customLocalize("bookmarks");
    const chartHistory = this._customLocalize("chart_history");
    const undo = this._localize("ui.common.undo", "Undo");
    const redo = this._localize("ui.common.redo", "Redo");
    const addPanel = this._customLocalize("add_panel");
    const addPanelRequiresVersion = this._customLocalize("add_panel_requires_version");
    const showDatePicker = this._localize(
      "ui.components.date-range-picker.select_date_range",
      "Select time period",
    );
    const dependencyMissing = Boolean(this._cardLoadError);
    const secondaryAxisEditable = this._secondaryAxisEditable();
    const hasY1Targets = Boolean(this._targetCount(this._targets));
    const hasY2Targets = secondaryAxisEditable && Boolean(this._targetCount(this._y2Targets));
    const y1TargetClass = !hasY1Targets && hasY2Targets ? " axis-target-compact" : "";
    const y2TargetClass = !hasY2Targets && hasY1Targets ? " axis-target-compact" : "";
    this._nativeTargetPicker = null;
    this._nativeY2TargetPicker = null;
    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      <header class="appbar">
        <ha-menu-button id="menu"></ha-menu-button><h1>${this._escape(title)}</h1>
        ${this._renderPanelTabs()}
        <span class="spacer"></span>
        ${this._desktopPanelLayoutAvailable() ? `<button id="add-panel" class="icon-button desktop-panel-only" title="${this._escape(this._panelTabsDependencySupported() ? addPanel : addPanelRequiresVersion)}" aria-label="${this._escape(this._panelTabsDependencySupported() ? addPanel : addPanelRequiresVersion)}" ${this._panelTabs.length >= this.maxTabs ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon></button>` : ""}
        <button id="bookmarks" class="icon-button" title="${this._escape(bookmarks)}"><ha-icon icon="mdi:bookmark-multiple-outline"></ha-icon></button>
        <button id="chart-history" class="icon-button" title="${this._escape(chartHistory)}"><ha-icon icon="mdi:history"></ha-icon></button>
        <button id="undo" class="icon-button" title="${this._escape(undo)}"><ha-icon icon="mdi:undo"></ha-icon></button>
        <button id="redo" class="icon-button" title="${this._escape(redo)}"><ha-icon icon="mdi:redo"></ha-icon></button>
        <button id="remove-all" class="icon-button" title="${this._escape(removeAll)}" ${this._targetCount() ? "" : "hidden"}><ha-icon icon="mdi:filter-remove-outline"></ha-icon></button>
      </header>
      <main class="content${this._datePickerAutoHide ? " date-picker-auto-hide" : ""}">
        ${dependencyMissing ? "" : `<section class="filters axis-targets">
          <div class="axis-target-group axis-target-primary${y1TargetClass}">
            <div class="axis-target-label">
              <span class="axis-badge">Y1</span><span>${this._escape(this._customLocalize("primary_axis"))}</span>
              <button id="toggle-y1-running-total" class="axis-running-total-toggle axis-running-total-primary" type="button" hidden role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
            </div>
            <div id="target-picker-host" class="native-target-picker">
              <div class="native-picker-status">${this._escape(this._localize("ui.common.loading", "Loading"))}…</div>
            </div>
          </div>
          ${secondaryAxisEditable ? `<div class="axis-target-divider" aria-hidden="true"></div>
          <div class="axis-target-group axis-target-secondary${y2TargetClass}">
            <div class="axis-target-label">
              <button id="toggle-y2-running-total" class="axis-running-total-toggle axis-running-total-secondary" type="button" hidden role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
              <button id="toggle-y2-comparison" class="axis-compare-toggle${this._excludeY2Comparison ? "" : " active"}" type="button" hidden aria-pressed="${this._excludeY2Comparison ? "false" : "true"}"><ha-icon icon="mdi:compare-horizontal"></ha-icon></button>
              <span class="axis-badge">Y2</span><span>${this._escape(this._customLocalize("secondary_axis"))}</span>
            </div>
            <div id="y2-target-picker-host" class="native-target-picker">
              <div class="native-picker-status">${this._escape(this._localize("ui.common.loading", "Loading"))}…</div>
            </div>
          </div>` : ""}
        </section>`}
        <section id="period-loading-banner" class="loading-banner" ${this._periodRestoreLoading ? "" : "hidden"}>
          <ha-circular-progress active size="small"></ha-circular-progress>
          <span id="period-loading-text">${this._escape(this._customLocalize("loading_requested_range"))}</span>
        </section>
        ${dependencyMissing ? "" : `<section id="compare-banner" class="compare-banner" hidden></section>`}
        <section id="detail-banner" class="detail-banner" hidden></section>
        ${this._notice ? `<div class="notice">${this._escape(this._notice)}</div>` : ""}
        <section id="charts" class="charts" ${this._periodRestoreLoading ? "hidden" : ""}></section>
      </main>
      ${dependencyMissing ? "" : `<button id="date-controller-reveal" class="energy-nav-reveal-zone" type="button" title="${this._escape(showDatePicker)}" aria-label="${this._escape(showDatePicker)}" ${this._datePickerAutoHide ? "" : "hidden"}></button>
      <div id="date-controller" class="energy-nav-floating${this._datePickerAutoHide ? " auto-hide" : ""}"></div>`}`;
    const menu = this.shadowRoot.getElementById("menu");
    if (menu) { menu.hass = this._hass; menu.narrow = this._narrow; }
    this.shadowRoot.getElementById("remove-all")?.addEventListener(
      "click",
      () => this._requestClearCurrentChart(),
    );
    this.shadowRoot.getElementById("bookmarks")?.addEventListener("click", () => this._openLibrary());
    this.shadowRoot.getElementById("chart-history")?.addEventListener("click", () => this._openLibrary("history"));
    this.shadowRoot.getElementById("undo")?.addEventListener("click", () => this._undo());
    this.shadowRoot.getElementById("redo")?.addEventListener("click", () => this._redo());
    this.shadowRoot.getElementById("toggle-y2-comparison")?.addEventListener(
      "click",
      () => this._toggleY2Comparison(),
    );
    this.shadowRoot.getElementById("toggle-y1-running-total")?.addEventListener(
      "click",
      () => this._toggleAxisRunningTotal("primary"),
    );
    this.shadowRoot.getElementById("toggle-y2-running-total")?.addEventListener(
      "click",
      () => this._toggleAxisRunningTotal("secondary"),
    );
    this._syncY2ComparisonToggle();
    this._syncRunningTotalAxisButtons();
    this._bindEnergyDatePickerAutoHide?.();
    this._bindPanelTabs();
    this._updateUndoRedoButtons();
    if (!dependencyMissing) {
      void this._renderNativeTargetPicker("primary").then(() => {
        if (secondaryAxisEditable) return this._renderNativeTargetPicker("secondary");
        return undefined;
      });
    }
    this._renderContent();
  }

  _renderContent() {
    this._energyUnsubscribe?.();
    this._energyUnsubscribe = null;
    this._cards = [];
    this._graphCards = [];
    if (this._cardLoadError) {
      this._renderGraphs();
      return;
    }
    this._renderEnergyController();
    // A newly mounted Energy collection first exposes its previous cached
    // result. Do not create graph cards from that stale range while a saved
    // period is being restored; the collection subscriber renders them once
    // Home Assistant confirms the requested period.
    if (!this._periodRestoreLoading) this._renderGraphs();
  }

  _escape(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[char]); }
}

for (const methods of [
  StorageMethods,
  ShareMethods,
  TargetPickerMethods,
  GraphMethods,
  EnergyMethods,
  DiagnosticsMethods,
  PanelTabsMethods,
]) {
  for (const name of Object.getOwnPropertyNames(methods.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(
      AdvancedHistoryPanel.prototype,
      name,
      Object.getOwnPropertyDescriptor(methods.prototype, name)
    );
  }
}

if (!customElements.get("advanced-history-panel")) customElements.define("advanced-history-panel", AdvancedHistoryPanel);
