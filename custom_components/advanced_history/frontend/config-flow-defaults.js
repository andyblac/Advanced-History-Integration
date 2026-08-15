import { CARD_DEFAULT_MODULE_URLS, CARD_TAG } from "./constants.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { customLocalize, loadTranslations } from "./translations.js";

const INSTALLED_KEY = "__advancedHistoryConfigFlowDefaultsInstalled";
const INJECTED_KEY = "advancedHistoryDefaultsButton";
const NUMERIC_ENTITIES_KEY = "numeric_entities";
const STATE_ENTITIES_KEY = "state_entities";

function language(hass) {
  return hass?.locale?.language || hass?.language;
}

function localize(hass, key, fallback) {
  return hass?.localize?.(key) || fallback;
}

function custom(hass, key) {
  return customLocalize(language(hass), key);
}

function findObjectSelector(name, root = document) {
  const queue = [root];
  const visited = new Set();
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
        if (objectSelector) return objectSelector;
      }
      queue.push(child);
      if (child.shadowRoot) queue.push(child.shadowRoot);
    }
  }
  return null;
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
  const template = entityTemplate(defaults, profile === "panel" ? variant : null);
  const entity = sampleEntity(hass, profile === "panel" ? variant : "numeric");
  const entities = [{ ...template, entity }];
  const cleanDefaults = defaults && typeof defaults === "object" && !Array.isArray(defaults)
    ? structuredClone(defaults)
    : {};
  delete cleanDefaults[NUMERIC_ENTITIES_KEY];
  delete cleanDefaults[STATE_ENTITIES_KEY];
  const config = {
    ...cleanDefaults,
    type: `custom:${CARD_TAG}`,
    card_header: profile === "panel" ? (defaults?.card_header ?? "") : "",
    chart_mode: profile === "panel" && variant === "state"
      ? "state_timeline"
      : (defaults?.chart_mode || "timeline"),
    ...(profile === "more-info"
      ? (defaults?.hours_to_show !== undefined
        ? { hours_to_show: defaults.hours_to_show }
        : {})
      : { hours_to_show: 24 }),
    height: profile === "more-info" ? Number(defaults?.height) || 300 : 500,
    entities,
  };
  if (profile === "panel") {
    config.energy_date_sync = true;
    if (variant === "state") {
      config.auto_scale_points = false;
      config.group_by = "raw";
    }
  }
  return config;
}

