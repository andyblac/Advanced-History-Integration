import { ensureCardLoaded, installConfigFlowDefaultsEditor } from "./config-flow-defaults.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { installCardHandoffApi } from "./card-handoff.js";
import { CARD_TAG } from "./constants.js";
import { automaticEntityOptions } from "./entity-defaults.js";
import {
  historyAttributeDisplayName,
  historyAttributeUnit,
  nativeHistoryAttributes,
} from "./history-series.js";
import { mergeStateMaps, nativeStateMap } from "./state-colors.js";
import { customLocalize, loadTranslations } from "./translations.js";

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
const MORE_INFO_PICKER_BUTTON_CLASS = "advanced-history-more-info-picker-button";
const MORE_INFO_EDITOR_LINK_CLASS = "advanced-history-more-info-editor-link";
const MORE_INFO_EDITOR_ACTIONS_CLASS = "advanced-history-more-info-editor-actions";
const MORE_INFO_EDITOR_RESIZE_OBSERVER = "__advancedHistoryMoreInfoEditorResizeObserver";
const MORE_INFO_DATE_SYNC_HANDLER = "__advancedHistoryMoreInfoDateSyncHandler";
const MORE_INFO_CONFIG_TYPE = "advanced_history/more_info/config";
const MORE_INFO_ENTITY_CONFIG_SET_TYPE = "advanced_history/more_info/entity_config/set";
const MORE_INFO_PICKER_MODE_SET_TYPE = "advanced_history/more_info/picker_mode/set";
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

function nativeGraphColor(historyView, index = 0) {
  const style = getComputedStyle(historyView);
  const position = index + 1;
  return style.getPropertyValue(`--graph-color-${position}`).trim()
    || style.getPropertyValue(`--color-${position}`).trim();
}

function isNumericMoreInfoHistory(historyView, nativeChart) {
  if (nativeChart?.localName === "statistics-chart") return true;

  const state = historyView.hass?.states?.[historyView.entityId];
  const attributes = state?.attributes || {};
  return attributes.state_class != null
    || attributes.unit_of_measurement != null
    || (state?.state !== "" && Number.isFinite(Number(state?.state)));
}

function nativeMoreInfoAttributes(historyView) {
  const entityId = historyView.entityId;
  return nativeHistoryAttributes(entityId, historyView.hass?.states?.[entityId]);
}

function optionKeysToRemove(config, scope) {
  const configured = config?.[scope];
  return Array.isArray(configured)
    ? configured.filter((key) => typeof key === "string")
    : [];
}

function activeComparisons(configured) {
  const active = (comparison) => {
    if (typeof comparison === "string") return comparison ? comparison : null;
    if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) return null;
    return typeof comparison.period === "string" && comparison.period
      ? comparison
      : null;
  };
  if (Array.isArray(configured)) {
    const rows = configured.map(active).filter(Boolean);
    return rows.length ? rows : undefined;
  }
  return active(configured) || undefined;
}

function mergeComparisonDefaults(active, defaults) {
  const configuredActive = activeComparisons(active);
  if (configuredActive == null || defaults == null) return configuredActive;
  const defaultRows = Array.isArray(defaults) ? defaults : null;
  const mergeOne = (configured, index = 0) => {
    const fallback = defaultRows
      ? defaultRows.length === 1
        ? defaultRows[0]
        : defaultRows[index]
      : defaults;
    const options = fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : {};
    if (configured === true) return { ...options };
    if (configured && typeof configured === "object" && !Array.isArray(configured)) {
      return { ...structuredClone(options), ...configured };
    }
    return { ...structuredClone(options), period: configured };
  };
  return Array.isArray(configuredActive)
    ? configuredActive.map((configured, index) => mergeOne(configured, index))
    : mergeOne(configuredActive);
}

