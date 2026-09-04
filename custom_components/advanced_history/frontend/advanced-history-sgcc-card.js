import { AdvancedHistoryPanel } from "./advanced-history-panel.js";
import {
  ADVANCED_HISTORY_CARD_SCHEMA,
  ADVANCED_HISTORY_CARD_TAG,
  CARD_TAG,
} from "./constants.js";
import { cardConfigToSnapshot } from "./card-handoff.js";
import { ensureCardLoaded } from "./config-flow-defaults.js";
import { customLocalize, loadTranslations } from "./translations.js";
import { panelStyles } from "./styles.js";

const DASHBOARD_CARD_STATE_STORAGE_PREFIX = "advanced_history_dashboard_card_state_v1";
const DASHBOARD_RUNTIME_CHART_KEYS = [
  "time_range",
  "rolling_hours",
  "rolling_resume_hours",
  "series_transforms",
  "running_total_axes",
  "compare",
  "exclude_y2_comparison",
  "show_comparison_banner",
];

const cardStyles = `
  ${panelStyles}
  :host { min-height:0; height:100%; background:transparent; }
  ha-card.dashboard-card {
    height:100%; overflow:hidden; display:flex; flex-direction:column;
    background:var(--ha-card-background,var(--card-background-color));
  }
  .dashboard-card-title { padding:14px 16px 4px; font-size:16px; font-weight:500; }
  .dashboard-card-content {
    min-height:0; padding:8px 12px 12px; display:flex; flex:1 1 auto; flex-direction:column;
  }
  .dashboard-axis-strip {
    min-height:47px; margin:0 4px 6px; display:grid;
    grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
    align-items:center; gap:12px; color:var(--secondary-text-color); font-size:12px; font-weight:500;
  }
  .dashboard-axis-group { min-width:0; display:flex; align-items:center; gap:7px; }
  .dashboard-axis-group.secondary { justify-content:flex-end; }
  .dashboard-date-controls {
    min-width:0; max-width:100%; display:flex; align-items:center;
    justify-self:center; gap:5px; width:max-content;
  }
  .dashboard-download-button {
    width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center;
    color:var(--secondary-text-color); background:var(--secondary-background-color);
    border:1px solid var(--divider-color); border-radius:15px; cursor:pointer;
    line-height:0;
  }
  .dashboard-download-button:hover { color:var(--primary-text-color); }
  .dashboard-download-button ha-icon {
    display:block; flex:0 0 16px; width:16px; height:16px; line-height:0;
    --mdc-icon-size:16px;
  }
  .dashboard-card-content > .compare-banner,
  .dashboard-card-content > .detail-banner,
  .dashboard-card-content > .loading-banner { margin-bottom:8px; }
  .charts {
    position:static; left:auto; width:100%; min-height:260px; transform:none;
    display:grid; flex:1 1 auto; gap:8px;
  }
  .graph-shell .data-source-indicator {
    top:8px; right:8px; min-height:20px; padding:0 6px;
    max-width:calc(100% - 16px); border-radius:10px; font-size:10px;
  }
  .energy-nav-card { position:relative; z-index:4; width:max-content; max-width:100%; height:46px; }
  .energy-nav-card > .dashboard-energy-bridge { display:none !important; }
  .dashboard-energy-controller {
    box-sizing:border-box; width:max-content; max-width:100%; height:46px;
    padding:3px 8px; display:flex; align-items:center; gap:4px;
    color:var(--primary-text-color); background:var(--card-background-color);
    border:1px solid var(--divider-color); border-radius:23px;
  }
  .dashboard-energy-controller ha-date-range-picker {
    flex:0 0 32px; width:32px; --ha-icon-button-size:32px; --mdc-icon-size:20px;
  }
  .dashboard-period-label {
    min-width:0; padding:0 5px 0 0; display:flex; flex-direction:column;
    align-items:flex-start; justify-content:center; color:inherit; background:transparent;
    border:0; font:inherit; white-space:nowrap; cursor:pointer;
  }
  .dashboard-period-primary { font-size:15px; font-weight:500; line-height:18px; }
  .dashboard-period-secondary { color:var(--secondary-text-color); font-size:11px; line-height:14px; }
  .dashboard-period-secondary:empty { display:none; }
  .dashboard-energy-controller[data-period-kind="day"] .dashboard-period-label { min-width:72px; }
  .dashboard-energy-controller[data-period-kind="week"] .dashboard-period-label { min-width:112px; }
  .dashboard-energy-controller[data-period-kind="month"] .dashboard-period-label { min-width:96px; }
  .dashboard-energy-controller[data-period-kind="year"] .dashboard-period-label { min-width:64px; }
  .dashboard-energy-controller[data-period-kind="other"] .dashboard-period-label { min-width:128px; }
  .dashboard-now-button {
    min-width:52px; height:30px; padding:0 10px; color:var(--primary-color);
    background:color-mix(in srgb,var(--primary-color) 16%,transparent);
    border:0; border-radius:15px; font:inherit; font-size:14px; font-weight:500; cursor:pointer;
  }
  .dashboard-period-nav {
    width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center;
    color:var(--primary-text-color); background:transparent; border:0; border-radius:15px; cursor:pointer;
  }
  .dashboard-period-nav ha-icon { width:18px; height:18px; --mdc-icon-size:18px; }
  .dashboard-period-nav:hover, .dashboard-period-label:hover { background:var(--secondary-background-color); }
  .dashboard-energy-controller .panel-time-range {
    position:static; transform:none; flex:0 0 auto;
  }
  .energy-nav-card .panel-time-range {
    height:32px; min-height:32px; padding-inline:7px; gap:4px; border-radius:16px;
    font-size:13px;
  }
  .energy-nav-card .panel-time-range ha-icon { width:16px; height:16px; flex-basis:16px; }
  .energy-nav-card .panel-time-range-value { min-width:96px; }
  @container (max-width:900px) {
    .dashboard-axis-strip { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
    .dashboard-date-controls {
      grid-column:1 / -1; grid-row:2; margin-inline:auto;
    }
  }
  @container (max-width:520px) {
    .dashboard-card-content { padding-inline:6px; }
    .dashboard-axis-strip { margin-inline:2px; }
    .dashboard-axis-group > span:not(.axis-badge) { display:none; }
  }
`;

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function dashboardRuntimeState(snapshot) {
  const chart = {};
  for (const key of DASHBOARD_RUNTIME_CHART_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snapshot?.chart || {}, key)) {
      chart[key] = clone(snapshot.chart[key]);
    }
  }
  return {
    schema: 1,
    period: clone(snapshot?.period || {}),
    chart,
  };
}

