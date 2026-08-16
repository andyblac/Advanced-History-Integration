import { CARD_DEFAULT_MODULE_URLS, CARD_TAG } from "./constants.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { customLocalize, loadTranslations } from "./translations.js";

const INSTALLED_KEY = "__advancedHistoryConfigFlowDefaultsInstalled";
const INJECTED_KEY = "advancedHistoryDefaultsButton";
const NUMERIC_ENTITIES_KEY = "numeric_entities";
const STATE_ENTITIES_KEY = "state_entities";
const PANEL_MANAGED_EDITOR_KEYS = new Set([
  "energy_date_sync", "energy_collection_key",
  "hours_to_show",
  "show_date_picker", "date_picker_position", "date_picker_nav_position",
  "date_picker_shortcuts_position", "date_picker_group", "date_picker_modes",
  "date_picker_default_mode", "date_picker_step",
  "show_interval_picker", "interval_picker_position", "interval_picker_group",
  "interval_options",
  "show_attribute_list", "attribute_list_position",
  "show_y2_axis",
]);
const STATE_MANAGED_EDITOR_KEYS = new Set([
  "show_pph_picker", "pph_picker_position", "pph_picker_group",
  "show_group_by_picker", "group_by_picker_position", "group_by_picker_group",
  "points_per_hour", "group_by", "auto_scale_points", "height",
]);
const NUMERIC_MANAGED_EDITOR_KEYS = new Set([
  "state_timeline_corner_radius", "state_timeline_label_font_size",
]);
const MORE_INFO_MANAGED_EDITOR_KEYS = new Set([
  "energy_date_sync", "energy_collection_key",
  "show_date_picker", "show_interval_picker",
  "show_attribute_list", "show_y2_axis",
]);
const PANEL_COMMON_DEFAULTS = {
  include_area_names: true,
  include_attribute_name: true,
  show_full_period: true,
  show_tooltip: true,
  zoom_sync: true,
  zoom_sync_group: "advanced-history-panel",
  tooltip_sync: true,
  tooltip_sync_group: "advanced-history-panel",
  entities: { show_in_legend: true },
};
const MORE_INFO_COMMON_DEFAULTS = {
  card_background_color: "transparent",
  card_border: false,
  card_padding: 0,
  card_shadow: false,
  date_picker_default_mode: "last_24h",
  date_picker_modes: ["day", "week", "month", "year", "last_24h"],
  include_attribute_name: true,
  interval_picker_position: "right",
  show_date_picker: true,
  show_legend: false,
  show_now_line: false,
  show_tooltip: true,
  x_axis_color: "var(--primary-text-color)",
  x_axis_date_color: "var(--primary-text-color)",
  x_axis_font_size: 12,
  x_grid_color: "var(--divider-color)",
  x_grid_opacity: 1,
  x_grid_style: "solid",
  y_axis_color: "var(--primary-text-color)",
  y_axis_font_size: 12,
  y_grid_color: "var(--divider-color)",
  y_grid_opacity: 1,
  y_grid_style: "solid",
  entities: {
    line_width: 1.5,
    show_extrema: "never",
    show_fill: true,
    show_points: false,
    show_state: false,
    smooth: true,
  },
};

function integrationDefaults(profile, variant) {
  const defaults = profile === "more-info"
    ? MORE_INFO_COMMON_DEFAULTS
    : PANEL_COMMON_DEFAULTS;
  return {
    ...structuredClone(defaults),
    ...(variant === "numeric"
      ? profile === "more-info"
        ? { auto_scale_points: true, height: 240 }
        : { height: "auto" }
      : {}),
    ...(variant === "state"
      ? {
          state_timeline_label_font_size: 14,
          ...(profile === "more-info"
            ? { state_timeline_corner_radius: 0 }
            : {}),
        }
      : {}),
  };
}

function language(hass) {
  return hass?.locale?.language || hass?.language;
}

function localize(hass, key, fallback) {
  return hass?.localize?.(key) || fallback;
}

function custom(hass, key) {
  return customLocalize(language(hass), key);
}

