import { CARD_TAG } from "./constants.js";
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

function findCardDefaultsSelector(root = document) {
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
        (child.schema?.name === "card_options" || child.name === "card_options")
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

async function ensureCardLoaded(hass) {
  if (customElements.get(CARD_TAG)) return;
  const configured = hass?.panels?.["advanced-history"]?.config?.card_module_url;
  const candidates = configured ? [configured] : [
    "/hacsfiles/Statistics-Graph-Chart-Card/statistics-graph-chart-card.js",
    "/hacsfiles/statistics-graph-chart-card/statistics-graph-chart-card.js",
  ];
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

export function editorConfig(hass, defaults) {
  const templates = entityTemplates(defaults);
  const samples = sampleEntities(hass, templates.length || 1);
  const entities = samples.map((entity, index) => ({
    ...(templates[index] || templates[0] || {}),
    entity,
  }));
  return {
    ...(defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {}),
    type: `custom:${CARD_TAG}`,
    card_header: custom(hass, "numeric_history"),
    chart_mode: "timeline",
    hours_to_show: 24,
    height: 500,
    entities,
    energy_date_sync: true,
  };
}

export function defaultsFromEditor(config) {
  const protectedKeys = new Set([
    "type", "card_header", "chart_mode", "hours_to_show", "height", "energy_date_sync", "entities",
  ]);
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

async function openDefaultsEditor(selector) {
  if (document.querySelector("advanced-history-defaults-dialog")) return;
  const hass = selector.hass;
  const dialog = document.createElement("advanced-history-defaults-dialog");
  document.body.append(dialog);
  const root = dialog.attachShadow({ mode: "open" });
  const title = custom(hass, "card_defaults");
  root.innerHTML = `
    <style>
      :host { display:contents; color:var(--primary-text-color); }
      * { box-sizing:border-box; }
      dialog { width:min(1040px,calc(100vw - 40px)); height:min(820px,92vh); max-width:none; max-height:none; margin:auto; padding:0; overflow:hidden; border:0; border-radius:12px; color:var(--primary-text-color); background:var(--card-background-color); box-shadow:0 12px 36px rgba(0,0,0,.4); }
      dialog::backdrop { background:rgba(0,0,0,.56); }
      section { width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; }
      header { min-height:64px; padding:0 24px; display:flex; align-items:center; border-bottom:1px solid var(--divider-color); }
      h2 { margin:0; font-size:20px; font-weight:500; }
      .note { margin:14px 18px 8px; padding:10px 12px; border-radius:8px; color:var(--secondary-text-color); background:var(--secondary-background-color); line-height:1.4; }
      .host { flex:1; min-height:0; overflow:auto; padding:8px 18px 18px; }
      .host > * { display:block; width:100%; }
      footer { min-height:64px; padding:10px 18px; display:flex; align-items:center; justify-content:flex-end; gap:8px; border-top:1px solid var(--divider-color); }
      .status { margin-right:auto; color:var(--error-color); font-size:13px; }
      button { min-width:84px; height:40px; padding:0 14px; border:0; border-radius:8px; cursor:pointer; color:var(--primary-color); background:transparent; font:inherit; font-weight:500; }
      button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
      button:disabled { opacity:.5; cursor:default; }
      @media (max-width:600px) { dialog { width:100vw; height:100vh; border-radius:0; } }
    </style>
    <dialog aria-label="${title}">
      <section>
        <header><h2>${title}</h2></header>
        <div class="note">${custom(hass, "card_defaults_config_flow_note")}</div>
        <div class="host">${localize(hass, "ui.common.loading", "Loading")}…</div>
        <footer><span class="status"></span><button data-action="cancel">${localize(hass, "ui.common.cancel", "Cancel")}</button><button class="primary" data-action="save">${localize(hass, "ui.common.save", "Save")}</button></footer>
      </section>
    </dialog>`;
  const modal = root.querySelector("dialog");
  const close = () => {
    if (modal.open) modal.close();
    dialog.remove();
  };
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  root.querySelector('[data-action="cancel"]').addEventListener("click", close);
  const save = root.querySelector('[data-action="save"]');
  const status = root.querySelector(".status");
  let draft = editorConfig(hass, selector.value || {});
  modal.showModal();
  try {
    await ensureCardLoaded(hass);
    const cardClass = customElements.get(CARD_TAG);
    let editor = typeof cardClass?.getConfigElement === "function" ? await cardClass.getConfigElement() : null;
    if (!editor) {
      await customElements.whenDefined("statistics-graph-chart-card-editor");
      editor = document.createElement("statistics-graph-chart-card-editor");
    }
    if (!dialog.isConnected) return;
    editor.hass = hass;
    editor.setConfig(draft);
    editor.addEventListener("config-changed", (event) => {
      if (event.detail?.config) draft = event.detail.config;
    });
    root.querySelector(".host").replaceChildren(editor);
  } catch (error) {
    status.textContent = error.message || custom(hass, "graph_editor_load_error");
    save.disabled = true;
  }
  save.addEventListener("click", () => {
    updateObjectSelector(selector, defaultsFromEditor(draft));
    close();
  });
}

function injectButton() {
  if (!location.pathname.startsWith("/config/integrations")) return false;
  const selector = findCardDefaultsSelector();
  if (!selector?.shadowRoot) return false;
  if (selector.shadowRoot.querySelector(".advanced-history-defaults-button")) return true;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset[INJECTED_KEY] = "true";
  button.className = "advanced-history-defaults-button";
  button.innerHTML = `<ha-icon icon="mdi:tune-variant"></ha-icon><span>${custom(selector.hass, "open_card_defaults_editor")}</span>`;
  button.style.cssText = "margin:12px 0 0;padding:0 16px;height:40px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--primary-color);border-radius:20px;color:var(--primary-color);background:transparent;cursor:pointer;font:inherit;font-weight:500";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDefaultsEditor(selector);
  });
  selector.shadowRoot.append(button);
  return true;
}

function scanForConfigFlow() {
  if (scanForConfigFlow.timer) window.clearInterval(scanForConfigFlow.timer);
  let attempts = 0;
  scanForConfigFlow.timer = window.setInterval(() => {
    attempts += 1;
    if (injectButton() || attempts >= 30) {
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
