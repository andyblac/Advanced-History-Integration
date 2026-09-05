import { AdvancedHistoryPanel } from "./advanced-history-panel.js";
import {
  ADVANCED_HISTORY_CARD_SCHEMA,
  ADVANCED_HISTORY_CARD_TAG,
  CARD_TAG,
  DASHBOARD_SNAPSHOT_SGCC_KEYS,
  DASHBOARD_SNAPSHOT_SOURCE_KEYS,
  DASHBOARD_STORED_SGCC_OMIT_KEYS,
  DASHBOARD_SYNC_GROUP_KEYS,
} from "./constants.js";
import { cardConfigToSnapshot } from "./card-handoff.js";
import { ensureCardLoaded } from "./config-flow-defaults.js";
import { customLocalize, loadTranslations } from "./translations.js";
import { panelStyles } from "./styles.js";

const DASHBOARD_CARD_STATE_STORAGE_PREFIX = "advanced_history_dashboard_card_state_v1";
const DASHBOARD_PERIOD_GROUP_STORES = new Map();
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
  .dashboard-axis-group.primary { grid-column:1; grid-row:1; }
  .dashboard-axis-group.secondary { grid-column:3; grid-row:1; justify-content:flex-end; }
  .dashboard-date-controls {
    min-width:0; max-width:100%; display:flex; align-items:center;
    grid-column:2; grid-row:1; justify-self:center; gap:5px; width:max-content;
  }
  .dashboard-date-controls[hidden] { display:none; }
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
    .dashboard-axis-group.secondary { grid-column:2; }
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

export function cardConfigWithTitle(config, title) {
  const next = clone(config) || {};
  const value = String(title ?? "");
  if (value) next.title = value;
  else delete next.title;
  return next;
}

export function dashboardDatePickerVisible(config) {
  if (Object.prototype.hasOwnProperty.call(config || {}, "show_date_picker")) {
    return config.show_date_picker !== false;
  }
  const embedded = config?.sgcc_configs?.find((item) => (
    Object.prototype.hasOwnProperty.call(item || {}, "show_date_picker")
  ));
  if (embedded) return embedded.show_date_picker !== false;
  return true;
}

export function compactDashboardSgccConfig(config) {
  const next = clone(config) || {};
  for (const key of DASHBOARD_STORED_SGCC_OMIT_KEYS) delete next[key];
  if (next.card_background_color === "transparent") delete next.card_background_color;
  return next;
}

export function compactDashboardSnapshot(snapshot) {
  const next = clone(snapshot);
  if (!next) return next;
  delete next.schema;
  delete next.name;
  delete next.saved_at;
  delete next.targets;
  delete next.hidden_targets;
  delete next.y2_targets;
  delete next.hidden_y2_targets;
  for (const key of DASHBOARD_SNAPSHOT_SOURCE_KEYS) delete next[key];
  next.chart = clone(next.chart || {});
  delete next.chart.defaults_mode;
  for (const key of DASHBOARD_SNAPSHOT_SGCC_KEYS) delete next.chart[key];
  return next;
}

export function dashboardConfigWithDateNavigation(config, source = {}) {
  const next = clone(config) || {};
  const showDatePicker = Object.prototype.hasOwnProperty.call(source, "show_date_picker")
    ? source.show_date_picker !== false
    : dashboardDatePickerVisible(next);
  const datePickerGroup = Object.prototype.hasOwnProperty.call(source, "date_picker_group")
    ? String(source.date_picker_group || "").trim()
    : String(next.date_picker_group || "").trim();
  next.show_date_picker = showDatePicker;
  next.date_picker_group = datePickerGroup;
  next.sgcc_configs = (next.sgcc_configs || []).map(compactDashboardSgccConfig);
  next.snapshot = compactDashboardSnapshot(next.snapshot);
  return next;
}

function dashboardStateStorageKey(snapshot) {
  const id = String(snapshot?.id || "").trim();
  return id ? `${DASHBOARD_CARD_STATE_STORAGE_PREFIX}:${id}` : "";
}

function snapshotComparison(snapshot) {
  if (Object.prototype.hasOwnProperty.call(snapshot?.chart || {}, "compare")) {
    return clone(snapshot.chart.compare);
  }
  if (!snapshot?.period?.compare) return null;
  const choice = snapshot.period.compare_choice
    || (snapshot.period.compare === "yoy" ? "last_year" : "previous_period");
  const count = Math.max(
    1,
    Math.min(10, Math.trunc(Number(snapshot.period.compare_count)) || 1),
  );
  if (count === 1) return choice;
  return Array.from({ length: count }, (_, index) => ({
    period: choice,
    periods_back: index + 1,
  }));
}