function findObjectSelectors(name, root = document) {
  const queue = [root];
  const visited = new Set();
  const matches = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const children = current instanceof Document || current instanceof ShadowRoot
      ? current.children || current.querySelectorAll(":scope > *")
      : current.children;
    for (const child of children || []) {
      if (
        child.localName === "ha-selector" &&
        (child.schema?.name === name || child.name === name)
      ) {
        const objectSelector = child.shadowRoot?.querySelector("ha-selector-object");
        if (objectSelector) matches.push(objectSelector);
      }
      queue.push(child);
      if (child.shadowRoot) queue.push(child.shadowRoot);
    }
  }
  return matches;
}

function selectorProfile(selector) {
  let current = selector;
  while (current) {
    const root = current.getRootNode?.();
    if (!root) break;
    if ([...(root.querySelectorAll?.("ha-selector") || [])].some(
      (field) => field.schema?.name === "replace_more_info_history",
    )) return "more-info";
    current = root.host;
  }
  return "panel";
}

export async function ensureCardLoaded(hass, configuredModuleUrl = "") {
  await loadTranslations(language(hass));
  if (customElements.get(CARD_TAG)) return;
  const configured = configuredModuleUrl
    || hass?.panels?.["advanced-history"]?.config?.card_module_url;
  const candidates = configured ? [configured] : CARD_DEFAULT_MODULE_URLS;
  for (const url of candidates) {
    try {
      await import(/* @vite-ignore */ url);
      if (customElements.get(CARD_TAG)) return;
    } catch (error) {
      console.debug(`Advanced History: unable to import ${url} for Card Defaults`, error);
    }
  }
  throw new Error(custom(hass, "card_load_error"));
}

function entityTemplates(configured) {
  const rows = Array.isArray(configured) ? configured : configured ? [configured] : [];
  return rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

function panelComparisonDefaults(configured) {
  const wasArray = Array.isArray(configured);
  const rows = (wasArray ? configured : [configured])
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const clean = structuredClone(row);
      delete clean.period;
      delete clean.periods_back;
      return clean;
    })
    .filter((row) => Object.keys(row).length);
  if (!rows.length) return undefined;
  return wasArray ? rows : rows[0];
}

function entityTemplate(defaults, variant = null) {
  const shared = entityTemplates(defaults?.entities)[0] || {};
  if (!variant) return structuredClone(shared);
  const key = variant === "state" ? STATE_ENTITIES_KEY : NUMERIC_ENTITIES_KEY;
  const typed = entityTemplates(defaults?.[key])[0] || {};
  return { ...structuredClone(shared), ...structuredClone(typed) };
}

function sampleEntity(hass, variant = "numeric") {
  const candidates = Object.entries(hass?.states || {}).filter(([, state]) => {
    const value = state?.state;
    return value !== "" && value !== "unknown" && value !== "unavailable";
  });
  const match = candidates.find(([, state]) => (
    variant === "state"
      ? !Number.isFinite(Number(state.state))
      : Number.isFinite(Number(state.state))
  ));
  return match?.[0] || candidates[0]?.[0] || "sensor.example";
}

export function editorConfig(hass, defaults, profile = "panel", variant = "numeric") {
  const template = entityTemplate(defaults, variant);
  const entity = sampleEntity(hass, variant);
  const entities = [{ ...template, entity }];
  const cleanDefaults = defaults && typeof defaults === "object" && !Array.isArray(defaults)
    ? structuredClone(defaults)
    : {};
  delete cleanDefaults[NUMERIC_ENTITIES_KEY];
  delete cleanDefaults[STATE_ENTITIES_KEY];
  if (profile === "more-info") {
    delete cleanDefaults.energy_date_sync;
    delete cleanDefaults.energy_collection_key;
  }
  const config = {
    ...cleanDefaults,
    type: `custom:${CARD_TAG}`,
    card_header: profile === "panel" ? (defaults?.card_header ?? "") : "",
    chart_mode: variant === "state"
      ? "state_timeline"
      : (defaults?.chart_mode || "timeline"),
    ...(profile === "more-info"
      ? (defaults?.hours_to_show !== undefined
        ? { hours_to_show: defaults.hours_to_show }
        : {})
      : { hours_to_show: 24 }),
    height: variant === "numeric"
      ? (defaults?.height ?? (profile === "more-info" ? 240 : "auto"))
      : "auto",
    entities,
  };
  if (profile === "panel") {
    config.energy_date_sync = true;
  }
  if (variant === "state") {
    config.auto_scale_points = false;
    config.group_by = "raw";
  }
  return config;
}

