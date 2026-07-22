import { ensureCardLoaded, installConfigFlowDefaultsEditor } from "./config-flow-defaults.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { CARD_TAG } from "./constants.js";
import { automaticEntityOptions } from "./entity-defaults.js";
import { customLocalize } from "./translations.js";

// Keep the legacy global value so an update cannot install duplicate listeners
// in a browser session that still has the previous module loaded.
const SHOW_MORE_REDIRECT_INSTALL_KEY = "__advancedHistoryShowMoreRedirectInstalled";
const PANEL_PATH = "/advanced-history";
const PANEL_KEY = "advanced-history";
const MORE_INFO_PATCH_KEY = "__advancedHistoryMoreInfoPatched";
const MORE_INFO_HOST_CLASS = "advanced-history-more-info-chart";
const MORE_INFO_HOST_BOTTOM_OFFSET =
  "margin-block-end:calc(var(--ha-space-6, 24px) * -1);";
const MORE_INFO_STATE_TIMELINE_HEIGHT = 90;
const MORE_INFO_REPLACING_ATTRIBUTE = "advanced-history-replacing-chart";
const MORE_INFO_STYLE_CLASS = "advanced-history-more-info-style";
const MORE_INFO_EDITOR_BUTTON_CLASS = "advanced-history-more-info-editor-button";
const MORE_INFO_EDITOR_LINK_CLASS = "advanced-history-more-info-editor-link";
const MORE_INFO_EDITOR_ACTIONS_CLASS = "advanced-history-more-info-editor-actions";
const MORE_INFO_EDITOR_RESIZE_OBSERVER = "__advancedHistoryMoreInfoEditorResizeObserver";
const MORE_INFO_CONFIG_TYPE = "advanced_history/more_info/config";
const MORE_INFO_ENTITY_CONFIG_SET_TYPE = "advanced_history/more_info/entity_config/set";
const moreInfoConfigCache = new Map();
const moreInfoConfigRequests = new Map();

function language(hass) {
  return hass?.locale?.language || hass?.language;
}

function localize(hass, key, fallback) {
  return hass?.localize?.(key) || fallback;
}

function custom(hass, key) {
  return customLocalize(language(hass), key);
}

function configCacheKey(entityId) {
  return entityId || "__global__";
}

function invalidateMoreInfoConfig(entityId) {
  moreInfoConfigCache.delete(configCacheKey(entityId));
}

async function getMoreInfoConfig(hass, entityId) {
  const key = configCacheKey(entityId);
  const now = Date.now();
  const cached = moreInfoConfigCache.get(key);
  if (cached && now < cached.expires) return cached.config;
  if (moreInfoConfigRequests.has(key)) return moreInfoConfigRequests.get(key);
  const request = hass.callWS({
    type: MORE_INFO_CONFIG_TYPE,
    ...(entityId ? { entity_id: entityId } : {}),
  })
    .then((config) => {
      const resolved = config || { enabled: false };
      moreInfoConfigCache.set(key, { config: resolved, expires: Date.now() + 5000 });
      return resolved;
    })
    .finally(() => { moreInfoConfigRequests.delete(key); });
  moreInfoConfigRequests.set(key, request);
  return request;
}

function entityTemplate(options) {
  const configured = options?.entities;
  const rows = Array.isArray(configured) ? configured : configured ? [configured] : [];
  return rows.find((row) => row && typeof row === "object" && !Array.isArray(row)) || {};
}

function entityDisplayPrecision(hass, entityId) {
  const registryEntry = hass?.entities?.[entityId];
  const attributes = hass?.states?.[entityId]?.attributes || {};
  const candidates = [
    registryEntry?.options?.sensor?.display_precision,
    registryEntry?.display_precision,
    attributes.suggested_display_precision,
    attributes.display_precision,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;
    const precision = Number(candidate);
    if (Number.isInteger(precision) && precision >= 0) return precision;
  }
  return undefined;
}

function resolvedTimeZone(hass) {
  const preference = hass?.locale?.time_zone;
  const serverTimeZone = hass?.config?.time_zone;
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (preference === "server" || preference === "home") {
    return serverTimeZone || browserTimeZone || "UTC";
  }
  if (preference === "local" || preference === "auto") {
    return browserTimeZone || serverTimeZone || "UTC";
  }
  if (typeof preference === "string" && preference) return preference;
  return serverTimeZone || browserTimeZone || "UTC";
}