function moreInfoCardConfig(historyView, nativeChart, options, entityConfig) {
  const entityId = historyView.entityId;
  const availableNativeAttributes = nativeMoreInfoAttributes(historyView);
  const configuredAttributes = entityConfig?.attribute_selection;
  const nativeAttributes = Array.isArray(configuredAttributes) && configuredAttributes.length
    ? availableNativeAttributes.filter((attribute) => configuredAttributes.includes(attribute))
    : availableNativeAttributes;
  const numeric = nativeAttributes.length > 0
    || isNumericMoreInfoHistory(historyView, nativeChart);
  const cardOptions = options && typeof options === "object" && !Array.isArray(options)
    ? structuredClone(options)
    : {};
  for (const key of optionKeysToRemove(entityConfig, "remove_card_options")) {
    delete cardOptions[key];
  }
  if (entityConfig?.card_options && typeof entityConfig.card_options === "object") {
    Object.assign(cardOptions, structuredClone(entityConfig.card_options));
  }
  const configuredTemplate = structuredClone(entityTemplate(cardOptions));
  const comparisonDefaults = configuredTemplate.compare;
  delete configuredTemplate.compare;
  const template = {
    ...automaticEntityOptions(historyView.hass?.states?.[entityId], numeric ? "timeline" : "state_timeline"),
    ...configuredTemplate,
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
  if (
    numeric
    && nativeAttributes.length === 0
    && !Object.prototype.hasOwnProperty.call(template, "color")
  ) {
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
    && !Object.prototype.hasOwnProperty.call(template, "color")
  ) {
    const stateMap = mergeStateMaps(
      nativeStateMap(historyView.hass, entityId),
      template.state_map
    );
    if (stateMap) template.state_map = stateMap;
  }
  const entityRows = nativeAttributes.length
    ? nativeAttributes.map((attribute) => {
      const row = structuredClone(template);
      const attributeConfig = entityConfig?.attribute_options?.[attribute];
      const attributeOptions = attributeConfig?.options
        || (attributeConfig?.remove_options ? null : attributeConfig);
      for (const key of attributeConfig?.remove_options || []) delete row[key];
      if (attributeOptions && typeof attributeOptions === "object") {
        Object.assign(row, structuredClone(attributeOptions));
      }
      if (Object.prototype.hasOwnProperty.call(row, "compare")) {
        row.compare = mergeComparisonDefaults(row.compare, comparisonDefaults);
        if (row.compare === undefined) delete row.compare;
      }
      if (!Object.prototype.hasOwnProperty.call(row, "color")) {
        const color = nativeGraphColor(
          historyView,
          Math.max(0, availableNativeAttributes.indexOf(attribute)),
        );
        if (color) row.color = color;
      }
      const unit = historyAttributeUnit(historyView.hass, entityId);
      return {
        ...row,
        entity: entityId,
        attribute,
        name: row.name ?? historyAttributeDisplayName(
          historyView.hass,
          entityId,
          attribute,
        ),
        ...(row.unit == null && unit != null ? { unit } : {}),
      };
    })
    : (() => {
      const row = { ...template, entity: entityId };
      if (Object.prototype.hasOwnProperty.call(row, "compare")) {
        row.compare = mergeComparisonDefaults(row.compare, comparisonDefaults);
        if (row.compare === undefined) delete row.compare;
      }
      return [row];
    })();
  const configuredHeight = Number(cardOptions.height) || 240;
  const datePickerGroup = cardOptions.date_picker_group
    || `advanced-history-more-info:${entityId}`;
  return {
    ...cardOptions,
    type: `custom:${CARD_TAG}`,
    card_header: "",
    card_padding: cardOptions.card_padding ?? 0,
    chart_mode: numeric ? (cardOptions.chart_mode || "timeline") : "state_timeline",
    ...(cardOptions.hours_to_show !== undefined
      ? { hours_to_show: cardOptions.hours_to_show }
      : {}),
    height: numeric
      ? configuredHeight
      : Math.min(configuredHeight, MORE_INFO_STATE_TIMELINE_HEIGHT),
    time_zone: cardOptions.time_zone ?? resolvedTimeZone(historyView.hass),
    ...(numeric ? {} : { auto_scale_points: false, group_by: "raw" }),
    ...(cardOptions.show_date_picker ? { date_picker_group: datePickerGroup } : {}),
    entities: entityRows,
  };
}

function pickerMode(historyView, config, preferredMode = null) {
  const selection = historyView.__advancedHistoryMoreInfoPickerSelection;
  if (selection?.entityId === historyView.entityId) {
    return selection.mode;
  }
  if (preferredMode === "date" || preferredMode === "interval") {
    return preferredMode;
  }
  return config.show_date_picker ? "date" : "interval";
}

function applyPickerMode(historyView, config, preferredMode = null) {
  const mode = pickerMode(historyView, config, preferredMode);
  const resolved = {
    ...config,
    show_date_picker: mode === "date",
    show_interval_picker: mode === "interval",
  };
  if (mode === "date") {
    resolved.date_picker_group = config.date_picker_group
      || `advanced-history-more-info:${historyView.entityId}`;
  } else {
    delete resolved.date_picker_group;
  }
  return resolved;
}

function moreInfoLogbook(historyView) {
  const root = historyView?.getRootNode?.();
  if (!(root instanceof ShadowRoot)) return null;

  // Home Assistant has used both a shared history/logbook wrapper and a
  // layout where the two views are direct siblings. Find the sibling from
  // the real root first instead of depending on one container generation.
  const sibling = root.querySelector("ha-more-info-logbook");
  if (sibling) return sibling;

  const nested = root
    .querySelector("ha-more-info-history-and-logbook")
    ?.shadowRoot
    ?.querySelector("ha-more-info-logbook");
  if (nested) return nested;

  return root.host?.shadowRoot?.querySelector("ha-more-info-logbook") || null;
}

function sameLogbookTime(left, right) {
  if (!left || !right) return false;
  if ("recent" in right) return left.recent === right.recent;
  return (
    Array.isArray(left.range)
    && left.range[0]?.getTime?.() === right.range[0]?.getTime?.()
    && left.range[1]?.getTime?.() === right.range[1]?.getTime?.()
  );
}

function setMoreInfoLogbookTime(historyView, time) {
  const logbookView = moreInfoLogbook(historyView);
  if (!logbookView) return false;
  if (sameLogbookTime(logbookView._time, time)) return true;
  logbookView._time = time;
  logbookView.requestUpdate?.();
  return true;
}

function removeMoreInfoDateSync(historyView, resetLogbook = false) {
  const installed = historyView[MORE_INFO_DATE_SYNC_HANDLER];
  if (installed?.handler) {
    window.removeEventListener("sgc-datepicker-sync", installed.handler);
  }
  if (installed?.interactionHandler && installed.card) {
    installed.card.removeEventListener("click", installed.interactionHandler, true);
    installed.card.removeEventListener("change", installed.interactionHandler, true);
  }
  if (installed?.timer) clearTimeout(installed.timer);
  historyView[MORE_INFO_DATE_SYNC_HANDLER] = null;
  if (resetLogbook) setMoreInfoLogbookTime(historyView, { recent: 86400 });
}

function syncMoreInfoLogbookRange(historyView, card) {
  const range = card?._computeDatePickerWindow?.(false);
  const start = range?.start instanceof Date ? range.start : new Date(range?.start);
  const end = range?.end instanceof Date ? range.end : new Date(range?.end);
  if (
    !range
    || Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || end <= start
  ) return;
  setMoreInfoLogbookTime(historyView, { range: [start, end] });
}

function scheduleMoreInfoLogbookRangeSync(historyView, card) {
  const installed = historyView[MORE_INFO_DATE_SYNC_HANDLER];
  if (!installed || installed.card !== card) return;
  if (installed.timer) clearTimeout(installed.timer);
  installed.timer = setTimeout(() => {
    installed.timer = null;
    if (
      historyView[MORE_INFO_DATE_SYNC_HANDLER] === installed
      && historyView.isConnected
      && card.isConnected
    ) {
      syncMoreInfoLogbookRange(historyView, card);
    }
  });
}

function installMoreInfoDateSync(historyView, card, config) {
  const installed = historyView[MORE_INFO_DATE_SYNC_HANDLER];
  if (
    installed?.card === card
    && installed.group === config.date_picker_group
  ) {
    return;
  }
  removeMoreInfoDateSync(historyView);
  if (!config.show_date_picker || !config.date_picker_group) return;
  const handler = (event) => {
    if (event.detail?.group !== config.date_picker_group) return;
    scheduleMoreInfoLogbookRangeSync(historyView, card);
  };
  const interactionHandler = () => scheduleMoreInfoLogbookRangeSync(historyView, card);
  historyView[MORE_INFO_DATE_SYNC_HANDLER] = {
    card,
    group: config.date_picker_group,
    handler,
    interactionHandler,
    timer: null,
  };
  window.addEventListener("sgc-datepicker-sync", handler);
  card.addEventListener("click", interactionHandler, true);
  card.addEventListener("change", interactionHandler, true);
  scheduleMoreInfoLogbookRangeSync(historyView, card);
}

function restoreNativeChart(historyView) {
  const root = historyView.shadowRoot;
  removeMoreInfoDateSync(historyView, true);
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER]?.disconnect();
  historyView[MORE_INFO_EDITOR_RESIZE_OBSERVER] = null;
  resetMoreInfoContainerLayout(historyView);
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
  root?.querySelector(`.${MORE_INFO_PICKER_BUTTON_CLASS}`)?.remove();
  for (const chart of root?.querySelectorAll("statistics-chart, state-history-charts") || []) {
    chart.style.removeProperty("display");
  }
}