export function applyDashboardRuntimeState(snapshot, state) {
  const next = clone(snapshot);
  if (!next || Number(state?.schema) !== 1) return next;
  if (state.period && typeof state.period === "object") {
    next.period = clone(state.period);
  }
  next.chart = clone(next.chart || {});
  for (const key of DASHBOARD_RUNTIME_CHART_KEYS) {
    if (Object.prototype.hasOwnProperty.call(state.chart || {}, key)) {
      next.chart[key] = clone(state.chart[key]);
    } else {
      delete next.chart[key];
    }
  }
  return next;
}

function mergeTargets(targets) {
  const keys = ["area_id", "device_id", "entity_id"];
  return Object.fromEntries(keys.map((key) => [
    key,
    [...new Set(targets.flatMap((target) => target?.[key] || []))],
  ]));
}

function seriesKey(row) {
  const entity = typeof row === "string" ? row : row?.entity || row?.statistic_id;
  const attribute = typeof row === "object" ? row?.attribute : null;
  return attribute ? `${entity}::${attribute}` : entity;
}

export function containSgccEditorConfigEvent(event) {
  event.stopPropagation();
  return clone(event.detail?.config);
}

export function snapshotFromSgccConfigs(snapshot, configs) {
  const converted = configs.map((config) => cardConfigToSnapshot(config, null, true))
    .filter(Boolean);
  if (!converted.length) return clone(snapshot);
  const next = clone(snapshot);
  next.targets = mergeTargets(converted.map((item) => item.targets));
  next.hidden_targets = mergeTargets(converted.map((item) => item.hidden_targets));
  next.y2_targets = mergeTargets(converted.map((item) => item.y2_targets));
  next.hidden_y2_targets = mergeTargets(converted.map((item) => item.hidden_y2_targets));

  const chart = clone(next.chart || {});
  const existingCardOptions = chart.card_options || {};
  const typed = configs.length > 1
    || Boolean(existingCardOptions.numeric || existingCardOptions.state);
  if (typed) {
    const options = existingCardOptions.numeric || existingCardOptions.state
      ? clone(existingCardOptions)
      : { numeric: clone(existingCardOptions), state: clone(existingCardOptions) };
    for (let index = 0; index < converted.length; index++) {
      const variant = configs[index]?.chart_mode === "state_timeline" ? "state" : "numeric";
      options[variant] = clone(converted[index].chart.card_options || {});
      if (variant === "numeric" && configs[index].height !== undefined) {
        options[variant].height = clone(configs[index].height);
      }
    }
    chart.card_options = options;
  } else {
    chart.card_options = clone(converted[0].chart.card_options || {});
    if (configs[0].height !== undefined) {
      chart.card_options.height = clone(configs[0].height);
    }
  }

  const editedKeys = new Set(configs.flatMap((config) => (
    (config.entities || []).map(seriesKey).filter(Boolean)
  )));
  const entityOptions = clone(chart.entity_options || {});
  for (const key of editedKeys) delete entityOptions[key];
  for (const item of converted) {
    Object.assign(entityOptions, clone(item.chart.entity_options || {}));
  }
  chart.entity_options = entityOptions;
  chart.attribute_selection = Object.assign(
    {},
    ...converted.map((item) => clone(item.chart.attribute_selection || {})),
  );
  const numeric = converted.find((_, index) => configs[index]?.chart_mode !== "state_timeline");
  if (numeric?.chart.default_hours !== undefined) {
    chart.default_hours = numeric.chart.default_hours;
  }
  next.chart = chart;
  return next;
}

