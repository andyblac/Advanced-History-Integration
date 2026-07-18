import { CARD_TAG } from "./constants.js";
import { EnergyMethods } from "./energy.js";
import { GraphMethods } from "./graphs.js";
import { StorageMethods } from "./storage.js";
import { panelStyles as css } from "./styles.js";
import { TargetPickerMethods } from "./target-picker.js";
import { customLocalize } from "./translations.js";

const PANEL_VERSION = "1.9.6";

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

  async _ensureCardLoaded() {
    if (customElements.get(CARD_TAG)) return;
    const candidates = this.config.card_module_url ? [this.config.card_module_url] : [
      "/hacsfiles/Statistics-Graph-Chart-Card/statistics-graph-chart-card.js",
      "/hacsfiles/statistics-graph-chart-card/statistics-graph-chart-card.js",
    ];
    for (const url of candidates) {
      try {
        await import(/* @vite-ignore */ url);
        if (customElements.get(CARD_TAG)) return;
      } catch (error) { console.debug(`Advanced History: unable to import ${url}`, error); }
    }
    this._cardLoadError = this._customLocalize("card_load_error");
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
        <section class="filters">
          <div id="target-picker-host" class="native-target-picker">
            <div class="native-picker-status">${this._escape(this._localize("ui.common.loading", "Loading"))}…</div>
          </div>
        </section>
        <section id="compare-banner" class="compare-banner" hidden></section>
        ${this._notice ? `<div class="notice">${this._escape(this._notice)}</div>` : ""}
        <section id="charts" class="charts"></section>
      </main>
      <div id="date-controller" class="energy-nav-floating"></div>`;
    const menu = this.shadowRoot.getElementById("menu");
    if (menu) { menu.hass = this._hass; menu.narrow = this._narrow; }
    this.shadowRoot.getElementById("remove-all")?.addEventListener("click", () => { this._archiveCurrentChart(); this._activeSnapshot = null; this._targets = { area_id: [], device_id: [], entity_id: [] }; this._saveTargets(); this._recordChange(); this._notice = ""; this._render(); });
    this.shadowRoot.getElementById("bookmarks")?.addEventListener("click", () => this._openLibrary());
    this.shadowRoot.getElementById("chart-history")?.addEventListener("click", () => this._openLibrary("history"));
    this.shadowRoot.getElementById("undo")?.addEventListener("click", () => this._undo());
    this.shadowRoot.getElementById("redo")?.addEventListener("click", () => this._redo());
    this.shadowRoot.getElementById("settings")?.addEventListener("click", () => this._openGraphEditor());
    this._updateUndoRedoButtons();
    this._renderNativeTargetPicker();
    this._renderContent();
  }

  _renderContent() {
    this._energyUnsubscribe?.();
    this._energyUnsubscribe = null;
    this._cards = [];
    this._graphCards = [];
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
