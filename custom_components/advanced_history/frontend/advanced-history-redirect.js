import { ensureCardLoaded, installConfigFlowDefaultsEditor } from "./config-flow-defaults.js";
import { CARD_TAG } from "./constants.js";

const INSTALL_KEY = "__advancedHistoryShowMoreRedirectInstalled";
const PANEL_PATH = "/advanced-history";
const PANEL_KEY = "advanced-history";
const MORE_INFO_PATCH_KEY = "__advancedHistoryMoreInfoPatched";
const MORE_INFO_HOST_CLASS = "advanced-history-more-info-chart";
const MORE_INFO_HOST_BOTTOM_OFFSET =
  "margin-block-end:calc(var(--ha-space-6, 24px) * -1);";
const MORE_INFO_REPLACING_ATTRIBUTE = "advanced-history-replacing-chart";
const MORE_INFO_STYLE_CLASS = "advanced-history-more-info-style";
const MORE_INFO_CONFIG_TYPE = "advanced_history/more_info/config";
let moreInfoConfigCache;
let moreInfoConfigExpires = 0;
let moreInfoConfigRequest;

async function getMoreInfoConfig(hass) {
  const now = Date.now();
  if (moreInfoConfigCache && now < moreInfoConfigExpires) return moreInfoConfigCache;
  if (moreInfoConfigRequest) return moreInfoConfigRequest;
  moreInfoConfigRequest = hass.callWS({ type: MORE_INFO_CONFIG_TYPE })
    .then((config) => {
      moreInfoConfigCache = config || { enabled: false };
      moreInfoConfigExpires = Date.now() + 5000;
      return moreInfoConfigCache;
    })
    .finally(() => { moreInfoConfigRequest = undefined; });
  return moreInfoConfigRequest;
}

function entityTemplate(options) {
  const configured = options?.entities;
  const rows = Array.isArray(configured) ? configured : configured ? [configured] : [];
  return rows.find((row) => row && typeof row === "object" && !Array.isArray(row)) || {};
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

function moreInfoCardConfig(historyView, options) {
  const entityId = historyView.entityId;
  const state = historyView.hass?.states?.[entityId];
  const numeric = state?.state !== "" && Number.isFinite(Number(state?.state));
  const cardOptions = options && typeof options === "object" && !Array.isArray(options)
    ? structuredClone(options)
    : {};
  const template = structuredClone(entityTemplate(cardOptions));
  delete cardOptions.entities;
  delete template.entity;
  delete template.statistic_id;
  delete template.compare;
  if (!Object.prototype.hasOwnProperty.call(template, "color")) {
    const color = nativeGraphColor(historyView);
    if (color) template.color = color;
  }
  return {
    ...cardOptions,
    type: `custom:${CARD_TAG}`,
    card_header: "",
    card_padding: cardOptions.card_padding ?? 0,
    chart_mode: numeric ? "timeline" : "state_timeline",
    hours_to_show: Number(cardOptions.hours_to_show) || 24,
    height: Number(cardOptions.height) || 240,
    time_zone: cardOptions.time_zone ?? resolvedTimeZone(historyView.hass),
    ...(numeric ? {} : { group_by: "raw" }),
    entities: [{ ...template, entity: entityId }],
  };
}

function restoreNativeChart(historyView) {
  const root = historyView.shadowRoot;
  historyView.removeAttribute(MORE_INFO_REPLACING_ATTRIBUTE);
  root?.querySelector(`.${MORE_INFO_HOST_CLASS}`)?.remove();
  for (const chart of root?.querySelectorAll("statistics-chart, state-history-charts") || []) {
    chart.style.removeProperty("display");
  }
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

async function replaceMoreInfoChart(historyView) {
  const token = (historyView.__advancedHistoryMoreInfoToken || 0) + 1;
  historyView.__advancedHistoryMoreInfoToken = token;
  if (!historyView.entityId) {
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
    const serviceConfig = await getMoreInfoConfig(historyView.hass);
    if (!serviceConfig?.enabled) {
      restoreNativeChart(historyView);
      return;
    }
    await ensureCardLoaded(historyView.hass, serviceConfig.card_module_url);
    if (historyView.__advancedHistoryMoreInfoToken !== token || !historyView.isConnected) return;
    nativeChart = root.querySelector("statistics-chart, state-history-charts");
    if (!nativeChart) return;
    const options = serviceConfig.card_options || {};
    const config = moreInfoCardConfig(historyView, options);
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
  } catch (error) {
    console.warn("Advanced History: unable to replace the More Info history graph", error);
    restoreNativeChart(historyView);
  }
}

function scheduleMoreInfoReplacement(historyView) {
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

if (!window[INSTALL_KEY]) {
  window[INSTALL_KEY] = true;
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
