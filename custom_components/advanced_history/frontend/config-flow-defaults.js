import { CARD_DEFAULT_MODULE_URLS, CARD_TAG } from "./constants.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { customLocalize } from "./translations.js";

const INSTALLED_KEY = "__advancedHistoryConfigFlowDefaultsInstalled";
const INJECTED_KEY = "advancedHistoryDefaultsButton";

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

function entityTemplates(defaults) {
  const configured = defaults?.entities;
  const rows = Array.isArray(configured) ? configured : configured ? [configured] : [];
  return rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

function sampleEntities(hass, count) {
  const numeric = Object.entries(hass?.states || {})
    .filter(([, state]) => state?.state !== "" && Number.isFinite(Number(state?.state)))
    .map(([entityId]) => entityId);
  return numeric.slice(0, Math.max(1, count));
}

export function editorConfig(hass, defaults, profile = "panel") {
  const templates = entityTemplates(defaults);
  const samples = sampleEntities(hass, templates.length || 1);
  const entities = samples.map((entity, index) => ({
    ...(templates[index] || templates[0] || {}),
    entity,
  }));
  const config = {
    ...(defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {}),
    type: `custom:${CARD_TAG}`,
    card_header: custom(hass, "numeric_history"),
    chart_mode: "timeline",
    hours_to_show: profile === "more-info" ? Number(defaults?.hours_to_show) || 24 : 24,
    height: profile === "more-info" ? Number(defaults?.height) || 300 : 500,
    entities,
  };
  if (profile === "panel") config.energy_date_sync = true;
  return config;
}

export function defaultsFromEditor(config, profile = "panel") {
  const protectedKeys = new Set([
    "type", "card_header", "chart_mode", "energy_date_sync", "entities",
  ]);
  if (profile === "panel") {
    protectedKeys.add("hours_to_show");
    protectedKeys.add("height");
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
    delete template.compare;
    if (Object.keys(template).length) templates.push(template);
  }
  if (templates.length === 1) defaults.entities = templates[0];
  else if (templates.length > 1) defaults.entities = templates;
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

async function openDefaultsEditor(selector, profile) {
  const hass = selector.hass;
  const isMoreInfo = profile === "more-info";
  const title = custom(hass, isMoreInfo ? "more_info_card_defaults" : "card_defaults");
  await openCardEditorDialog({
    hass,
    initialConfig: editorConfig(hass, selector.value || {}, profile),
    title,
    note: custom(
      hass,
      isMoreInfo
        ? "more_info_card_defaults_config_flow_note"
        : "card_defaults_config_flow_note",
    ),
    labels: {
      loading: localize(hass, "ui.common.loading", "Loading"),
      cancel: localize(hass, "ui.common.cancel", "Cancel"),
      save: localize(hass, "ui.common.save", "Save"),
      loadError: custom(hass, "graph_editor_load_error"),
    },
    allowCode: false,
    ensureLoaded: () => ensureCardLoaded(hass),
    onSave: (draft) => {
      updateObjectSelector(selector, defaultsFromEditor(draft, profile));
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