function nativeGraphColor(historyView) {
  const style = getComputedStyle(historyView);
  return style.getPropertyValue("--graph-color-1").trim()
    || style.getPropertyValue("--color-1").trim();
}

function cssVariableChain(properties) {
  return properties.reduceRight(
    (fallback, property) => `var(${property}${fallback ? `, ${fallback}` : ""})`,
    "",
  );
}

function nativeStateColor(domain, deviceClass, state, active) {
  if (state === "unavailable") {
    return "var(--history-unavailable-color, var(--state-unavailable-color))";
  }
  if (state === "unknown") {
    return "var(--history-unknown-color, var(--state-inactive-color))";
  }
  const stateKey = state.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  const properties = [];
  if (deviceClass) {
    properties.push(`--state-${domain}-${deviceClass}-${stateKey}-color`);
  }
  properties.push(
    `--state-${domain}-${stateKey}-color`,
    `--state-${domain}-${active ? "active" : "inactive"}-color`,
    `--state-${active ? "active" : "inactive"}-color`,
  );
  return cssVariableChain(properties);
}

function nativeBinaryStateMap(historyView) {
  const entityId = historyView.entityId;
  const domain = entityId?.split(".", 1)[0];
  if (!new Set(["binary_sensor", "input_boolean"]).has(domain)) return undefined;
  const stateObj = historyView.hass?.states?.[entityId];
  if (!stateObj) return undefined;
  const deviceClass = stateObj.attributes?.device_class;
  return ["off", "on", "unknown", "unavailable"].map((state) => ({
    value: state,
    label: historyView.hass?.formatEntityState?.(stateObj, state) || state,
    color: nativeStateColor(domain, deviceClass, state, state === "on"),
  }));
}

function isNumericMoreInfoHistory(historyView, nativeChart) {
  if (nativeChart?.localName === "statistics-chart") return true;

  const state = historyView.hass?.states?.[historyView.entityId];
  const attributes = state?.attributes || {};
  return attributes.state_class != null
    || attributes.unit_of_measurement != null
    || (state?.state !== "" && Number.isFinite(Number(state?.state)));
}

function optionKeysToRemove(config, scope) {
  const configured = config?.[scope];
  return Array.isArray(configured)
    ? configured.filter((key) => typeof key === "string")
    : [];
}

function moreInfoCardConfig(historyView, nativeChart, options, entityConfig) {
  const entityId = historyView.entityId;
  const numeric = isNumericMoreInfoHistory(historyView, nativeChart);
  const cardOptions = options && typeof options === "object" && !Array.isArray(options)
    ? structuredClone(options)
    : {};
  for (const key of optionKeysToRemove(entityConfig, "remove_card_options")) {
    delete cardOptions[key];
  }
  if (entityConfig?.card_options && typeof entityConfig.card_options === "object") {
    Object.assign(cardOptions, structuredClone(entityConfig.card_options));
  }
  const template = {
    ...automaticEntityOptions(historyView.hass?.states?.[entityId], numeric ? "timeline" : "state_timeline"),
    ...structuredClone(entityTemplate(cardOptions)),
  };
  for (const key of optionKeysToRemove(entityConfig, "remove_entity_options")) {
    delete template[key];
  }
  if (entityConfig?.entity_options && typeof entityConfig.entity_options === "object") {
    Object.assign(template, structuredClone(entityConfig.entity_options));
  }
  delete cardOptions.entities;
  delete template.entity;
  delete template.statistic_id;
  delete template.compare;
  if (numeric && !Object.prototype.hasOwnProperty.call(template, "color")) {
    const color = nativeGraphColor(historyView);
    if (color) template.color = color;
  }
  if (numeric && !Object.prototype.hasOwnProperty.call(template, "decimals")) {
    const decimals = entityDisplayPrecision(historyView.hass, entityId);
    if (decimals !== undefined) template.decimals = decimals;
  }
  if (!numeric && !Object.prototype.hasOwnProperty.call(template, "name")) {
    // Home Assistant omits the entity name beside a single More Info state
    // timeline. A truthy whitespace value also prevents the card from falling
    // back to its generated friendly name while leaving no visible label.
    template.name = " ";
  }
  if (
    !numeric
    && !Object.prototype.hasOwnProperty.call(template, "state_map")
    && !Object.prototype.hasOwnProperty.call(template, "color")
  ) {
    const stateMap = nativeBinaryStateMap(historyView);
    if (stateMap) template.state_map = stateMap;
  }
  const configuredHeight = Number(cardOptions.height) || 240;
  return {
    ...cardOptions,
    type: `custom:${CARD_TAG}`,
    card_header: "",
    card_padding: cardOptions.card_padding ?? 0,
    chart_mode: numeric ? "timeline" : "state_timeline",
    ...(cardOptions.hours_to_show !== undefined
      ? { hours_to_show: cardOptions.hours_to_show }
      : {}),
    height: numeric
      ? configuredHeight
      : Math.min(configuredHeight, MORE_INFO_STATE_TIMELINE_HEIGHT),
    time_zone: cardOptions.time_zone ?? resolvedTimeZone(historyView.hass),
    ...(numeric ? {} : { group_by: "raw" }),
    entities: [{ ...template, entity: entityId }],
  };
}