function moreInfoHistoryContainer(historyView) {
  const root = historyView.getRootNode();
  return root instanceof ShadowRoot
    && root.host.localName === "ha-more-info-history-and-logbook"
    ? root.host
    : null;
}

function isStandaloneMoreInfoHistory(historyView) {
  const container = moreInfoHistoryContainer(historyView);
  const root = container?.getRootNode();
  return root instanceof ShadowRoot
    && root.host.localName === "ha-more-info-dialog";
}

function resetMoreInfoContainerLayout(historyView) {
  const container = moreInfoHistoryContainer(historyView);
  container?.style.removeProperty("box-sizing");
  container?.style.removeProperty("padding-inline");
}

function applyMoreInfoContainerLayout(historyView) {
  const container = moreInfoHistoryContainer(historyView);
  if (!container) return;
  if (!isStandaloneMoreInfoHistory(historyView)) {
    resetMoreInfoContainerLayout(historyView);
    return;
  }
  // The normal More Info view supplies this inset through ha-more-info-info.
  // The standalone History view renders the same history/logbook container
  // directly in the dialog, so reproduce the shared content boundary here.
  container.style.boxSizing = "border-box";
  container.style.paddingInline = "var(--ha-space-6, 24px)";
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
  applyMoreInfoContainerLayout(historyView);
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

function applyMoreInfoHostLayout(historyView, host) {
  host.style.removeProperty("margin-inline-start");
  host.style.removeProperty("margin-inline-end");
  host.style.removeProperty("margin-block-start");
  host.style.removeProperty("inline-size");
  host.style.marginBlockEnd = isStandaloneMoreInfoHistory(historyView)
    ? "10px"
    : "calc(var(--ha-space-6, 24px) * -1)";
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
  applyMoreInfoHostLayout(root.host, host);
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

function comparisonOverrides(active, defaults) {
  const configuredActive = activeComparisons(active);
  if (configuredActive == null || defaults == null) return configuredActive;
  const defaultRows = Array.isArray(defaults) ? defaults : null;
  const stripOne = (configured, index = 0) => {
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
      return configured;
    }
    const fallback = defaultRows
      ? defaultRows.length === 1
        ? defaultRows[0]
        : defaultRows[index]
      : defaults;
    const result = structuredClone(configured);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      for (const [key, value] of Object.entries(fallback)) {
        if (sameGraphOption(result[key], value)) delete result[key];
      }
    }
    return Object.keys(result).length ? result : true;
  };
  return Array.isArray(configuredActive)
    ? configuredActive.map((configured, index) => stripOne(configured, index))
    : stripOne(configuredActive);
}