export function defaultsFromEditor(config, profile = "panel") {
  const protectedKeys = new Set([
    "type", "energy_date_sync", "entities",
  ]);
  if (profile === "panel") {
    protectedKeys.add("hours_to_show");
    protectedKeys.add("height");
  } else {
    protectedKeys.add("card_header");
  }
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
    if (profile === "panel") delete template.compare;
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
    .f:has(.e-y_axis) { display: none !important; }
    ${variant === "state"
      ? `
        .f:has(#chart_mode),
        .f:has(#group_by),
        label:has(#auto_scale_points) { display: none !important; }
      `
      : ""}
  `;
}

function panelDefaultsFromEditor(current, draft, variant, dirtyKeys = []) {
  const defaults = current && typeof current === "object" && !Array.isArray(current)
    ? structuredClone(current)
    : {};
  const edited = defaultsFromEditor(draft, "panel");
  for (const key of dirtyKeys) {
    if (["type", "energy_date_sync", "hours_to_show", "height"].includes(key)) continue;
    if (variant === "state" && ["chart_mode", "group_by", "auto_scale_points"].includes(key)) {
      continue;
    }
    if (key === "entities") {
      const typedKey = variant === "state" ? STATE_ENTITIES_KEY : NUMERIC_ENTITIES_KEY;
      if (edited.entities !== undefined) defaults[typedKey] = structuredClone(edited.entities);
      else delete defaults[typedKey];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(edited, key)) {
      defaults[key] = structuredClone(edited[key]);
    } else {
      delete defaults[key];
    }
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
  const title = custom(hass, isMoreInfo ? "more_info_card_defaults" : "card_defaults");
  const currentDefaults = selector.value || {};
  const initialConfig = editorConfig(hass, currentDefaults, profile, variant);
  await openCardEditorDialog({
    hass,
    container: selector,
    initialConfig,
    title: isMoreInfo ? title : custom(hass, variant === "state" ? "state_chart_options" : "numeric_chart_options"),
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
      loadError: custom(hass, "graph_editor_load_error"),
    },
    allowCode: true,
    editorVariants: isMoreInfo
      ? null
      : [{ key: variant, label: "", initialConfig, visualEditorStyles: panelEditorStyles(variant) }],
    visualEditorStyles: isMoreInfo
      ? `
        #add-entity,
        .edb[data-action="delete"],
        .edup[data-action="duplicate"] { display: none !important; }
      `
      : panelEditorStyles(variant),
    ensureLoaded: () => ensureCardLoaded(hass),
    onSave: (draft, variantState) => {
      updateObjectSelector(
        selector,
        isMoreInfo
          ? defaultsFromEditor(draft, profile)
          : panelDefaultsFromEditor(
            currentDefaults,
            draft,
            variant,
            variantState?.dirtyKeys?.[variant],
          ),
      );
    },
  });
}

function injectButton(selector, profile) {
  if (!selector?.shadowRoot) return false;
  const className = profile === "more-info"
    ? "advanced-history-more-info-defaults-button"
    : "advanced-history-defaults-button";
  if (selector.shadowRoot.querySelector(`.${className}`)) return true;
  const isMoreInfo = profile === "more-info";
  if (!isMoreInfo) {
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
    for (const variant of ["numeric", "state"]) {
      const section = document.createElement("div");
      section.className = "advanced-history-defaults-section";
      const heading = document.createElement("strong");
      heading.textContent = custom(selector.hass, variant === "state" ? "state_chart_options" : "numeric_chart_options");
      const launch = document.createElement("button");
      launch.type = "button";
      launch.innerHTML = `<ha-icon icon="mdi:tune-variant"></ha-icon><span>${custom(selector.hass, "open_card_defaults_editor")}</span>`;
      launch.style.cssText = "padding:0 16px;height:40px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--primary-color);border-radius:20px;color:var(--primary-color);background:transparent;cursor:pointer;font:inherit;font-weight:500";
      launch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDefaultsEditor(selector, profile, variant);
      });
      section.append(heading, launch);
      sections.append(section);
    }
    selector.shadowRoot.append(style, sections);
    return true;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.dataset[INJECTED_KEY] = "true";
  button.className = className;
  button.innerHTML = `<ha-icon icon="mdi:tune-variant"></ha-icon><span>${custom(selector.hass, "open_card_defaults_editor")}</span>`;
  button.style.cssText = "margin:12px 0 0;padding:0 16px;height:40px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--primary-color);border-radius:20px;color:var(--primary-color);background:transparent;cursor:pointer;font:inherit;font-weight:500";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDefaultsEditor(selector, profile);
  });
  selector.shadowRoot.append(button);
  return true;
}

function injectButtons() {
  if (!location.pathname.startsWith("/config/integrations")) return false;
  const panelSelector = findObjectSelector("card_options");
  const moreInfoSelector = findObjectSelector("more_info_card_options");
  if (panelSelector) injectButton(panelSelector, "panel");
  if (moreInfoSelector) injectButton(moreInfoSelector, "more-info");
  return Boolean(panelSelector || moreInfoSelector);
}

function scanForConfigFlow() {
  if (scanForConfigFlow.timer) window.clearInterval(scanForConfigFlow.timer);
  let attempts = 0;
  scanForConfigFlow.timer = window.setInterval(() => {
    attempts += 1;
    if (injectButtons() || attempts >= 30) {
      window.clearInterval(scanForConfigFlow.timer);
      scanForConfigFlow.timer = null;
    }
  }, 300);
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