function restoreNativeChart(historyView) {
  const root = historyView.shadowRoot;
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER]?.disconnect();
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER] = null;
  historyView.removeAttribute(MORE_INFO_REPLACING_ATTRIBUTE);
  root?.querySelector(`.${MORE_INFO_HOST_CLASS}`)?.remove();
  const actions = root?.querySelector(`.${MORE_INFO_EDITOR_ACTIONS_CLASS}`);
  const editorLink = actions?.querySelector(`.${MORE_INFO_EDITOR_LINK_CLASS}`);
  if (actions && editorLink) {
    editorLink.classList.remove(MORE_INFO_EDITOR_LINK_CLASS);
    actions.before(editorLink);
  }
  actions?.remove();
  root?.querySelector(`.${MORE_INFO_EDITOR_BUTTON_CLASS}`)?.remove();
  for (const chart of root?.querySelectorAll("statistics-chart, state-history-charts") || []) {
    chart.style.removeProperty("display");
  }
}

function alignMoreInfoEditorActions(historyView) {
  const root = historyView.shadowRoot;
  const actions = root?.querySelector(`.${MORE_INFO_EDITOR_ACTIONS_CLASS}`);
  const chartHost = root?.querySelector(`.${MORE_INFO_HOST_CLASS}`);
  if (!actions || !chartHost) return;
  const chartCard = chartHost.querySelector(CARD_TAG);
  const previousOffset = Number(actions.dataset.alignOffset || 0);
  const baseRight = actions.getBoundingClientRect().right - previousOffset;
  const cardOverflow = Number.parseFloat(
    getComputedStyle(historyView).getPropertyValue("--ha-space-1"),
  ) || 4;
  const targetRight = chartCard
    ? chartCard.getBoundingClientRect().right + cardOverflow
    : chartHost.getBoundingClientRect().right;
  const offset = targetRight - baseRight;
  actions.dataset.alignOffset = String(offset);
  actions.style.transform = `translateX(${offset}px)`;
}

function observeMoreInfoEditorAlignment(historyView, chartHost) {
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER]?.disconnect();
  const observer = new ResizeObserver(() => alignMoreInfoEditorActions(historyView));
  observer.observe(historyView);
  observer.observe(chartHost);
  const chartCard = chartHost.querySelector(CARD_TAG);
  if (chartCard) observer.observe(chartCard);
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER] = observer;
  requestAnimationFrame(() => alignMoreInfoEditorActions(historyView));
}

function claimMoreInfoChart(historyView) {
  const root = historyView.shadowRoot;
  if (!root) return;
  if (!root.querySelector(`.${MORE_INFO_STYLE_CLASS}`)) {
    const style = document.createElement("style");
    style.className = MORE_INFO_STYLE_CLASS;
    style.textContent = `
      :host([${MORE_INFO_REPLACING_ATTRIBUTE}]) statistics-chart,
      :host([${MORE_INFO_REPLACING_ATTRIBUTE}]) state-history-charts {
        display: none !important;
      }
      .header {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .header > div:first-child {
        margin-inline-start: calc(var(--ha-space-2, 8px) * -1);
      }
      .${MORE_INFO_EDITOR_ACTIONS_CLASS} {
        justify-self: end !important;
        display: inline-flex !important;
        align-items: center;
        gap: 4px;
      }
    `;
    root.append(style);
  }
  historyView.setAttribute(MORE_INFO_REPLACING_ATTRIBUTE, "");
}