function entityOverrideFromEditor(draft, base, numeric, comparisonDefaults) {
  const cardChanges = graphOptionChanges(
    draft,
    base,
    new Set([
      "type", "card_header", "entities",
      ...(numeric ? [] : ["chart_mode"]),
      ...(numeric ? [] : ["group_by"]),
    ]),
  );
  const result = {};
  if (Object.keys(cardChanges.configured).length) result.card_options = cardChanges.configured;
  if (cardChanges.removed.length) result.remove_card_options = cardChanges.removed;
  const draftEntities = Array.isArray(draft?.entities)
    ? draft.entities.filter((row) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  const baseEntities = Array.isArray(base?.entities)
    ? base.entities.filter((row) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  if (baseEntities.length < 2) {
    const draftEntity = structuredClone(draftEntities[0] || {});
    if (Object.prototype.hasOwnProperty.call(draftEntity, "compare")) {
      draftEntity.compare = comparisonOverrides(draftEntity.compare, comparisonDefaults);
    }
    const entityChanges = graphOptionChanges(
      draftEntity,
      baseEntities[0] || {},
      new Set(["entity", "statistic_id"]),
    );
    if (Object.keys(entityChanges.configured).length) {
      result.entity_options = entityChanges.configured;
    }
    if (entityChanges.removed.length) {
      result.remove_entity_options = entityChanges.removed;
    }
  } else {
    const baseByAttribute = new Map(
      baseEntities
        .filter((row) => typeof row.attribute === "string" && row.attribute)
        .map((row) => [row.attribute, row]),
    );
    const selected = [];
    const attributeOptions = {};
    for (const configuredRow of draftEntities) {
      const row = structuredClone(configuredRow);
      const attribute = row.attribute;
      if (!baseByAttribute.has(attribute)) continue;
      selected.push(attribute);
      if (Object.prototype.hasOwnProperty.call(row, "compare")) {
        row.compare = comparisonOverrides(row.compare, comparisonDefaults);
      }
      const changes = graphOptionChanges(
        row,
        baseByAttribute.get(attribute),
        new Set(["entity", "statistic_id", "attribute"]),
      );
      if (Object.keys(changes.configured).length || changes.removed.length) {
        attributeOptions[attribute] = {
          ...(Object.keys(changes.configured).length
            ? { options: changes.configured }
            : {}),
          ...(changes.removed.length
            ? { remove_options: changes.removed }
            : {}),
        };
      }
    }
    const baseSelection = [...baseByAttribute.keys()];
    if (
      selected.length
      && (
        selected.length !== baseSelection.length
        || selected.some((attribute, index) => attribute !== baseSelection[index])
      )
    ) {
      result.attribute_selection = selected;
    }
    if (Object.keys(attributeOptions).length) {
      result.attribute_options = attributeOptions;
    }
  }
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
  const numeric = nativeMoreInfoAttributes(historyView).length > 0
    || isNumericMoreInfoHistory(historyView, nativeChart);
  const baseConfig = applyPickerMode(
    historyView,
    moreInfoCardConfig(
      historyView,
      nativeChart,
      serviceConfig.card_options || {},
      null,
    ),
    serviceConfig.picker_mode,
  );
  await openCardEditorDialog({
    hass,
    container: historyView,
    initialConfig: applyPickerMode(
      historyView,
      moreInfoCardConfig(
        historyView,
        nativeChart,
        serviceConfig.card_options || {},
        serviceConfig.entity_config,
      ),
      serviceConfig.picker_mode,
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
    visualEditorStyles: `
      ${baseConfig.entities.length === 1
        ? `
          #add-entity,
          .edb[data-action="delete"],
          .edup[data-action="duplicate"] { display: none !important; }
        `
        : ""}
      ${numeric ? "" : ".f:has(#chart_mode) { display: none !important; }"}
    `,
    resetDisabled: !serviceConfig.entity_config,
    onSave: (draft) => saveMoreInfoEntityConfig(
      historyView,
      entityId,
      entityOverrideFromEditor(
        draft,
        baseConfig,
        numeric,
        entityTemplate(serviceConfig.card_options || {}).compare,
      ),
    ),
    onReset: () => saveMoreInfoEntityConfig(historyView, entityId, null),
  });
}

function ensureMoreInfoActionButtons(historyView, serviceConfig, cardConfig) {
  const root = historyView.shadowRoot;
  if (!root) return;
  const showMore = [...root.querySelectorAll("a[href]")].find((link) => {
    try {
      return new URL(link.href, window.location.origin).pathname === "/history";
    } catch (_) {
      return false;
    }
  });
  let actions = root.querySelector(`.${MORE_INFO_EDITOR_ACTIONS_CLASS}`);
  if (!actions) {
    const header = root.querySelector(".header");
    if (!showMore && !header) return;
    actions = document.createElement("span");
    actions.className = MORE_INFO_EDITOR_ACTIONS_CLASS;
    if (showMore) showMore.before(actions);
    else header.append(actions);
  }
  if (showMore) {
    showMore.classList.add(MORE_INFO_EDITOR_LINK_CLASS);
    if (showMore.parentElement !== actions) actions.append(showMore);
  }
  let pickerButton = root.querySelector(`.${MORE_INFO_PICKER_BUTTON_CLASS}`);
  if (!pickerButton) {
    pickerButton = document.createElement("button");
    pickerButton.type = "button";
    pickerButton.className = MORE_INFO_PICKER_BUTTON_CLASS;
    pickerButton.style.cssText = "width:40px;height:40px;padding:8px;border:0;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:var(--primary-color);background:transparent";
    pickerButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = pickerMode(historyView, pickerButton.__advancedHistoryCardConfig || {});
      const mode = current === "date" ? "interval" : "date";
      pickerButton.disabled = true;
      try {
        await historyView.hass.callWS({
          type: MORE_INFO_PICKER_MODE_SET_TYPE,
          mode,
        });
        historyView.__advancedHistoryMoreInfoPickerSelection = serviceConfig?.can_edit_entity_config
          ? null
          : {
            entityId: historyView.entityId,
            mode,
          };
        invalidateMoreInfoConfig(historyView.entityId);
        scheduleMoreInfoReplacement(historyView);
      } catch (error) {
        console.warn("Advanced History: unable to save More Info picker preference", error);
      } finally {
        pickerButton.disabled = false;
      }
    });
  }
  pickerButton.__advancedHistoryCardConfig = cardConfig;
  const currentMode = pickerMode(historyView, cardConfig || {});
  const pickerLabel = custom(
    historyView.hass,
    currentMode === "date" ? "use_interval_picker" : "use_date_picker",
  );
  pickerButton.title = pickerLabel;
  pickerButton.setAttribute("aria-label", pickerLabel);
  pickerButton.innerHTML = currentMode === "date"
    ? '<ha-icon icon="mdi:clock-outline"></ha-icon>'
    : '<ha-icon icon="mdi:calendar-outline"></ha-icon>';
  if (pickerButton.parentElement !== actions) actions.append(pickerButton);

  let editorButton = root.querySelector(`.${MORE_INFO_EDITOR_BUTTON_CLASS}`);
  if (!serviceConfig?.can_edit_entity_config) {
    editorButton?.remove();
    return;
  }
  if (!editorButton) {
    editorButton = document.createElement("button");
    editorButton.type = "button";
    editorButton.className = MORE_INFO_EDITOR_BUTTON_CLASS;
    editorButton.title = custom(historyView.hass, "more_info_entity_graph_settings");
    editorButton.setAttribute("aria-label", editorButton.title);
    editorButton.style.cssText = "width:40px;height:40px;padding:8px;border:0;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:var(--primary-color);background:transparent";
    editorButton.innerHTML = '<ha-icon icon="mdi:cog-outline"></ha-icon>';
    editorButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMoreInfoEntityEditor(historyView, editorButton.__advancedHistoryServiceConfig);
    });
  }
  editorButton.__advancedHistoryServiceConfig = serviceConfig;
  if (editorButton.parentElement !== actions) actions.append(editorButton);
}

