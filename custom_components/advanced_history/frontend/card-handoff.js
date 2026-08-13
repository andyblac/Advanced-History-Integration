import {
  CARD_HANDOFF_QUERY_PARAM,
  CARD_HANDOFF_SCHEMA,
  CARD_HANDOFF_STORAGE_PREFIX,
} from "./constants.js";

const PANEL_PATH = "/advanced-history";
const MAX_HANDOFF_BYTES = 2000000;
const TOKEN_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const OMITTED_CARD_KEYS = new Set([
  "type",
  "entities",
  "energy_date_sync",
  "height",
  "hours_to_show",
  "show_y2_axis",
  "show_advanced_history_button",
  "grid_options",
  "layout_options",
  "view_layout",
  "visibility",
]);

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function validEntityId(value) {
  return typeof value === "string"
    && value.length <= 255
    && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(value);
}

function isoDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePeriod(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const start = isoDate(value.start);
  if (!start) return null;
  const end = isoDate(value.end);
  return {
    start,
    end,
    compare: value.compare ?? "",
  };
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function cardRows(config) {
  if (!Array.isArray(config?.entities)) return [];
  return config.entities;
}

export function cardConfigToSnapshot(config, period = null, singleGraph = false) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;

  const entityIds = [];
  const hiddenEntityIds = [];
  const secondaryEntityIds = new Set();
  const entityOptions = {};
  const attributeSelection = {};
  const seriesRows = {};
  const comparisons = [];
  for (const row of cardRows(config)) {
    const entityId = typeof row === "string" ? row : row?.entity;
    if (!validEntityId(entityId)) continue;
    if (!entityIds.includes(entityId)) entityIds.push(entityId);
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const series = typeof row.attribute === "string" && row.attribute
        ? row.attribute
        : "state";
      seriesRows[entityId] ||= [];
      seriesRows[entityId].push({ series, enabled: row.enabled !== false });
      const options = clone(row);
      delete options.entity;
      delete options.statistic_id;
      if (options.y_axis === "secondary") secondaryEntityIds.add(entityId);
      delete options.y_axis;
      if (options.compare !== undefined) comparisons.push(options.compare);
      const key = series === "state" ? entityId : `${entityId}::${series}`;
      if (Object.keys(options).length) entityOptions[key] = options;
    } else {
      seriesRows[entityId] ||= [];
      seriesRows[entityId].push({ series: "state", enabled: true });
    }
  }
  if (!entityIds.length) return null;
  for (const entityId of entityIds) {
    const rows = seriesRows[entityId] || [];
    const enabledRows = rows.filter((row) => row.enabled);
    const selectedRows = enabledRows.length ? enabledRows : rows;
    attributeSelection[entityId] = [
      ...new Set(selectedRows.map((row) => row.series)),
    ];
    if (rows.length && !enabledRows.length) hiddenEntityIds.push(entityId);
  }

  const cardOptions = {};
  for (const [key, value] of Object.entries(config)) {
    if (OMITTED_CARD_KEYS.has(key) || value === undefined) continue;
    cardOptions[key] = clone(value);
  }

  const chart = {
    defaults_mode: "overrides",
    card_options: cardOptions,
    entity_options: entityOptions,
    attribute_selection: attributeSelection,
  };
  if (singleGraph) chart.single_graph = true;
  if (
    comparisons.length
    && comparisons.every((value) => JSON.stringify(value) === JSON.stringify(comparisons[0]))
  ) {
    chart.compare = clone(comparisons[0]);
  }
  const defaultHours = normalizeNumber(config.hours_to_show);
  const graphHeight = normalizeNumber(config.height);
  if (defaultHours !== undefined) chart.default_hours = defaultHours;
  if (graphHeight !== undefined) chart.source_graph_height = graphHeight;

  const primaryEntityIds = entityIds.filter((entityId) => !secondaryEntityIds.has(entityId));
  const y2EntityIds = entityIds.filter((entityId) => secondaryEntityIds.has(entityId));
  const primaryHiddenEntityIds = hiddenEntityIds.filter((entityId) => !secondaryEntityIds.has(entityId));
  const y2HiddenEntityIds = hiddenEntityIds.filter((entityId) => secondaryEntityIds.has(entityId));

  return {
    schema: 1,
    targets: {
      area_id: [],
      device_id: [],
      entity_id: primaryEntityIds,
    },
    hidden_targets: {
      area_id: [],
      device_id: [],
      entity_id: primaryHiddenEntityIds,
    },
    y2_targets: {
      area_id: [],
      device_id: [],
      entity_id: y2EntityIds,
    },
    hidden_y2_targets: {
      area_id: [],
      device_id: [],
      entity_id: y2HiddenEntityIds,
    },
    chart,
    period: normalizePeriod(period),
    source_bookmark_id: null,
  };
}

function newToken() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function navigateToHandoff(token) {
  const target = new URL(PANEL_PATH, window.location.origin);
  target.searchParams.set(CARD_HANDOFF_QUERY_PARAM, token);
  history.pushState(null, "", `${target.pathname}${target.search}`);
  window.dispatchEvent(new Event("location-changed"));
}

export function installCardHandoffApi() {
  const current = window.advancedHistory;
  const api = current && typeof current === "object" ? current : {};
  /**
   * Open entities or a Statistics Graph Chart Card configuration in Advanced
   * History.
   *
   * Other card types should supply a plain array of entity IDs using
   * `entities`. Their card and entity-row configuration is intentionally not
   * imported because its schema may have different meanings.
   *
   * `period` is optional and accepts Date values or ISO strings:
   * { start, end, compare }. Supplying it lets the receiving panel reproduce
   * the card's currently displayed range instead of retaining the Energy
   * date picker's current selection.
   */
  api.openCard = ({ config, entities, period } = {}) => {
    try {
      const hasCardConfig = Boolean(
        config && typeof config === "object" && !Array.isArray(config)
      );
      const sourceConfig = hasCardConfig
        ? config
        : (Array.isArray(entities)
          ? { entities: entities.filter((entityId) => validEntityId(entityId)) }
          : null);
      const snapshot = cardConfigToSnapshot(sourceConfig, period, hasCardConfig);
      if (!snapshot) {
        console.warn("Advanced History: card handoff requires at least one valid entity");
        return false;
      }
      const token = newToken();
      const payload = JSON.stringify({
        schema_version: CARD_HANDOFF_SCHEMA,
        snapshot,
      });
      if (new TextEncoder().encode(payload).length > MAX_HANDOFF_BYTES) {
        throw new Error("Card handoff is too large");
      }
      sessionStorage.setItem(`${CARD_HANDOFF_STORAGE_PREFIX}${token}`, payload);
      navigateToHandoff(token);
      return true;
    } catch (error) {
      console.warn("Advanced History: unable to open card", error);
      return false;
    }
  };
  window.advancedHistory = api;
}

export function consumeCardHandoff(params) {
  const token = params.get(CARD_HANDOFF_QUERY_PARAM);
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const key = `${CARD_HANDOFF_STORAGE_PREFIX}${token}`;
  try {
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw || new TextEncoder().encode(raw).length > MAX_HANDOFF_BYTES) return null;
    const payload = JSON.parse(raw);
    if (payload?.schema_version !== CARD_HANDOFF_SCHEMA) return null;
    return payload.snapshot || null;
  } catch (error) {
    console.warn("Advanced History: card handoff could not be loaded", error);
    return null;
  }
}
