import {
  CARD_DEFAULT_MODULE_URLS,
  CARD_RESOURCE_MATCH,
  CARD_TAG,
} from "./constants.js";
import { EnergyMethods } from "./energy.js";
import { GraphMethods } from "./graphs.js";
import { StorageMethods } from "./storage.js";
import { panelStyles as css } from "./styles.js";
import { TargetPickerMethods } from "./target-picker.js";
import { customLocalize } from "./translations.js";

const PANEL_VERSION = "0.5.1";

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
    this._draftTargets = null;
    this._activeTab = "area_id";
    this._dialogSearch = "";
    this._loaded = false;
    this._cards = [];
    this._graphCards = [];
    this._cardLoadError = "";
    this._notice = "";
    this._energyRenderToken = null;
    this._energyCompare = null;
    this._energyUnsubscribe = null;
    this._nativeTargetPicker = null;
    this._editorAutoColors = new Map();
    this._activeSnapshot = null;
    this._energyCollection = null;
    this._pendingPeriodRestore = null;
    this._currentSnapshot = null;
    this._incomingTargetOverride = false;
    this._bookmarkSyncReady = false;
    this._bookmarkSaveQueue = Promise.resolve();
    this._periodRestoreLoading = false;
    this._periodRestoreExpected = null;
    this._periodRestoreTimer = null;
  }

  set hass(value) {
    this._hass = value;
    if (this._nativeTargetPicker) this._nativeTargetPicker.hass = this._targetPickerHass();
    for (const card of this._cards) card.hass = value;
    if (!this._loaded && value) this._initialize();
  }
  get hass() { return this._hass; }
  set panel(value) { this._panel = value; if (!this._loaded && this._hass) this._initialize(); }
  get panel() { return this._panel; }
  set narrow(value) { this._narrow = value; }
  get narrow() { return this._narrow; }
  get config() { return this._panel?.config || {}; }
  get maxEntities() { return Number(this.config.max_entities) || 30; }

  _localize(key, fallback, replacements) {
    return this._hass?.localize?.(key, replacements) || fallback;
  }

  _customLocalize(key, replacements) {
    const language = this._hass?.locale?.language || this._hass?.language;
    return customLocalize(language, key, replacements);
  }

  disconnectedCallback() {
    this._energyUnsubscribe?.();
    this._energyUnsubscribe = null;
    this._energyCollection = null;
    if (this._periodRestoreTimer) window.clearTimeout(this._periodRestoreTimer);
    this._periodRestoreTimer = null;
  }

  async _initialize() {
    this._loaded = true;
    this._loadTargets();
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
    this._render();
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
    const graphSettings = this._customLocalize("graph_settings");
    const undo = this._localize("ui.common.undo", "Undo");
    const redo = this._localize("ui.common.redo", "Redo");
    const dependencyMissing = Boolean(this._cardLoadError);
    this._nativeTargetPicker = null;
    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      <header class="appbar">
        <ha-menu-button id="menu"></ha-menu-button><h1>${this._escape(title)}</h1><span class="spacer"></span>
        <button id="bookmarks" class="icon-button" title="${this._escape(bookmarks)}"><ha-icon icon="mdi:bookmark-multiple-outline"></ha-icon></button>
        <button id="chart-history" class="icon-button" title="${this._escape(chartHistory)}"><ha-icon icon="mdi:history"></ha-icon></button>
        <button id="undo" class="icon-button" title="${this._escape(undo)}"><ha-icon icon="mdi:undo"></ha-icon></button>
        <button id="redo" class="icon-button" title="${this._escape(redo)}"><ha-icon icon="mdi:redo"></ha-icon></button>
        ${this.config.settings_path && this._hass?.user?.is_admin ? `<button id="settings" class="icon-button" title="${this._escape(graphSettings)}"><ha-icon icon="mdi:cog-outline"></ha-icon></button>` : ""}
        <button id="remove-all" class="icon-button" title="${this._escape(removeAll)}" ${this._targetCount() ? "" : "hidden"}><ha-icon icon="mdi:filter-remove-outline"></ha-icon></button>
      </header>
      <main class="content">
        ${dependencyMissing ? "" : `<section class="filters">
          <div id="target-picker-host" class="native-target-picker">
            <div class="native-picker-status">${this._escape(this._localize("ui.common.loading", "Loading"))}…</div>
          </div>
        </section>
        <section id="compare-banner" class="compare-banner" hidden></section>`}
        <section id="period-loading-banner" class="loading-banner" ${this._periodRestoreLoading ? "" : "hidden"}>
          <ha-circular-progress active size="small"></ha-circular-progress>
          <span>${this._escape(this._customLocalize("loading_saved_range"))}</span>
        </section>
        ${this._notice ? `<div class="notice">${this._escape(this._notice)}</div>` : ""}
        <section id="charts" class="charts"></section>
      </main>
      ${dependencyMissing ? "" : `<div id="date-controller" class="energy-nav-floating"></div>`}`;
    const menu = this.shadowRoot.getElementById("menu");
    if (menu) { menu.hass = this._hass; menu.narrow = this._narrow; }
    this.shadowRoot.getElementById("remove-all")?.addEventListener("click", () => { this._archiveCurrentChart(); this._activeSnapshot = null; this._targets = { area_id: [], device_id: [], entity_id: [] }; this._saveTargets(); this._recordChange(); this._notice = ""; this._render(); });
    this.shadowRoot.getElementById("bookmarks")?.addEventListener("click", () => this._openLibrary());
    this.shadowRoot.getElementById("chart-history")?.addEventListener("click", () => this._openLibrary("history"));
    this.shadowRoot.getElementById("undo")?.addEventListener("click", () => this._undo());
    this.shadowRoot.getElementById("redo")?.addEventListener("click", () => this._redo());
    this.shadowRoot.getElementById("settings")?.addEventListener("click", () => this._openGraphEditor());
    this._updateUndoRedoButtons();
    if (!dependencyMissing) this._renderNativeTargetPicker();
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
    this._renderGraphs();
  }

  _escape(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[char]); }
}

for (const methods of [
  StorageMethods,
  TargetPickerMethods,
  GraphMethods,
  EnergyMethods,
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
console.info(`%c ADVANCED-HISTORY-PANEL %c v${PANEL_VERSION} `, "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white");