function showMoreInfoLoading(root, nativeChart) {
  let host = root.querySelector(`.${MORE_INFO_HOST_CLASS}`);
  if (host) return host;
  host = document.createElement("div");
  host.className = MORE_INFO_HOST_CLASS;
  host.style.cssText =
    `min-height:240px;display:flex;align-items:center;justify-content:center;${MORE_INFO_HOST_BOTTOM_OFFSET}`;
  const progress = document.createElement("ha-circular-progress");
  progress.setAttribute("active", "");
  progress.setAttribute("size", "small");
  host.append(progress);
  nativeChart.before(host);
  return host;
}

function sameGraphOption(left, right) {
  if (Object.is(left, right)) return true;
  if (left == null || right == null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (_) {
    return false;
  }
}

function graphOptionChanges(draft, base, protectedKeys) {
  const configured = {};
  const removed = [];
  const draftOptions = draft && typeof draft === "object" ? draft : {};
  const baseOptions = base && typeof base === "object" ? base : {};
  for (const key of new Set([...Object.keys(baseOptions), ...Object.keys(draftOptions)])) {
    if (protectedKeys.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(draftOptions, key) || draftOptions[key] === undefined) {
      if (Object.prototype.hasOwnProperty.call(baseOptions, key)) removed.push(key);
      continue;
    }
    if (!sameGraphOption(draftOptions[key], baseOptions[key])) {
      configured[key] = structuredClone(draftOptions[key]);
    }
  }
  return { configured, removed: removed.sort() };
}

function entityOverrideFromEditor(draft, base, numeric) {
  const cardChanges = graphOptionChanges(
    draft,
    base,
    new Set([
      "type", "card_header", "chart_mode", "entities",
      ...(numeric ? [] : ["group_by"]),
    ]),
  );
  const draftEntity = Array.isArray(draft?.entities)
    ? draft.entities.find((row) => row && typeof row === "object" && !Array.isArray(row)) || {}
    : {};
  const baseEntity = Array.isArray(base?.entities) ? base.entities[0] || {} : {};
  const entityChanges = graphOptionChanges(
    draftEntity,
    baseEntity,
    new Set(["entity", "statistic_id", "compare"]),
  );
  const result = {};
  if (Object.keys(cardChanges.configured).length) result.card_options = cardChanges.configured;
  if (cardChanges.removed.length) result.remove_card_options = cardChanges.removed;
  if (Object.keys(entityChanges.configured).length) result.entity_options = entityChanges.configured;
  if (entityChanges.removed.length) result.remove_entity_options = entityChanges.removed;
  return Object.keys(result).length ? result : null;
}

async function saveMoreInfoEntityConfig(historyView, entityId, config) {
  await historyView.hass.callWS({
    type: MORE_INFO_ENTITY_CONFIG_SET_TYPE,
    entity_id: entityId,
    config,
  });
  invalidateMoreInfoConfig(entityId);
  if (historyView.entityId !== entityId) return;
  historyView.__advancedHistoryMoreInfoToken = (historyView.__advancedHistoryMoreInfoToken || 0) + 1;
  scheduleMoreInfoReplacement(historyView);
}

async function openMoreInfoEntityEditor(historyView, serviceConfig) {
  if (!historyView?.entityId) return;
  const root = historyView.shadowRoot;
  const nativeChart = root?.querySelector("statistics-chart, state-history-charts");
  if (!nativeChart) return;

  const hass = historyView.hass;
  const entityId = historyView.entityId;
  const numeric = isNumericMoreInfoHistory(historyView, nativeChart);
  const baseConfig = moreInfoCardConfig(historyView, nativeChart, serviceConfig.card_options || {}, null);
  await openCardEditorDialog({
    hass,
    initialConfig: moreInfoCardConfig(
      historyView,
      nativeChart,
      serviceConfig.card_options || {},
      serviceConfig.entity_config,
    ),
    title: custom(hass, "more_info_entity_graph_settings"),
    note: custom(hass, "more_info_entity_editor_note"),
    labels: {
      loading: localize(hass, "ui.common.loading", "Loading"),
      cancel: localize(hass, "ui.common.cancel", "Cancel"),
      save: localize(hass, "ui.common.save", "Save"),
      reset: localize(hass, "ui.common.reset", "Reset"),
      showCode: localize(
        hass,
        "ui.panel.lovelace.editor.edit_card.show_code_editor",
        "Show code editor",
      ),
      showVisual: localize(
        hass,
        "ui.panel.lovelace.editor.edit_card.show_visual_editor",
        "Show visual editor",
      ),
      mappingError: custom(hass, "graph_code_editor_mapping_error"),
      loadError: custom(hass, "graph_editor_load_error"),
      saveError: custom(hass, "more_info_entity_save_error"),
      confirmResetTitle: custom(hass, "more_info_entity_reset_title"),
      confirmReset: custom(hass, "more_info_entity_reset_confirm"),
    },
    ensureLoaded: () => ensureCardLoaded(hass, serviceConfig.card_module_url),
    resetDisabled: !serviceConfig.entity_config,
    onSave: (draft) => saveMoreInfoEntityConfig(
      historyView,
      entityId,
      entityOverrideFromEditor(draft, baseConfig, numeric),
    ),
    onReset: () => saveMoreInfoEntityConfig(historyView, entityId, null),
  });
}

function ensureMoreInfoEditorButton(historyView, serviceConfig) {
  const root = historyView.shadowRoot;
  if (!root) return;
  let button = root.querySelector(`.${MORE_INFO_EDITOR_BUTTON_CLASS}`);
  if (!serviceConfig?.enabled || !serviceConfig?.can_edit_entity_config) {
    const actions = root.querySelector(`.${MORE_INFO_EDITOR_ACTIONS_CLASS}`);
    const editorLink = actions?.querySelector(`.${MORE_INFO_EDITOR_LINK_CLASS}`);
    if (actions && editorLink) {
      editorLink.classList.remove(MORE_INFO_EDITOR_LINK_CLASS);
      actions.before(editorLink);
    }
    actions?.remove();
    button?.remove();
    return;
  }
  const showMore = [...root.querySelectorAll("a[href]")].find((link) => {
    try {
      return new URL(link.href, window.location.origin).pathname === "/history";
    } catch (_) {
      return false;
    }
  });
  if (!showMore) return;
  showMore.classList.add(MORE_INFO_EDITOR_LINK_CLASS);
  let actions = root.querySelector(`.${MORE_INFO_EDITOR_ACTIONS_CLASS}`);
  if (!actions) {
    actions = document.createElement("span");
    actions.className = MORE_INFO_EDITOR_ACTIONS_CLASS;
    showMore.before(actions);
  }
  if (showMore.parentElement !== actions) actions.append(showMore);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = MORE_INFO_EDITOR_BUTTON_CLASS;
    button.title = custom(historyView.hass, "more_info_entity_graph_settings");
    button.setAttribute("aria-label", button.title);
    button.style.cssText = "width:40px;height:40px;padding:8px;border:0;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:var(--primary-color);background:transparent";
    button.innerHTML = '<ha-icon icon="mdi:cog-outline"></ha-icon>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMoreInfoEntityEditor(historyView, button.__advancedHistoryServiceConfig);
    });
  }
  button.__advancedHistoryServiceConfig = serviceConfig;
  if (button.parentElement !== actions) actions.append(button);
}