function mergeComparisonStyle(active, configured) {
  const mergeOne = (activeRow, configuredRow) => {
    const style = configuredRow
      && typeof configuredRow === "object"
      && !Array.isArray(configuredRow)
      ? clone(configuredRow)
      : {};
    if (activeRow === true) return Object.keys(style).length ? style : true;
    if (activeRow && typeof activeRow === "object" && !Array.isArray(activeRow)) {
      return { ...style, ...clone(activeRow) };
    }
    return { ...style, period: activeRow };
  };
  if (Array.isArray(active)) {
    const configuredRows = Array.isArray(configured) ? configured : null;
    return active.map((row, index) => mergeOne(
      row,
      configuredRows
        ? configuredRows.length === 1 ? configuredRows[0] : configuredRows[index]
        : configured,
    ));
  }
  return mergeOne(active, Array.isArray(configured) ? configured[0] : configured);
}

function comparisonStyleOnly(value) {
  const clean = (row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return {};
    const style = clone(row);
    delete style.period;
    delete style.periods_back;
    return style;
  };
  return Array.isArray(value) ? value.map(clean) : clean(value);
}

function mergeComparisonDefaults(...sources) {
  let merged = {};
  for (const source of sources) {
    if (source === undefined) continue;
    const styles = comparisonStyleOnly(source);
    if (Array.isArray(styles)) {
      merged = styles.map((style, index) => ({
        ...(Array.isArray(merged)
          ? (merged.length === 1 ? merged[0] : merged[index])
          : merged),
        ...style,
      }));
    } else if (Array.isArray(merged)) {
      merged = merged.map((style) => ({ ...style, ...styles }));
    } else {
      merged = { ...merged, ...styles };
    }
  }
  return merged;
}

function typedOptions(value, variant = "numeric") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value.numeric || value.state
    ? value[variant] || {}
    : value;
}

function comparisonDefaults(row, snapshot, settings) {
  const configuredCard = {
    ...clone(typedOptions(settings?.card_options)),
    ...clone(typedOptions(snapshot?.chart?.card_options)),
  };
  const templates = [];
  for (const key of ["entities", "numeric_entities"]) {
    const values = Array.isArray(configuredCard[key])
      ? configuredCard[key]
      : configuredCard[key] ? [configuredCard[key]] : [];
    for (const value of values) {
      if (
        value
        && typeof value === "object"
        && !Array.isArray(value)
        && value.entity == null
        && value.statistic_id == null
      ) templates.push(value.compare);
    }
  }
  const entity = row.entity || row.statistic_id;
  const key = row.attribute ? `${entity}::${row.attribute}` : entity;
  const configuredEntities = settings?.entity_options || {};
  const snapshotEntities = snapshot?.chart?.entity_options || {};
  return mergeComparisonDefaults(
    row.compare,
    ...templates,
    configuredEntities[entity]?.compare,
    configuredEntities[key]?.compare,
    snapshotEntities[entity]?.compare,
    snapshotEntities[key]?.compare,
  );
}