function fallbackSgccConfigs(config) {
  const snapshot = config?.snapshot;
  const chart = snapshot?.chart || {};
  const configured = chart.card_options || {};
  const cardOptions = configured.numeric || configured.state
    ? configured.numeric || configured.state || {}
    : configured;
  const y2 = new Set(snapshot?.y2_targets?.entity_id || []);
  const hidden = new Set([
    ...(snapshot?.hidden_targets?.entity_id || []),
    ...(snapshot?.hidden_y2_targets?.entity_id || []),
  ]);
  const entities = (config?.entities || []).map((entity) => ({
    entity,
    ...(clone(chart.entity_options?.[entity]) || {}),
    ...(y2.has(entity) ? { y_axis: "secondary" } : {}),
    ...(hidden.has(entity) ? { enabled: false } : {}),
  }));
  if (!entities.length) return [];
  return [{
    type: `custom:${CARD_TAG}`,
    ...clone(cardOptions),
    height: cardOptions.height ?? "auto",
    entities,
  }];
}

export class AdvancedHistorySgccCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._editor = null;
    this._renderToken = 0;
    this._activeIndex = 0;
  }

  set hass(value) {
    this._hass = value;
    if (this._editor) {
      this._editor.hass = value;
    } else if (!this.shadowRoot.querySelector(".sgcc-editor-host")) {
      void this._render();
    }
    void loadTranslations(value?.locale?.language || value?.language).then(() => {
      this._refreshTabLabels();
    });
  }

  setConfig(config) {
    this._config = clone(config);
    if (!this.shadowRoot.querySelector(".sgcc-editor-host")) this._render();
  }

  async _render() {
    if (!this._config || !this._hass) return;
    const token = ++this._renderToken;
    this._editor = null;
    const storedConfigs = Array.isArray(this._config.sgcc_configs)
      ? this._config.sgcc_configs.filter(Boolean)
      : [];
    const configs = storedConfigs.length ? storedConfigs : fallbackSgccConfigs(this._config);
    if (!configs.length) {
      this.shadowRoot.innerHTML = `<p>${this._customLocalize("dashboard_card_editor_unavailable")}</p>`;
      return;
    }
    this._activeIndex = Math.min(this._activeIndex, configs.length - 1);
    const tabs = configs.length > 1 ? `<nav>${configs.map((config, index) => {
      const label = config.chart_mode === "state_timeline"
        ? this._customLocalize("state_history")
        : this._customLocalize("numeric_history");
      return `<button type="button" data-index="${index}" class="${index === this._activeIndex ? "active" : ""}">${label}</button>`;
    }).join("")}</nav>` : "";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        nav { margin:0 0 12px; display:flex; gap:4px; border-bottom:1px solid var(--divider-color); }
        button { min-height:40px; padding:0 12px; border:0; border-bottom:3px solid transparent; color:var(--secondary-text-color); background:transparent; font:inherit; cursor:pointer; }
        button.active { color:var(--primary-color); border-bottom-color:var(--primary-color); }
        .sgcc-editor-host { min-height:120px; }
        .loading, p { padding:24px 8px; color:var(--secondary-text-color); text-align:center; }
      </style>
      ${tabs}<div class="sgcc-editor-host"><div class="loading">${this._hass.localize?.("ui.common.loading") || "Loading"}…</div></div>`;
    for (const button of this.shadowRoot.querySelectorAll("[data-index]")) {
      button.addEventListener("click", () => {
        this._activeIndex = Number(button.dataset.index) || 0;
        void this._render();
      });
    }
    try {
      await ensureCardLoaded(this._hass, this._config.settings?.card_module_url || "");
      if (token !== this._renderToken) return;
      const cardClass = customElements.get(CARD_TAG);
      let editor = typeof cardClass?.getConfigElement === "function"
        ? await cardClass.getConfigElement()
        : null;
      if (!editor) {
        await customElements.whenDefined("statistics-graph-chart-card-editor");
        editor = document.createElement("statistics-graph-chart-card-editor");
      }
      if (token !== this._renderToken) return;
      editor.hass = this._hass;
      editor.setConfig(clone(configs[this._activeIndex]));
      editor.addEventListener("config-changed", (event) => {
        // Keep SGCC's native card configuration inside the wrapper. If this
        // event reaches Lovelace, it temporarily replaces our card config with
        // `custom:statistics-graph-chart-card` while a field is being edited,
        // which makes Home Assistant switch the dialog to the YAML editor.
        const draft = containSgccEditorConfigEvent(event);
        if (!draft) return;
        const nextConfigs = clone(
          this._config.sgcc_configs?.length
            ? this._config.sgcc_configs
            : configs,
        );
        nextConfigs[this._activeIndex] = draft;
        const next = {
          ...clone(this._config),
          sgcc_configs: nextConfigs,
          snapshot: snapshotFromSgccConfigs(this._config.snapshot, nextConfigs),
        };
        this._config = next;
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: next },
          bubbles: true,
          composed: true,
        }));
      });
      const host = this.shadowRoot.querySelector(".sgcc-editor-host");
      if (!host) return;
      host.replaceChildren(editor);
      this._editor = editor;
    } catch (error) {
      if (token !== this._renderToken) return;
      this._editor = null;
      console.error("Advanced History: SGCC editor could not be loaded", error);
      const host = this.shadowRoot.querySelector(".sgcc-editor-host");
      if (host) host.textContent = this._customLocalize("dashboard_card_editor_unavailable");
    }
  }

  _refreshTabLabels() {
    if (!this._config) return;
    const storedConfigs = Array.isArray(this._config.sgcc_configs)
      ? this._config.sgcc_configs.filter(Boolean)
      : [];
    const configs = storedConfigs.length ? storedConfigs : fallbackSgccConfigs(this._config);
    for (const button of this.shadowRoot.querySelectorAll("[data-index]")) {
      const config = configs[Number(button.dataset.index) || 0];
      button.textContent = config?.chart_mode === "state_timeline"
        ? this._customLocalize("state_history")
        : this._customLocalize("numeric_history");
    }
  }

  _customLocalize(key) {
    const language = this._hass?.locale?.language || this._hass?.language;
    return customLocalize(language, key);
  }
}

export class AdvancedHistorySgccCard extends AdvancedHistoryPanel {
  static getConfigElement() {
    return document.createElement("advanced-history-sgcc-card-editor");
  }

  constructor() {
    super();
    this._dashboardCardMode = true;
    this._datePickerAutoHide = false;
    this._dashboardConfig = null;
    this._dashboardPeriodState = null;
    this._panelTabsPersistenceSuppressed = true;
  }

  setConfig(config) {
    if (
      !config
      || Number(config.schema) !== ADVANCED_HISTORY_CARD_SCHEMA
      || !config.snapshot?.targets
      || !config.snapshot?.chart
    ) {
      throw new Error("Advanced History SGCC Card requires a valid panel snapshot");
    }
    this._dashboardPeriodState = null;
    this._dashboardConfig = clone(config);
    this._panel = {
      config: {
        ...(clone(config.settings) || {}),
        title: config.title || "",
      },
    };
    if (this._initialized) {
      this._applySnapshot(this._loadDashboardSnapshot(), false, true);
    } else if (this._hass && !this._loaded) {
      void this._initialize();
    }
  }

  set hass(value) {
    this._hass = value;
    for (const card of this._cards) this._setGraphCardHass(card, value);
    if (value && this._dashboardConfig && !this._loaded) void this._initialize();
  }

  get hass() { return this._hass; }

  getCardSize() {
    const graphRows = (this._graphCards || []).reduce((rows, card) => (
      rows + (typeof card.getCardSize === "function" ? Number(card.getCardSize()) || 0 : 0)
    ), 0);
    return graphRows ? graphRows + 2 : 9;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6, min_rows: 4 };
  }

  _dashboardStateStorageKey() {
    const id = String(this._dashboardConfig?.snapshot?.id || "").trim();
    return id ? `${DASHBOARD_CARD_STATE_STORAGE_PREFIX}:${id}` : "";
  }

  _loadDashboardSnapshot() {
    const snapshot = clone(this._dashboardConfig?.snapshot);
    const key = this._dashboardStateStorageKey();
    if (!key) return snapshot;
    try {
      const state = JSON.parse(localStorage.getItem(key) || "null");
      return applyDashboardRuntimeState(snapshot, state);
    } catch (error) {
      console.warn("Advanced History card: unable to restore dashboard state", error);
      return snapshot;
    }
  }

  _saveDashboardState(snapshot = null) {
    const key = this._dashboardStateStorageKey();
    if (!key || !this._initialized) return;
    try {
      const current = snapshot ? clone(snapshot) : this._captureSnapshot();
      localStorage.setItem(key, JSON.stringify(dashboardRuntimeState(current)));
    } catch (error) {
      console.warn("Advanced History card: unable to save dashboard state", error);
    }
  }

  async _initialize() {
    if (this._loaded || !this._hass || !this._dashboardConfig) return;
    this._loaded = true;
    await loadTranslations(this._hass?.locale?.language || this._hass?.language);
    this._loadingView();
    try {
      [this._areas, this._devices, this._entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
      ]);
    } catch (error) {
      console.warn("Advanced History card: registry lookup failed", error);
      this._entities = Object.keys(this._hass.states || {}).map((entity_id) => ({ entity_id }));
    }
    await Promise.all([
      this._loadEnergyTranslations(),
      this._ensureCardLoaded(),
    ]);
    this._initialized = true;
    this._applySnapshot(this._loadDashboardSnapshot(), false, true);
  }

  _loadingView() {
    const loading = this._localize("ui.common.loading", "Loading");
    this.shadowRoot.innerHTML = `<style>${cardStyles}</style><ha-card class="dashboard-card"><div class="start"><p>${this._escape(loading)}…</p></div></ha-card>`;
  }

  _render() {
    if (!this._dashboardConfig) return;
    this._releaseDashboardCardLayout();
    const title = String(this._dashboardConfig.title || "").trim();
    const cardOptions = this._activeSnapshot?.card_options || {};
    const hasGraphHeader = [
      cardOptions.card_header,
      cardOptions.numeric?.card_header,
      cardOptions.state?.card_header,
    ].some((header) => String(header || "").trim());
    const dependencyMissing = Boolean(this._cardLoadError);
    const hasY1Targets = Boolean(this._targetCount(this._targets));
    const hasY2Targets = Boolean(this._targetCount(this._y2Targets));
    const downloadData = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.download_data",
      "Download data",
    );
    this.shadowRoot.innerHTML = `
      <style>${cardStyles}</style>
      <ha-card class="dashboard-card">
        ${title && !hasGraphHeader ? `<div class="dashboard-card-title">${this._escape(title)}</div>` : ""}
        <div class="dashboard-card-content">
          ${dependencyMissing ? "" : `<div class="dashboard-axis-strip">
            <div class="dashboard-axis-group primary axis-target-primary">
              <span class="axis-badge">Y1</span><span>${this._escape(this._customLocalize("primary_axis"))}</span>
              <div class="axis-comparison-menu-shell">
                <button id="toggle-y1-comparison" class="axis-compare-toggle axis-compare-primary" type="button" ${hasY1Targets ? "" : "hidden"} aria-haspopup="menu" aria-expanded="false" aria-pressed="false"><ha-icon icon="mdi:compare-horizontal"></ha-icon></button>
                <ha-dropdown id="y1-comparison-menu" class="axis-comparison-menu" placement="bottom-start" distance="7"></ha-dropdown>
              </div>
              <button id="toggle-y1-running-total" class="axis-running-total-toggle axis-running-total-primary" type="button" ${hasY1Targets ? "" : "hidden"} role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
            </div>
            <div class="dashboard-date-controls">
              <div id="date-controller" class="energy-nav-card"></div>
              <button id="download-chart-data" class="dashboard-download-button" type="button" title="${this._escape(downloadData)}" aria-label="${this._escape(downloadData)}"><ha-icon icon="mdi:download"></ha-icon></button>
            </div>
            <div class="dashboard-axis-group secondary axis-target-secondary" ${hasY2Targets ? "" : "hidden"}>
              <button id="toggle-y2-running-total" class="axis-running-total-toggle axis-running-total-secondary" type="button" role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
              <button id="toggle-y2-comparison" class="axis-compare-toggle" type="button" aria-pressed="true"><ha-icon icon="mdi:compare-horizontal"></ha-icon></button>
              <span class="axis-badge">Y2</span><span>${this._escape(this._customLocalize("secondary_axis"))}</span>
            </div>
          </div>`}
          <section id="period-loading-banner" class="loading-banner" ${this._periodRestoreLoading ? "" : "hidden"}>
            <ha-circular-progress active size="small"></ha-circular-progress>
            <span id="period-loading-text">${this._escape(this._customLocalize("loading_requested_range"))}</span>
          </section>
          ${dependencyMissing ? "" : `<section id="compare-banner" class="compare-banner" hidden></section>`}
          <section id="detail-banner" class="detail-banner" hidden></section>
          ${this._notice ? `<div class="notice">${this._escape(this._notice)}</div>` : ""}
          <section id="charts" class="charts" ${this._periodRestoreLoading ? "hidden" : ""}></section>
        </div>
      </ha-card>`;
    this.shadowRoot.getElementById("toggle-y2-comparison")?.addEventListener(
      "click",
      () => this._toggleY2Comparison(),
    );
    this.shadowRoot.getElementById("toggle-y1-comparison")?.addEventListener(
      "click",
      (event) => this._toggleY1ComparisonMenu(event),
    );
    this.shadowRoot.getElementById("toggle-y1-comparison")?.addEventListener(
      "pointerdown",
      (event) => event.stopPropagation(),
    );
    this.shadowRoot.getElementById("toggle-y1-running-total")?.addEventListener(
      "click",
      () => this._toggleAxisRunningTotal("primary"),
    );
    this.shadowRoot.getElementById("toggle-y2-running-total")?.addEventListener(
      "click",
      () => this._toggleAxisRunningTotal("secondary"),
    );
    this.shadowRoot.getElementById("download-chart-data")?.addEventListener(
      "click",
      () => this._downloadChartData(),
    );
    this._syncY2ComparisonToggle();
    this._syncY1ComparisonToggle();
    this._syncRunningTotalAxisButtons();
    this._renderContent();
  }

  _saveTargets() {}
  _saveCurrentSnapshot() {}
  _persistPanelTabs() {}
  _recordChange(snapshot = null) { this._saveDashboardState(snapshot); }
  _scheduleExternalBookmarkRefresh() {}
}

if (!customElements.get("advanced-history-sgcc-card-editor")) {
  customElements.define(
    "advanced-history-sgcc-card-editor",
    AdvancedHistorySgccCardEditor,
  );
}

if (!customElements.get(ADVANCED_HISTORY_CARD_TAG)) {
  customElements.define(ADVANCED_HISTORY_CARD_TAG, AdvancedHistorySgccCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === ADVANCED_HISTORY_CARD_TAG)) {
  window.customCards.push({
    type: ADVANCED_HISTORY_CARD_TAG,
    name: "Advanced History SGCC Card",
    description: "An Advanced History panel chart with its date and time controls.",
    preview: true,
  });
}