async function replaceMoreInfoChart(historyView) {
  await loadTranslations(language(historyView.hass));
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
    if (
      historyView.__advancedHistoryMoreInfoPickerSelection?.mode
      === serviceConfig.picker_mode
    ) {
      historyView.__advancedHistoryMoreInfoPickerSelection = null;
    }
    await ensureCardLoaded(historyView.hass, serviceConfig.card_module_url);
    if (historyView.__advancedHistoryMoreInfoToken !== token || !historyView.isConnected) return;
    nativeChart = root.querySelector("statistics-chart, state-history-charts");
    if (!nativeChart) return;
    const options = serviceConfig.card_options || {};
    const config = applyPickerMode(
      historyView,
      moreInfoCardConfig(
        historyView,
        nativeChart,
        options,
        serviceConfig.entity_config,
      ),
      serviceConfig.picker_mode,
    );
    ensureMoreInfoActionButtons(historyView, serviceConfig, config);
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
    applyMoreInfoHostLayout(historyView, host);
    card.hass = historyView.hass;
    installMoreInfoDateSync(historyView, card, config);
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
  const originalDisconnected = prototype.disconnectedCallback;
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
  prototype.disconnectedCallback = function (...args) {
    removeMoreInfoDateSync(this);
    return originalDisconnected?.apply(this, args);
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
  // Config-entry options are edited on a separate Home Assistant route. Clear
  // cached More Info configs when navigating away so the next entity dialog
  // immediately fetches newly submitted defaults instead of reusing them.
  window.addEventListener("location-changed", () => moreInfoConfigCache.clear());
  // Rewriting the real anchor preserves Home Assistant's normal navigation,
  // including dialog closure, modifier keys, new tabs, and browser history.
  document.addEventListener("click", rewriteShowMoreLink, true);
  document.addEventListener("auxclick", rewriteShowMoreLink, true);
  document.addEventListener("contextmenu", rewriteShowMoreLink, true);
}

installConfigFlowDefaultsEditor();
installCardHandoffApi();
installMoreInfoReplacement().catch((error) => {
  console.warn("Advanced History: unable to install the More Info graph replacement", error);
});