async function replaceMoreInfoChart(historyView) {
  const token = (historyView.__advancedHistoryMoreInfoToken || 0) + 1;
  historyView.__advancedHistoryMoreInfoToken = token;
  const entityId = historyView.entityId;
  if (!entityId) {
    restoreNativeChart(historyView);
    return;
  }

  const root = historyView.shadowRoot;
  let nativeChart = root?.querySelector("statistics-chart, state-history-charts");
  if (!root || !nativeChart) {
    historyView.removeAttribute(MORE_INFO_REPLACING_ATTRIBUTE);
    return;
  }
  showMoreInfoLoading(root, nativeChart);
  try {
    const serviceConfig = await getMoreInfoConfig(historyView.hass, entityId);
    if (
      historyView.__advancedHistoryMoreInfoToken !== token
      || historyView.entityId !== entityId
      || !historyView.isConnected
    ) return;
    if (!serviceConfig?.enabled) {
      restoreNativeChart(historyView);
      return;
    }
    ensureMoreInfoEditorButton(historyView, serviceConfig);
    await ensureCardLoaded(historyView.hass, serviceConfig.card_module_url);
    if (historyView.__advancedHistoryMoreInfoToken !== token || !historyView.isConnected) return;
    nativeChart = root.querySelector("statistics-chart, state-history-charts");
    if (!nativeChart) return;
    const options = serviceConfig.card_options || {};
    const config = moreInfoCardConfig(
      historyView,
      nativeChart,
      options,
      serviceConfig.entity_config,
    );
    const configKey = JSON.stringify({ entityId: historyView.entityId, config });
    let host = root.querySelector(`.${MORE_INFO_HOST_CLASS}`);
    let card = host?.querySelector(CARD_TAG);
    if (!host || host.dataset.configKey !== configKey || !card) {
      host?.remove();
      host = document.createElement("div");
      host.className = MORE_INFO_HOST_CLASS;
      host.dataset.configKey = configKey;
      host.style.cssText = `display:block;${MORE_INFO_HOST_BOTTOM_OFFSET}`;
      card = document.createElement(CARD_TAG);
      card.setConfig(config);
      host.append(card);
      nativeChart.before(host);
    }
    card.hass = historyView.hass;
    nativeChart.style.display = "none";
    historyView.removeAttribute(MORE_INFO_REPLACING_ATTRIBUTE);
    observeMoreInfoEditorAlignment(historyView, host);
  } catch (error) {
    console.warn("Advanced History: unable to replace the More Info history graph", error);
    restoreNativeChart(historyView);
  }
}