export function defaultsFromEditor(config, profile = "panel", variant = "numeric") {
  const protectedKeys = new Set([
    "type", "energy_date_sync", "entities",
  ]);
  if (profile === "panel") {
    protectedKeys.add("hours_to_show");
  } else {
    protectedKeys.add("card_header");
  }
  if (variant === "state") protectedKeys.add("height");
  const defaults = {};
  for (const [key, value] of Object.entries(config || {})) {
    if (!protectedKeys.has(key) && value !== undefined) defaults[key] = structuredClone(value);
  }
  const templates = [];
  for (const raw of config?.entities || []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const template = structuredClone(raw);
    delete template.entity;
    delete template.statistic_id;
    delete template.attribute;
    delete template.enabled;
    delete template.y_axis;
    if (profile === "panel" && template.compare !== undefined) {
      const compare = panelComparisonDefaults(template.compare);
      if (compare === undefined) delete template.compare;
      else template.compare = compare;
    }
    if (Object.keys(template).length) templates.push(template);
    break;
  }
  if (templates.length === 1) defaults.entities = templates[0];
  else if (templates.length > 1) defaults.entities = templates;
  return defaults;
}

function panelEditorStyles(variant) {
  return `
    #add-entity,
    .edb[data-action="delete"],
    .edup[data-action="duplicate"],
    .f:has(.e-entity),
    .f:has(.e-statistic_id),
    .f:has(.e-attribute),
    .f:has(.e-enabled),
    .f:has(.e-y_axis),
    .overlay-row:has(#energy_date_sync),
    .overlay-row:has(#show_date_picker),
    .f:has(#hours_to_show),
    label:has(#show_y2_axis),
    .overlay-row:has(#show_interval_picker),
    .overlay-row:has(#show_attribute_list) { display: none !important; }
    ${variant === "numeric"
      ? `.f:has(#state_timeline_label_font_size) { display: none !important; }`
      : ""}
    ${variant === "state"
      ? `
        .f:has(#chart_mode),
        .f:has(#height),
        .f:has(#group_by),
        .f:has(#points_per_hour),
        .overlay-row:has(#show_pph_picker),
        .overlay-row:has(#show_group_by_picker) { display: none !important; }
      `
      : ""}
  `;
}

export function moreInfoEditorStyles(variant) {
  return `
    #add-entity,
    .edb[data-action="delete"],
    .edup[data-action="duplicate"],
    .f:has(.e-entity),
    .f:has(.e-statistic_id),
    .f:has(.e-attribute),
    .f:has(.e-enabled),
    .f:has(.e-y_axis),
    .f:has(#card_header),
    .overlay-row:has(#energy_date_sync),
    .overlay-row:has(#show_date_picker),
    .overlay-row:has(#show_interval_picker),
    .overlay-row:has(#show_attribute_list),
    label:has(#show_y2_axis) { display: none !important; }
    ${variant === "numeric"
      ? `
        .f:has(#state_timeline_corner_radius),
        .f:has(#state_timeline_label_font_size) { display: none !important; }
      `
      : ""}
    ${variant === "state"
      ? `
        .f:has(#chart_mode),
        .f:has(#height),
        .f:has(#group_by),
        label:has(#auto_scale_points),
        .f:has(#points_per_hour),
        .overlay-row:has(#show_pph_picker),
        .overlay-row:has(#show_group_by_picker) { display: none !important; }
      `
      : ""}
  `;
}

function separateDefaultsFromEditor(draft, profile, variant) {
  const defaults = defaultsFromEditor(draft, profile, variant);
  const managed = profile === "more-info"
    ? MORE_INFO_MANAGED_EDITOR_KEYS
    : PANEL_MANAGED_EDITOR_KEYS;
  for (const key of managed) delete defaults[key];
  if (profile === "more-info") delete defaults.card_header;
  // The native editor adds these empty presentation values to a runnable
  // preview even when the user has not configured them. Do not persist that
  // generated scaffolding as service defaults.
  if (defaults.card_header === "") delete defaults.card_header;
  if (Array.isArray(defaults.annotations) && !defaults.annotations.length) {
    delete defaults.annotations;
  }
  if (variant === "state") {
    delete defaults.chart_mode;
    for (const key of STATE_MANAGED_EDITOR_KEYS) delete defaults[key];
  } else {
    if (defaults.chart_mode === "timeline") delete defaults.chart_mode;
    for (const key of NUMERIC_MANAGED_EDITOR_KEYS) delete defaults[key];
  }
  return defaults;
}

export function updateObjectSelector(selector, value) {
  const field = selector.getRootNode?.().host;
  const eventTarget = field?.localName === "ha-selector" ? field : selector;
  const refreshYaml = () => {
    const currentSelector = eventTarget.shadowRoot?.querySelector("ha-selector-object") || selector;
    currentSelector.value = value;
    currentSelector.requestUpdate?.();
    currentSelector.shadowRoot?.querySelector("ha-yaml-editor")?.setValue?.(value);
  };
  refreshYaml();
  eventTarget.value = value;
  eventTarget.requestUpdate?.();
  eventTarget.dispatchEvent(new CustomEvent("value-changed", {
    detail: { value },
    bubbles: true,
    composed: true,
  }));
  // Home Assistant updates ha-form and ha-selector asynchronously. Refresh
  // after those Lit renders as well so the YAML draft is immediately visible.
  queueMicrotask(refreshYaml);
  requestAnimationFrame(() => requestAnimationFrame(refreshYaml));
}

async function openDefaultsEditor(selector, profile, variant = "numeric") {
  const hass = selector.hass;
  const isMoreInfo = profile === "more-info";
  const variantLabel = custom(
    hass,
    variant === "state" ? "state_chart_options" : "numeric_chart_options",
  );
  const title = `${custom(
    hass,
    isMoreInfo ? "more_info_card_defaults" : "card_defaults",
  )} · ${variantLabel}`;
  const currentDefaults = selector.value || {};
  const resetDefaults = integrationDefaults(profile, variant);
  const initialConfig = editorConfig(hass, currentDefaults, profile, variant);
  const variantKeys = [variant];
  const editorVariants = variantKeys.map((key) => ({
      key,
      label: custom(hass, key === "state" ? "state_chart_options" : "numeric_chart_options"),
      initialConfig: editorConfig(hass, currentDefaults, profile, key),
      visualEditorStyles: isMoreInfo
        ? moreInfoEditorStyles(key)
        : panelEditorStyles(key),
    }));
  await openCardEditorDialog({
    hass,
    container: selector,
    initialConfig,
    title,
    note: custom(
      hass,
      isMoreInfo
        ? "more_info_card_defaults_config_flow_note"
        : "chart_options_config_flow_note",
    ),
    labels: {
      loading: localize(hass, "ui.common.loading", "Loading"),
      cancel: localize(hass, "ui.common.cancel", "Cancel"),
      save: localize(hass, "ui.common.save", "Save"),
      reset: localize(hass, "ui.common.reset", "Reset"),
      confirmResetTitle: `${localize(hass, "ui.common.reset", "Reset")} ${variantLabel}?`,
      confirmReset: "This removes every saved override in this chart-default configuration and restores the integration defaults.",
      loadError: custom(hass, "graph_editor_load_error"),
    },
    allowCode: true,
    editorVariants,
    initialVariantKey: variant,
    visualEditorStyles: isMoreInfo
      ? moreInfoEditorStyles(variant)
      : panelEditorStyles(variant),
    codeConfigFromDraft: (draft) => separateDefaultsFromEditor(
      draft,
      profile,
      variant,
    ),
    draftFromCodeConfig: (configured) => editorConfig(
      hass,
      configured,
      profile,
      variant,
    ),
    ensureLoaded: () => ensureCardLoaded(hass),
    onReset: () => updateObjectSelector(selector, structuredClone(resetDefaults)),
    onSave: (draft, variantState) => {
      updateObjectSelector(
        selector,
        separateDefaultsFromEditor(
          variantState?.drafts?.[variant] || draft,
          profile,
          variant,
        ),
      );
    },
  });
}

function injectButton(selector, profile, variant) {
  if (!selector?.shadowRoot) return false;
  const className = profile === "more-info"
    ? "advanced-history-more-info-defaults-button"
    : "advanced-history-defaults-button";
  if (selector.shadowRoot.querySelector(`.${className}`)) return false;
  const isMoreInfo = profile === "more-info";
  const style = document.createElement("style");
  style.textContent = `
    ha-yaml-editor { display:none !important; }
    .advanced-history-defaults-sections { display:grid; gap:12px; margin-top:4px; }
    .advanced-history-defaults-section { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 16px; border:1px solid var(--divider-color); border-radius:12px; }
    .advanced-history-defaults-section strong { font-size:16px; font-weight:500; }
    .advanced-history-defaults-section button { margin:0; flex:none; }
  `;
  const sections = document.createElement("div");
  sections.className = `advanced-history-defaults-sections ${className}`;
  const section = document.createElement("div");
  section.className = "advanced-history-defaults-section";
  const launch = document.createElement("button");
  launch.type = "button";
  launch.dataset[INJECTED_KEY] = "true";
  launch.innerHTML = `<ha-icon icon="mdi:tune-variant"></ha-icon><span>${custom(selector.hass, "open_card_defaults_editor")}</span>`;
  launch.style.cssText = "padding:0 16px;height:40px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--primary-color);border-radius:20px;color:var(--primary-color);background:transparent;cursor:pointer;font:inherit;font-weight:500";
  launch.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDefaultsEditor(selector, profile, variant);
  });
  section.append(launch);
  sections.append(section);
  selector.shadowRoot.append(style, sections);
  return true;
}

function injectButtons() {
  if (!location.pathname.startsWith("/config/integrations")) {
    return { found: 0, injected: 0 };
  }
  const numericSelectors = findObjectSelectors("numeric_card_options");
  const stateSelectors = findObjectSelectors("state_card_options");
  let injected = 0;
  let visible = 0;
  for (const selector of numericSelectors) {
    const profile = selectorProfile(selector);
    if (injectButton(selector, profile, "numeric")) injected += 1;
    const className = profile === "more-info"
      ? ".advanced-history-more-info-defaults-button"
      : ".advanced-history-defaults-button";
    if (
      selector.getClientRects().length
      && selector.shadowRoot?.querySelector(className)
    ) visible += 1;
  }
  for (const selector of stateSelectors) {
    const profile = selectorProfile(selector);
    if (injectButton(selector, profile, "state")) injected += 1;
    const className = profile === "more-info"
      ? ".advanced-history-more-info-defaults-button"
      : ".advanced-history-defaults-button";
    if (
      selector.getClientRects().length
      && selector.shadowRoot?.querySelector(className)
    ) visible += 1;
  }
  return {
    found: numericSelectors.length + stateSelectors.length,
    injected,
    visible,
  };
}

function scanForConfigFlow() {
  if (scanForConfigFlow.frame) window.cancelAnimationFrame(scanForConfigFlow.frame);
  let attempts = 0;
  const scan = () => {
    attempts += 1;
    const result = injectButtons();
    if (result.injected || result.visible || attempts >= 600) {
      scanForConfigFlow.frame = null;
      return;
    }
    scanForConfigFlow.frame = window.requestAnimationFrame(scan);
  };
  // Run once synchronously. When called from the capturing click listener, the
  // next animation-frame attempt runs after HA has created the config-flow
  // dialog but before the browser paints its native YAML editor.
  scan();
}

export function installConfigFlowDefaultsEditor() {
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;
  scanForConfigFlow();
  window.addEventListener("location-changed", scanForConfigFlow);
  window.addEventListener("popstate", scanForConfigFlow);
  document.addEventListener("click", () => {
    if (location.pathname.startsWith("/config/integrations")) scanForConfigFlow();
  }, true);
}