export function sgccConfigsWithSnapshotComparisons(configs, snapshot, settings = {}) {
  const active = snapshotComparison(snapshot);
  const excludeSecondary = Boolean(snapshot?.chart?.exclude_y2_comparison);
  return clone(configs || []).map((config) => {
    if (!config || config.chart_mode === "state_timeline" || !Array.isArray(config.entities)) {
      return config;
    }
    config.entities = config.entities.map((raw) => {
      const row = typeof raw === "string" ? { entity: raw } : clone(raw);
      if (!row || typeof row !== "object") return raw;
      if (active == null || active === false || (excludeSecondary && row.y_axis === "secondary")) {
        delete row.compare;
      } else {
        row.compare = mergeComparisonStyle(
          active,
          comparisonDefaults(row, snapshot, settings),
        );
      }
      return row;
    });
    return config;
  });
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
  const configuredEntities = Array.isArray(config?.entities) && config.entities.length
    ? config.entities
    : [
      ...(snapshot?.targets?.entity_id || []),
      ...(snapshot?.hidden_targets?.entity_id || []),
      ...(snapshot?.y2_targets?.entity_id || []),
      ...(snapshot?.hidden_y2_targets?.entity_id || []),
    ];
  const entities = [...new Set(configuredEntities)].map((entity) => ({
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
    this._editorSectionObserver = null;
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
    this._editorSectionObserver?.disconnect();
    this._editorSectionObserver = null;
    this._editor = null;
    const storedConfigs = Array.isArray(this._config.sgcc_configs)
      ? this._config.sgcc_configs.filter(Boolean)
      : [];
    const baseConfigs = storedConfigs.length ? storedConfigs : fallbackSgccConfigs(this._config);
    let snapshot = snapshotFromSgccConfigs(
      this._config.snapshot,
      baseConfigs,
    );
    const stateKey = dashboardStateStorageKey(snapshot);
    if (stateKey) {
      try {
        snapshot = applyDashboardRuntimeState(
          snapshot,
          JSON.parse(localStorage.getItem(stateKey) || "null"),
        );
      } catch (error) {
        console.warn("Advanced History card editor: unable to restore dashboard state", error);
      }
    }
    const configs = sgccConfigsWithSnapshotComparisons(
      baseConfigs,
      snapshot,
      this._config.settings,
    ).map((config) => {
      const next = {
        ...config,
        show_date_picker: dashboardDatePickerVisible(this._config),
      };
      if (next.card_background_color == null || next.card_background_color === "") {
        next.card_background_color = "transparent";
      }
      const group = String(this._config.date_picker_group || "").trim();
      for (const key of DASHBOARD_SYNC_GROUP_KEYS) next[key] = group;
      return next;
    });
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
        nextConfigs[this._activeIndex] = compactDashboardSgccConfig(draft);
        const next = dashboardConfigWithDateNavigation({
          ...clone(this._config),
          sgcc_configs: nextConfigs,
          snapshot: snapshotFromSgccConfigs(this._config.snapshot, nextConfigs),
        }, {
          show_date_picker: dashboardDatePickerVisible(this._config),
          date_picker_group: this._config.date_picker_group,
        });
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
      await editor.updateComplete;
      if (token !== this._renderToken) return;
      const mountAdvancedHistoryPanel = () => {
        const editorRoot = editor.shadowRoot?.querySelector(".root");
        if (!editorRoot || editorRoot.querySelector('[data-panel="advanced-history"]')) return;
        const titleLabel = this._hass.localize?.(
          "ui.panel.lovelace.editor.card.generic.title",
        ) || "Title";
        const panel = document.createElement("div");
        panel.className = "panel open";
        panel.dataset.panel = "advanced-history";
        panel.innerHTML = `
          <div class="panel-header" data-toggle="advanced-history">
            <div class="panel-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></div>
            <span class="panel-title">Advanced History Card</span>
            <span class="panel-subtitle">Title and date navigation</span>
            <span class="panel-chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
          <div class="panel-body">
            <div class="fg">
              <div class="f"><label>${this._escape(titleLabel)}</label><input id="advanced_history_title" type="text" autocomplete="off" value="${this._escape(this._config.title || "")}"></div>
              <div class="advanced-history-navigation-row mt8">
                <label class="si advanced-history-date-toggle"><div class="st"><input id="advanced_history_show_date_picker" type="checkbox" ${dashboardDatePickerVisible(this._config) ? "checked" : ""}><span class="ss"></span></div><div class="sl"><span class="sn">Date Picker</span></div></label>
                <input id="advanced_history_date_picker_group" class="advanced-history-group-input" type="text" autocomplete="off" placeholder="Group" value="${this._escape(String(this._config.date_picker_group || "").trim())}">
              </div>
            </div>
          </div>`;
        editorRoot.prepend(panel);
        panel.querySelector(".panel-header")?.addEventListener("click", (event) => {
          event.stopPropagation();
          panel.classList.toggle("open");
        });
        const titleInput = panel.querySelector("#advanced_history_title");
        const showDatePickerInput = panel.querySelector("#advanced_history_show_date_picker");
        const datePickerGroupInput = panel.querySelector("#advanced_history_date_picker_group");
        titleInput?.addEventListener("input", (event) => {
          event.stopPropagation();
          const next = cardConfigWithTitle(this._config, titleInput.value);
          this._config = next;
          this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config: next }, bubbles: true, composed: true,
          }));
        });
        const updateDateNavigation = (event) => {
          event.stopPropagation();
          const next = dashboardConfigWithDateNavigation(this._config, {
            show_date_picker: showDatePickerInput.checked,
            date_picker_group: datePickerGroupInput.value,
          });
          this._config = next;
          this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config: next }, bubbles: true, composed: true,
          }));
        };
        showDatePickerInput?.addEventListener("change", updateDateNavigation);
        datePickerGroupInput?.addEventListener("input", updateDateNavigation);
      };
      const mountManagedStyles = () => {
        if (!editor.shadowRoot || editor.shadowRoot.querySelector("[data-advanced-history-comparisons]")) return;
        const managedStyles = document.createElement("style");
        managedStyles.dataset.advancedHistoryComparisons = "";
        managedStyles.textContent = `
          .advanced-history-navigation-row {
            width:100%; display:grid !important;
            grid-template-columns:140px minmax(0,1fr) !important;
            align-items:center; gap:8px;
          }
          .advanced-history-date-toggle {
            width:140px !important; min-width:0 !important; max-width:140px !important;
            box-sizing:border-box; white-space:nowrap;
          }
          .advanced-history-date-toggle .sl,
          .advanced-history-date-toggle .sn { min-width:0 !important; white-space:nowrap; }
          .advanced-history-group-input {
            width:100% !important; min-width:0 !important;
            box-sizing:border-box;
          }
          .cmp-add,
          .cmp-del,
          .cmp-row .f:has(.cmp-period),
          .cmp-row .f:has(.cmp-back),
          [data-mt="calendar"],
          [data-mtc="calendar"],
          .overlay-row:has(#energy_date_sync),
          .overlay-row:has(#show_interval_picker),
          .overlay-row:has(#show_date_picker) { display:none !important; }
        `;
        editor.shadowRoot.append(managedStyles);
      };
      const restoreManagedEditorContent = () => {
        if (token !== this._renderToken || this._editor !== editor) return;
        mountAdvancedHistoryPanel();
        mountManagedStyles();
      };
      restoreManagedEditorContent();
      if (typeof MutationObserver !== "undefined" && editor.shadowRoot) {
        this._editorSectionObserver = new MutationObserver(() => {
          queueMicrotask(restoreManagedEditorContent);
        });
        this._editorSectionObserver.observe(editor.shadowRoot, {
          childList: true,
          subtree: true,
        });
      }
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

  _escape(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
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
      || !config.snapshot?.chart
      || !Array.isArray(config.sgcc_configs)
      || !config.sgcc_configs.length
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

  _dashboardDatePickerGroup() {
    const wrapperGroup = typeof this._dashboardConfig?.date_picker_group === "string"
      ? this._dashboardConfig.date_picker_group.trim()
      : "";
    if (wrapperGroup) return wrapperGroup;
    const embedded = this._dashboardConfig?.sgcc_configs?.find((item) => (
      typeof item?.date_picker_group === "string" && item.date_picker_group.trim()
    ));
    const group = embedded?.date_picker_group;
    const configured = typeof group === "string" ? group.trim() : "";
    if (configured) return configured;
    const id = String(this._dashboardConfig?.snapshot?.id || "").trim();
    return id ? `advanced-history-${id}` : "advanced-history-dashboard";
  }

  _dashboardDatePickerVisible() {
    return dashboardDatePickerVisible(this._dashboardConfig);
  }

  _createDashboardPeriodStore() {
    const group = this._dashboardDatePickerGroup();
    if (!group) {
      this._dashboardPeriodStoreFollower = false;
      return super._createDashboardPeriodStore();
    }
    const existing = DASHBOARD_PERIOD_GROUP_STORES.get(group);
    if (existing) {
      this._dashboardPeriodStoreFollower = true;
      return existing;
    }
    const store = super._createDashboardPeriodStore();
    DASHBOARD_PERIOD_GROUP_STORES.set(group, store);
    this._dashboardPeriodStoreFollower = false;
    return store;
  }

  _dashboardStateStorageKey() {
    return dashboardStateStorageKey(this._dashboardConfig?.snapshot);
  }

  _syncDashboardSgccVisibilityFromCards() {
    const configs = clone(this._dashboardConfig?.sgcc_configs || []);
    let changed = false;
    for (let cardIndex = 0; cardIndex < configs.length; cardIndex += 1) {
      const card = this._graphCards?.[cardIndex];
      const rows = configs[cardIndex]?.entities;
      const root = card?.shadowRoot;
      if (!root || !Array.isArray(rows) || !Array.isArray(card?._entities)) continue;
      const detailed = [...root.querySelectorAll(".sgc-detail-legend-entity[data-id]")];
      const compact = [...root.querySelectorAll(".sgc-legend-item[data-id]")];
      const byId = new Map((detailed.length ? detailed : compact).map(
        (entry) => [entry.dataset.id, entry],
      ));
      const indexesBySeries = new Map();
      card._entities.forEach((row, index) => {
        if (!row || row._compareOf != null) return;
        const key = seriesKey(row);
        if (!key) return;
        const indexes = indexesBySeries.get(key) || [];
        indexes.push(index);
        indexesBySeries.set(key, indexes);
      });
      const usedBySeries = new Map();
      configs[cardIndex].entities = rows.map((raw) => {
        const row = typeof raw === "string" ? { entity: raw } : clone(raw);
        const key = seriesKey(row);
        const occurrence = usedBySeries.get(key) || 0;
        usedBySeries.set(key, occurrence + 1);
        const renderedIndex = indexesBySeries.get(key)?.[occurrence];
        const entityId = row?.entity || row?.statistic_id;
        const entry = renderedIndex == null || !entityId
          ? null
          : byId.get(`${entityId}__${renderedIndex}`);
        if (!entry) return raw;
        const enabled = !this._legendEntryHidden(entry);
        if (row.enabled !== enabled || typeof raw === "string") changed = true;
        row.enabled = enabled;
        return row;
      });
    }
    if (!changed) return;
    this._dashboardConfig.sgcc_configs = configs;
    this._dashboardConfig.snapshot = compactDashboardSnapshot(this._dashboardConfig.snapshot);
  }

  _loadDashboardSnapshot() {
    const storedConfigs = Array.isArray(this._dashboardConfig?.sgcc_configs)
      ? this._dashboardConfig.sgcc_configs.filter(Boolean)
      : [];
    const baseConfigs = storedConfigs.length
      ? storedConfigs
      : fallbackSgccConfigs(this._dashboardConfig);
    const snapshot = snapshotFromSgccConfigs(
      this._dashboardConfig?.snapshot,
      baseConfigs,
    );
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
    const showDatePicker = dashboardDatePickerVisible(this._dashboardConfig);
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
              <button id="toggle-y1-visibility" class="axis-badge axis-visibility-toggle" type="button" title="${this._escape(this._customLocalize("primary_axis"))}" aria-label="${this._escape(this._customLocalize("primary_axis"))}" aria-pressed="true">Y1</button><span>${this._escape(this._customLocalize("primary_axis"))}</span>
              <div class="axis-comparison-menu-shell">
                <button id="toggle-y1-comparison" class="axis-compare-toggle axis-compare-primary" type="button" ${hasY1Targets ? "" : "hidden"} aria-haspopup="menu" aria-expanded="false" aria-pressed="false"><ha-icon icon="mdi:compare-horizontal"></ha-icon></button>
                <ha-dropdown id="y1-comparison-menu" class="axis-comparison-menu" placement="bottom-start" distance="7"></ha-dropdown>
              </div>
              <button id="toggle-y1-running-total" class="axis-running-total-toggle axis-running-total-primary" type="button" ${hasY1Targets ? "" : "hidden"} role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
            </div>
            <div class="dashboard-date-controls" ${showDatePicker ? "" : "hidden"}>
              <div id="date-controller" class="energy-nav-card"></div>
              <button id="download-chart-data" class="dashboard-download-button" type="button" title="${this._escape(downloadData)}" aria-label="${this._escape(downloadData)}"><ha-icon icon="mdi:download"></ha-icon></button>
            </div>
            <div class="dashboard-axis-group secondary axis-target-secondary" ${hasY2Targets ? "" : "hidden"}>
              <button id="toggle-y2-running-total" class="axis-running-total-toggle axis-running-total-secondary" type="button" role="switch" aria-checked="false"><ha-icon icon="mdi:sigma"></ha-icon></button>
              <button id="toggle-y2-comparison" class="axis-compare-toggle" type="button" aria-pressed="true"><ha-icon icon="mdi:compare-horizontal"></ha-icon></button>
              <button id="toggle-y2-visibility" class="axis-badge axis-visibility-toggle" type="button" title="${this._escape(this._customLocalize("secondary_axis"))}" aria-label="${this._escape(this._customLocalize("secondary_axis"))}" aria-pressed="true">Y2</button><span>${this._escape(this._customLocalize("secondary_axis"))}</span>
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
    this.shadowRoot.getElementById("toggle-y1-visibility")?.addEventListener(
      "click",
      () => this._toggleAxisLegendVisibility("primary"),
    );
    this.shadowRoot.getElementById("toggle-y2-visibility")?.addEventListener(
      "click",
      () => this._toggleAxisLegendVisibility("secondary"),
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