function scheduleMoreInfoReplacement(historyView) {
  const cached = moreInfoConfigCache.get(configCacheKey(historyView.entityId));
  if (cached?.config?.enabled === false && Date.now() < cached.expires) {
    restoreNativeChart(historyView);
    return;
  }
  claimMoreInfoChart(historyView);
  Promise.resolve(historyView.updateComplete)
    .then(() => replaceMoreInfoChart(historyView))
    .catch(() => restoreNativeChart(historyView));
}

async function installMoreInfoReplacement() {
  await customElements.whenDefined("ha-more-info-history");
  const prototype = customElements.get("ha-more-info-history")?.prototype;
  if (!prototype || prototype[MORE_INFO_PATCH_KEY]) return;
  prototype[MORE_INFO_PATCH_KEY] = true;
  const originalConnected = prototype.connectedCallback;
  const originalUpdated = prototype.updated;
  prototype.connectedCallback = function (...args) {
    const result = originalConnected?.apply(this, args);
    scheduleMoreInfoReplacement(this);
    return result;
  };
  prototype.updated = function (...args) {
    const result = originalUpdated?.apply(this, args);
    scheduleMoreInfoReplacement(this);
    return result;
  };
}

function rewriteShowMoreLink(event) {
  const path = event.composedPath?.() || [];
  const historyView = path.find(
    (node) => node instanceof HTMLElement && node.localName === "ha-more-info-history"
  );
  if (!historyView) return;
  scheduleMoreInfoReplacement(historyView);

  const panelConfig = historyView.hass?.panels?.[PANEL_KEY]?.config;
  if (!panelConfig?.redirect_show_more) return;

  const link = path.find(
    (node) => node instanceof HTMLAnchorElement && node.hasAttribute("href")
  );
  if (!link) return;

  let nativeUrl;
  try {
    nativeUrl = new URL(link.href, window.location.origin);
  } catch (_) {
    return;
  }
  if (nativeUrl.pathname !== "/history") return;

  const entityId = historyView.entityId || nativeUrl.searchParams.get("entity_id");
  if (!entityId) return;

  const target = new URL(PANEL_PATH, window.location.origin);
  target.searchParams.set("entity_id", entityId);
  link.href = `${target.pathname}${target.search}`;
}

if (!window[SHOW_MORE_REDIRECT_INSTALL_KEY]) {
  window[SHOW_MORE_REDIRECT_INSTALL_KEY] = true;
  // Rewriting the real anchor preserves Home Assistant's normal navigation,
  // including dialog closure, modifier keys, new tabs, and browser history.
  document.addEventListener("click", rewriteShowMoreLink, true);
  document.addEventListener("auxclick", rewriteShowMoreLink, true);
  document.addEventListener("contextmenu", rewriteShowMoreLink, true);
}

installConfigFlowDefaultsEditor();
installMoreInfoReplacement().catch((error) => {
  console.warn("Advanced History: unable to install the More Info graph replacement", error);
});
