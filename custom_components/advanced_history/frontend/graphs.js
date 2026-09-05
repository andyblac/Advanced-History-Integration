import {
  CARD_HACS_INSTALL_URL,
  CARD_TAG,
  DASHBOARD_SYNC_GROUP_KEYS,
} from "./constants.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { CARD_DEFAULT_AGGREGATE, automaticEntityOptions } from "./entity-defaults.js";
import {
  NATIVE_HISTORY_ATTRIBUTES,
  historyAttributeDisplayName,
  historyAttributeUnit,
  nativeHistoryAttributes,
} from "./history-series.js";
import {
  mergeStateMaps,
  nativeStateMap,
} from "./state-colors.js";
import { cumulativeRunningTotalSeries } from "./running-total.js";

const DATA_SOURCE_CACHE = new Map();
const ENTITY_OPTION_REMOVALS = "__advanced_history_remove_options";
const EXTENDED_ENTITY_COLORS = Object.freeze([
  // The card's compact palette already covers red, blue, green, orange,
  // purple and teal. Start its extension with a visibly separate colour so
  // the first Y2/overflow series cannot look like the first Y1 series.
  "#d4e157",
  "#f06292",
  "#7986cb",
  "#4dd0e1",
  "#ff8a65",
  "#a1887f",
  "#aed581",
  "#9575cd",
  "#ffd54f",
  "#90a4ae",
  "#4fc3f7",
  "#fff176",
]);

function extendedEntityPalette(cardPalette, minimumSize = 0) {
  const colors = [];
  const seen = new Set();
  for (const color of [
    ...(Array.isArray(cardPalette) ? cardPalette : []),
    ...EXTENDED_ENTITY_COLORS,
  ]) {
    if (typeof color !== "string") continue;
    const key = color.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    colors.push(color);
  }
  let generatedIndex = 0;
  while (colors.length < minimumSize) {
    const hue = Math.round((17 + generatedIndex * 137.508) % 360);
    const lightness = generatedIndex % 2 ? 62 : 48;
    const color = `hsl(${hue} 72% ${lightness}%)`;
    generatedIndex += 1;
    if (seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }
  return colors;
}

function graphColorKey(color) {
  return typeof color === "string" ? color.trim().toLowerCase() : "";
}

function graphComparisonRows(configured) {
  const compare = configured?.compare;
  if (Array.isArray(compare)) return compare;
  return compare && typeof compare === "object" ? [compare] : [];
}

export function renderedGraphDataSources(card) {
  const sources = new Set();
  for (const series of card?._graphData?.series || []) {
    if (!Array.isArray(series?.points) || !series.points.length) continue;
    if (series._isStat === true) sources.add("statistics");
    else if (series._isStat === false) sources.add("history");
  }
  return [...sources];
}

function graphColorRgb(color) {
  const value = graphColorKey(color);
  const shortHex = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return shortHex.slice(1).map((part) => Number.parseInt(part + part, 16));
  }
  const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return hex.slice(1).map((part) => Number.parseInt(part, 16));
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i,
  );
  return rgb ? rgb.slice(1).map((part) => Number(part)) : null;
}

function graphColorsAreSimilar(left, right) {
  if (graphColorKey(left) === graphColorKey(right)) return true;
  const leftRgb = graphColorRgb(left);
  const rightRgb = graphColorRgb(right);
  if (!leftRgb || !rightRgb) return false;
  const redMean = (leftRgb[0] + rightRgb[0]) / 2;
  const red = leftRgb[0] - rightRgb[0];
  const green = leftRgb[1] - rightRgb[1];
  const blue = leftRgb[2] - rightRgb[2];
  const distance = Math.sqrt(
    (2 + redMean / 256) * red * red
    + 4 * green * green
    + (2 + (255 - redMean) / 256) * blue * blue,
  );
  return distance < 110;
}

function graphColorIsUsed(color, usedColors) {
  return [...usedColors].some((used) => graphColorsAreSimilar(color, used));
}

function nextUnusedGraphColor(palette, usedColors) {
  const color = palette.find((candidate) => !graphColorIsUsed(candidate, usedColors));
  if (color) usedColors.add(graphColorKey(color));
  return color;
}

function historyTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    // Home Assistant's compact history API uses Unix seconds, while some
    // history consumers use milliseconds.
    return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }
  return value;
}

function normalizeCompactHistoryResponse(response) {
  if (Array.isArray(response)) {
    let attributes = response.find(
      (item) => item && typeof item === "object" && item.a
    )?.a;
    let changed = false;
    const normalized = response.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (item.a) attributes = item.a;
      const value = normalizeCompactHistoryResponse(item);
      if (
        value !== item
        && value
        && typeof value === "object"
        && Object.prototype.hasOwnProperty.call(value, "state")
        && value.attributes == null
      ) {
        value.attributes = attributes || {};
      }
      changed ||= value !== item;
      return value;
    });
    return changed ? normalized : response;
  }
  if (!response || typeof response !== "object") return response;

  const compactState = (
    !Object.prototype.hasOwnProperty.call(response, "state")
    && Object.prototype.hasOwnProperty.call(response, "s")
    && (
      Object.prototype.hasOwnProperty.call(response, "lu")
      || Object.prototype.hasOwnProperty.call(response, "lc")
    )
  );
  if (compactState) {
    const lastUpdated = historyTimestamp(response.lu ?? response.lc);
    const lastChanged = historyTimestamp(response.lc ?? response.lu);
    return {
      ...response,
      state: response.s,
      attributes: response.a,
      last_updated: lastUpdated,
      last_changed: lastChanged,
    };
  }

  let changed = false;
  const normalized = {};
  for (const [key, value] of Object.entries(response)) {
    const next = normalizeCompactHistoryResponse(value);
    normalized[key] = next;
    changed ||= next !== value;
  }
  return changed ? normalized : response;
}

const DASHBOARD_WRAPPER_NAVIGATION_KEYS = [
  "energy_date_sync",
  "energy_collection_key",
  "show_date_picker",
  "date_picker_position",
  "date_picker_nav_position",
  "date_picker_shortcuts_position",
  "date_picker_modes",
  "date_picker_default_mode",
  "date_picker_step",
  "show_interval_picker",
  "interval_picker_position",
  "interval_options",
];

export function withoutDashboardWrapperNavigation(config) {
  const next = { ...(config || {}) };
  for (const key of DASHBOARD_WRAPPER_NAVIGATION_KEYS) delete next[key];
  return next;
}

export class GraphMethods {
  _renderGraphs() {
    const host = this.shadowRoot.getElementById("charts");
    if (!host) return;
    this._disconnectDynamicGraphLayout();
    const detail = this._largeRangeDetailProfile();
    for (const card of this._graphCards || []) {
      card.__advancedHistorySourceObserver?.disconnect?.();
    }
    this._cards = this._cards.filter((card) => !this._graphCards.includes(card));
    this._graphCards = [];
    host.replaceChildren();
    if (this._cardLoadError) {
      this._renderLargeRangeDetailBanner(null);
      const title = this._customLocalize("card_missing_title");
      const install = this._customLocalize("install_with_hacs");
      const retry = this._localize("ui.panel.app.retry", "Retry");
      host.innerHTML = `<div class="error dependency-error">
        <ha-icon icon="mdi:puzzle-outline"></ha-icon>
        <h2>${this._escape(title)}</h2>
        <p>${this._escape(this._cardLoadError)}</p>
        <div class="dependency-actions">
          <a class="primary" href="${CARD_HACS_INSTALL_URL}" target="_blank" rel="noopener noreferrer"><ha-icon icon="mdi:open-in-new"></ha-icon><span>${this._escape(install)}</span></a>
          <button data-action="retry-card"><ha-icon icon="mdi:refresh"></ha-icon><span>${this._escape(retry)}</span></button>
        </div>
      </div>`;
      const retryButton = host.querySelector('[data-action="retry-card"]');
      retryButton?.addEventListener("click", () => this._retryCardLoad(retryButton));
      return;
    }
    const entityIds = this._resolvedEntityIds();
    const series = this._seriesDescriptors(entityIds);
    if (this._notice && !this.shadowRoot.querySelector(".notice")) host.insertAdjacentHTML("beforebegin", `<div class="notice">${this._escape(this._notice)}</div>`);
    if (!entityIds.length) {
      this._renderLargeRangeDetailBanner(null);
      const prompt = this._localize("ui.panel.history.start_search", "Select areas, devices, entities or labels above");
      host.innerHTML = `<div class="start"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon><p>${this._escape(prompt)}</p></div>`;
      return;
    }
    if (this._usesSingleGraph(series)) {
      const hasNumeric = series.some((item) => this._isNumeric(item));
      const cardOptions = this._cardOptions(hasNumeric ? "timeline" : "state_timeline");
      const mode = hasNumeric
        ? (cardOptions.chart_mode || "timeline")
        : "state_timeline";
      const graphDetail = mode === "state_timeline" ? null : detail;
      this._renderLargeRangeDetailBanner(graphDetail);
      this._configureDynamicGraphLayout(
        host,
        mode !== "state_timeline",
        mode === "state_timeline",
      );
      this._createGraph(host, series, "", mode, graphDetail);
      return;
    }
    const numeric = series.filter((item) => this._isNumeric(item));
    const states = series.filter((item) => !this._isNumeric(item));
    const multipleCharts = Boolean(numeric.length && states.length);
    this._renderLargeRangeDetailBanner(numeric.length ? detail : null);
    // Establish the available chart region before configuring cards with the
    // card's native height:auto + numeric grid-row contract.
    this._configureDynamicGraphLayout(host, Boolean(numeric.length), Boolean(states.length));
    if (numeric.length) {
      const numericMode = this._cardOptions("timeline").chart_mode || "timeline";
      this._createGraph(
        host,
        numeric,
        multipleCharts ? this._customLocalize("numeric_history") : "",
        numericMode,
        detail,
      );
    }
    if (states.length) {
      this._createGraph(
        host,
        states,
        multipleCharts ? this._customLocalize("state_history") : "",
        "state_timeline",
        null,
      );
    }
  }

  _disconnectDynamicGraphLayout() {
    this._graphLayoutResizeObserver?.disconnect();
    this._graphLayoutResizeObserver = null;
    this._graphLayoutMutationObserver?.disconnect();
    this._graphLayoutMutationObserver = null;
    this._graphLayoutObservedElements = null;
    this._graphLayoutObservedRoots = null;
    if (this._graphLayoutAnimationFrame) {
      cancelAnimationFrame(this._graphLayoutAnimationFrame);
    }
    if (this._graphLayoutSettleFrame) {
      cancelAnimationFrame(this._graphLayoutSettleFrame);
    }
    this._graphLayoutAnimationFrame = null;
    this._graphLayoutSettleFrame = null;
    this._graphLayoutSchedule = null;
    this._graphLayoutObserveCard = null;
    if (this._graphLayoutResizeHandler) {
      window.removeEventListener("resize", this._graphLayoutResizeHandler);
      window.visualViewport?.removeEventListener("resize", this._graphLayoutResizeHandler);
    }
    this._graphLayoutResizeHandler = null;
  }

  _numericCardRequiredHeight(card) {
    const root = card?.shadowRoot;
    const cardElement = root?.querySelector("ha-card.sgc-card");
    const plotWrap = root?.querySelector(".sgc-plot-wrap");
    if (!cardElement || !plotWrap) return 0;
    const cardStyle = getComputedStyle(cardElement);
    const pixels = (value) => Number.parseFloat(value) || 0;
    let required = pixels(cardStyle.paddingTop)
      + pixels(cardStyle.paddingBottom)
      + pixels(cardStyle.borderTopWidth)
      + pixels(cardStyle.borderBottomWidth);

    // Fill-height mode is deliberately allowed to shrink the plot, so the
    // card's outer scrollHeight is not a reliable intrinsic measurement. Sum
    // every in-flow section instead. In particular, a wrapping detail legend
    // can overflow its flex allocation without changing the outer card box.
    for (const section of cardElement.children) {
      const style = getComputedStyle(section);
      if (
        section === plotWrap
        || style.display === "none"
        || style.position === "absolute"
        || style.position === "fixed"
      ) continue;
      required += Math.max(
        section.getBoundingClientRect().height,
        section.scrollHeight || 0,
      ) + pixels(style.marginTop) + pixels(style.marginBottom);
    }

    const plotStyle = getComputedStyle(plotWrap);
    required += 200 + pixels(plotStyle.marginTop) + pixels(plotStyle.marginBottom);
    return Math.ceil(required);
  }

  _fitStateTimelineCard(card) {
    const root = card?.shadowRoot;
    const plotWrap = root?.querySelector(".sgc-plot-wrap");
    if (!plotWrap) return;
    const plotRect = plotWrap.getBoundingClientRect();
    if (!plotRect.height) return;

    // height:auto in Statistics Graph Chart Card retains its generic 200px
    // plot minimum. State timelines only need enough plot space for their
    // rendered rows and x-axis. Measure those rendered primitives so wrapped
    // entity labels and comparison rows are accounted for exactly.
    let rowsBottom = 0;
    const cells = plotWrap.querySelectorAll(".sgc-stl-cell");
    for (const element of cells) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      rowsBottom = Math.max(rowsBottom, rect.bottom - plotRect.top);
    }
    if (!rowsBottom) return;

    let axisTextHeight = 0;
    for (const element of plotWrap.querySelectorAll("svg text")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.top < plotRect.top + rowsBottom - 1) continue;
      axisTextHeight = Math.max(axisTextHeight, rect.height);
    }

    const height = Math.max(48, Math.ceil(rowsBottom + axisTextHeight + 12));
    if (card.__advancedHistoryStateHeight === height) return;
    const config = card.__advancedHistoryConfig;
    if (!config || config.chart_mode !== "state_timeline") return;
    card.__advancedHistoryStateHeight = height;
    const fittedConfig = { ...config, height };
    card.__advancedHistoryConfig = fittedConfig;
    card.setConfig(fittedConfig);
  }

  _configureDynamicGraphLayout(host, hasNumeric, hasState) {
    const configuredNumericHeight = this._cardOptions("timeline").height;
    const autoNumericHeight = hasNumeric && (
      configuredNumericHeight == null || configuredNumericHeight === "auto"
    );
    host.classList.toggle("dynamic-numeric", autoNumericHeight);
    host.classList.toggle("has-state-graph", autoNumericHeight && hasState);
    if (!autoNumericHeight) {
      host.style.removeProperty("height");
      host.style.removeProperty("min-height");
      host.style.removeProperty("--numeric-graph-height");
    }
    const resize = () => {
      if (!this.isConnected || this.shadowRoot?.getElementById("charts") !== host) return;
      for (const card of this._graphCards || []) {
        this._applyComparisonSeriesPeriodLabels?.(card);
      }
      this._syncAxisVisibilityButtons?.();
      if (hasState) {
        for (const stateCard of host.querySelectorAll(".state-graph > statistics-graph-chart-card")) {
          this._fitStateTimelineCard(stateCard);
        }
      }
      if (!autoNumericHeight) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const controller = this.shadowRoot?.getElementById("date-controller");
      const controllerRect = controller?.getBoundingClientRect?.();
      const controllerBottom = Number.parseFloat(
        controller ? getComputedStyle(controller).bottom : "",
      );
      const controllerTop = Number.isFinite(controllerBottom) && controllerRect?.height > 0
        ? viewportHeight - controllerBottom - controllerRect.height
        : controllerRect?.top;
      const bottom = this._datePickerAutoHide
        ? viewportHeight
        : controllerRect?.height > 0
          ? Math.min(viewportHeight, controllerTop)
          : viewportHeight;
      const top = Math.max(0, host.getBoundingClientRect().top);
      const available = Math.max(240, Math.floor(bottom - top - 16));
      const numericShell = host.querySelector(".graph-shell.numeric-graph");
      const numericCard = numericShell?.querySelector(CARD_TAG);
      const cardRoot = numericCard?.shadowRoot;
      const cardElement = cardRoot?.querySelector("ha-card.sgc-card");
      const detailLegend = cardRoot?.querySelector(".sgc-detail-legend");
      const observe = (element) => {
        if (
          !element
          || !this._graphLayoutResizeObserver
          || this._graphLayoutObservedElements?.has(element)
        ) return;
        this._graphLayoutResizeObserver.observe(element);
        this._graphLayoutObservedElements?.add(element);
      };
      observe(cardElement);
      observe(detailLegend);
      const numericRequirement = this._numericCardRequiredHeight(numericCard);
      const layoutHeight = this._dashboardCardMode
        ? Math.max(240, numericRequirement)
        : available;
      if (hasState) {
        host.style.removeProperty("height");
        // Do not give the grid a viewport-sized minimum: an auto state row is
        // otherwise allowed to absorb that free space and stops being natural
        // height. The explicit numeric row owns the remaining viewport space.
        host.style.removeProperty("min-height");
        const stateShell = host.querySelector(".graph-shell.state-graph");
        const stateHeight = Math.ceil(stateShell?.getBoundingClientRect().height || 0);
        const numericHeight = `${Math.max(
          240,
          layoutHeight - stateHeight - 16,
          numericRequirement,
        )}px`;
        if (host.style.getPropertyValue("--numeric-graph-height") !== numericHeight) {
          host.style.setProperty("--numeric-graph-height", numericHeight);
        }
      } else {
        host.style.removeProperty("min-height");
        host.style.removeProperty("--numeric-graph-height");
        const next = `${Math.max(layoutHeight, numericRequirement)}px`;
        if (host.style.height !== next) host.style.height = next;
      }
    };
    const schedule = () => {
      if (this._graphLayoutAnimationFrame) return;
      this._graphLayoutAnimationFrame = requestAnimationFrame(() => {
        this._graphLayoutAnimationFrame = null;
        resize();
        // The card rebuilds its SVG and legend asynchronously. A second frame
        // catches the resulting flex layout without an open-ended timer loop.
        if (this._graphLayoutSettleFrame) cancelAnimationFrame(this._graphLayoutSettleFrame);
        this._graphLayoutSettleFrame = requestAnimationFrame(() => {
          this._graphLayoutSettleFrame = null;
          resize();
        });
      });
    };
    this._graphLayoutResizeHandler = schedule;
    this._graphLayoutSchedule = schedule;
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    if (typeof ResizeObserver !== "undefined") {
      this._graphLayoutResizeObserver = new ResizeObserver(schedule);
      this._graphLayoutObservedElements = new WeakSet();
      const content = host.closest(".content");
      if (content) {
        this._graphLayoutResizeObserver.observe(content);
        this._graphLayoutObservedElements.add(content);
      }
    }
    if (typeof MutationObserver !== "undefined") {
      this._graphLayoutMutationObserver = new MutationObserver((mutations) => {
        // SGCC rewrites tooltip rows continuously while the pointer moves.
        // Relabel those new text nodes in this mutation microtask, before the
        // browser can paint SGCC's generic comparison name for one frame.
        this._applyComparisonLabelsForMutations(mutations);
        schedule();
      });
      this._graphLayoutObservedRoots = new WeakSet();
    }
    this._graphLayoutObserveCard = (card) => {
      const observeRoot = () => {
        const root = card?.shadowRoot;
        if (!root || this._graphLayoutObservedRoots?.has(root)) return Boolean(root);
        this._guardDashboardLegendLayout(card);
        this._graphLayoutMutationObserver?.observe(root, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        this._graphLayoutObservedRoots?.add(root);
        schedule();
        return true;
      };
      if (!observeRoot()) requestAnimationFrame(observeRoot);
      card?.updateComplete?.then(() => {
        observeRoot();
        schedule();
      });
    };
    resize();
    schedule();
  }

  _applyComparisonLabelsForMutations(mutations) {
    const cards = new Set();
    for (const mutation of mutations || []) {
      const card = mutation?.target?.getRootNode?.()?.host;
      if (card) cards.add(card);
    }
    for (const card of cards) this._applyComparisonSeriesPeriodLabels?.(card);
  }

  _guardDashboardLegendLayout(card) {
    if (!this._dashboardCardMode || card?.__advancedHistoryLegendLayoutGuard) return;
    const root = card?.shadowRoot;
    if (!root) return;
    const lock = (event) => {
      if (!event.target?.closest?.(".sgc-detail-legend-entity, .sgc-legend-item")) return;
      this._lockDashboardCardLayout?.();
    };
    // Lock before SGCC handles the click and redraws its plot/legend. Waiting
    // for ResizeObserver is too late because Lovelace can already have seen
    // the transient size and repositioned the dashboard.
    root.addEventListener("pointerdown", lock, true);
    root.addEventListener("click", (event) => {
      lock(event);
      if (event.target?.closest?.(".sgc-detail-legend-entity, .sgc-legend-item")) {
        queueMicrotask(() => this._syncDashboardSgccVisibilityFromCards?.());
      }
    }, true);
    card.__advancedHistoryLegendLayoutGuard = true;
  }

  _applyDashboardGraphBackground(card, config) {
    if (!this._dashboardCardMode || !card?.style) return;
    const transparent = String(config?.card_background_color || "")
      .trim()
      .toLowerCase() === "transparent";
    // Do not make the theme surface variables transparent. SGCC also uses
    // them for floating UI such as graph and pie tooltips and the date picker
    // panel. Transparency is deliberately scoped to the card/plot below.
    for (const property of ["--ha-card-background", "--card-background-color"]) {
      card.style.removeProperty(property);
    }

    const root = card.shadowRoot;
    if (!root) return;
    const selector = "style[data-advanced-history-transparent-sgcc]";
    const existing = root.querySelector?.(selector);
    if (!transparent) {
      existing?.remove?.();
      return;
    }
    if (existing) return;

    const ownerDocument = card.ownerDocument || root.ownerDocument;
    const style = ownerDocument?.createElement?.("style");
    if (!style) return;
    style.dataset.advancedHistoryTransparentSgcc = "";
    // SGCC applies its card background inside its own shadow root. Keep those
    // surfaces transparent so AHC's themed background remains visible. Only
    // the colour component is overridden, preserving any configured image.
    style.textContent = `
      .sgc-card,
      .sgc-plot-wrap,
      .sgc-plot {
        background-color: transparent !important;
      }
      .sgc-card {
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
    `;
    root.append?.(style);
  }

  _axisLegendEntries(axis) {
    const entries = [];
    for (const card of this._graphCards || []) {
      const root = card?.shadowRoot;
      const entities = card?._entities;
      if (!root || !Array.isArray(entities)) continue;

      // SGCC renders either its detailed or compact legend depending on the
      // available width. Use whichever is active and address its entries with
      // the same stable id SGCC assigns to each configured main series.
      const detailed = [...root.querySelectorAll(".sgc-detail-legend-entity[data-id]")];
      const compact = [...root.querySelectorAll(".sgc-legend-item[data-id]")];
      const rendered = detailed.length ? detailed : compact;
      const byId = new Map(rendered.map((entry) => [entry.dataset.id, entry]));

      entities.forEach((entity, index) => {
        if (!entity || entity._compareOf != null) return;
        const entityAxis = entity.y_axis === "secondary" ? "secondary" : "primary";
        if (entityAxis !== axis) return;
        const entityId = entity.entity || entity.statistic_id;
        const entry = entityId ? byId.get(`${entityId}__${index}`) : null;
        if (entry) entries.push(entry);
      });
    }
    return entries;
  }

  _legendEntryHidden(entry) {
    return Boolean(
      entry?.classList?.contains("legend-hidden")
      || entry?.classList?.contains("hidden")
    );
  }

  _syncAxisVisibilityButtons() {
    for (const [axis, id] of [["primary", "toggle-y1-visibility"], ["secondary", "toggle-y2-visibility"]]) {
      const entries = this._axisLegendEntries(axis);
      const allHidden = entries.length > 0
        && entries.every((entry) => this._legendEntryHidden(entry));
      const button = this.shadowRoot?.getElementById(id);
      if (!button) continue;
      button.classList.toggle("all-hidden", allHidden);
      button.setAttribute("aria-pressed", String(!allHidden));
    }
  }

  _toggleAxisLegendVisibility(axis) {
    const entries = this._axisLegendEntries(axis);
    if (!entries.length) return;
    const hide = entries.some((entry) => !this._legendEntryHidden(entry));
    for (const entry of entries) {
      if (this._legendEntryHidden(entry) !== hide) entry.click();
    }
    this._syncDashboardSgccVisibilityFromCards?.();
    this._syncAxisVisibilityButtons();
  }

  _detailCardOptions(detail = null) {
    if (!detail) {
      const configured = this._effectiveCardOptionsConfig("timeline");
      const hasManualResolution = (
        ["points_per_hour", "group_by"].some(
          (key) => Object.prototype.hasOwnProperty.call(configured || {}, key),
        )
        || configured?.show_pph_picker === true
        || configured?.show_group_by_picker === true
      );
      return {
        auto_scale_points: hasManualResolution
          ? false
          : this.config.large_range_automatic_detail !== false,
      };
    }
    if (detail.automatic) return { auto_scale_points: true };
    return {
      auto_scale_points: false,
      group_by: detail.groupBy,
      show_group_by_picker: true,
    };
  }

  _hasDetailResolutionOverride() {
    const configured = this._effectiveCardOptionsConfig("timeline");
    const configuredResolution = ["auto_scale_points", "points_per_hour", "group_by"].some(
      (key) => Object.prototype.hasOwnProperty.call(configured || {}, key),
    );
    return configuredResolution
      || configured?.show_pph_picker === true
      || configured?.show_group_by_picker === true;
  }

  _resolvedDetailCardOptions(detail = null, cardOptions = {}) {
    // Automatic detail supplies inherited defaults. Explicit integration or
    // chart options are always applied afterwards and therefore win.
    return { ...this._detailCardOptions(detail), ...cardOptions };
  }

  _createGraph(host, series, title, mode, detail = null) {
    const shell = document.createElement("div");
    shell.className = "graph-shell";
    shell.classList.add(mode === "state_timeline" ? "state-graph" : "numeric-graph");
    const sourceIndicator = document.createElement("span");
    sourceIndicator.className = "data-source-indicator pending";
    sourceIndicator.textContent = this._customLocalize("data_source_pending");
    sourceIndicator.title = this._customLocalize("data_source_help");
    const card = document.createElement(CARD_TAG);
    const sourceKey = this._dataSourceCacheKey(mode, series);
    card.__advancedHistorySourceTracker = this._createDataSourceTracker(
      sourceIndicator,
      Boolean(this._periodStore),
      sourceKey
    );
    card.__advancedHistoryChartMode = mode;
    card.__advancedHistorySourceKey = sourceKey;
    this._guardFutureEnergySeries(card);
    const cardOptionsConfig = this._effectiveCardOptionsConfig(mode);
    const cardOptions = { ...this._cardOptions(mode, cardOptionsConfig) };
    if (cardOptions.chart_mode && cardOptions.chart_mode !== mode) {
      delete cardOptions.chart_mode;
    }
    const resolvedCardOptions = this._resolvedDetailCardOptions(detail, cardOptions);
    const entities = series.map((item) => this._entityCardConfig(
      item,
      mode,
      cardOptionsConfig,
    ));
    const runningTotalEntities = new Set();
    const runningTotalExportAggregates = {};
    if (mode !== "state_timeline") {
      const transforms = this._activeSnapshot?.series_transforms || {};
      const axisTransforms = this._activeSnapshot?.running_total_axes || {};
      entities.forEach((configured) => {
        const axis = configured.y_axis === "secondary" ? "secondary" : "primary";
        if (
          configured.attribute == null
          && (
            transforms[configured.entity] === "running_total"
            || axisTransforms[axis] === true
          )
        ) {
          runningTotalEntities.add(configured.entity);
          runningTotalExportAggregates[configured.entity] = {
            defined: Object.prototype.hasOwnProperty.call(configured, "aggregate_func"),
            value: configured.aggregate_func,
          };
          // Let the card calculate accurate per-bucket usage first. Its
          // bucketing hook below then turns those changes into a running total.
          configured.aggregate_func = "change";
        }
      });
    }
    card.__advancedHistoryRunningTotalEntities = runningTotalEntities;
    card.__advancedHistoryRunningTotalExportAggregates = runningTotalExportAggregates;
    const palette = extendedEntityPalette(
      customElements.get(CARD_TAG)?.PALETTE,
      entities.length + entities.reduce(
        (count, configured) => count + graphComparisonRows(configured).length,
        0,
      ),
    );
    const usedColors = new Set();
    if (mode !== "state_timeline") {
      // Older scoped editor sessions could persist the first palette colour
      // independently for Y1 and Y2. Preserve the first resolved occurrence,
      // then return later duplicates to automatic allocation.
      entities.forEach((configured) => {
        const key = graphColorKey(configured.color);
        if (!key) return;
        if (graphColorIsUsed(configured.color, usedColors)) delete configured.color;
        else usedColors.add(key);
      });
      entities.forEach((configured) => {
        for (const comparison of graphComparisonRows(configured)) {
          const key = graphColorKey(comparison?.color);
          if (!key) continue;
          if (graphColorIsUsed(comparison.color, usedColors)) delete comparison.color;
          else usedColors.add(key);
        }
      });
    }
    entities.forEach((configured, index) => {
      // Keep automatically assigned colors stable when entities are toggled.
      // The card otherwise reindexes its palette after disabled entities are
      // removed, causing the remaining series to change color.
      if (
        mode !== "state_timeline"
        && configured.color == null
        && Array.isArray(palette)
        && palette.length
      ) {
        configured.color = nextUnusedGraphColor(palette, usedColors)
          || palette[index % palette.length];
      }
    });
    const enabledEntities = entities.filter((configured) => configured.enabled !== false);
    // Prefer a sole compared Y1 series for the comparison palette. Y2 keeps
    // its entity colour in a dual-axis chart, but becomes the palette owner
    // when every Y1 series is hidden and it is the sole visible Y2 series.
    const enabledPrimaryEntities = enabledEntities.filter(
      (configured) => (configured.y_axis || "primary") === "primary"
    );
    const enabledSecondaryEntities = enabledEntities.filter(
      (configured) => configured.y_axis === "secondary"
    );
    const soleComparedEntity = (
      enabledPrimaryEntities.length === 1
      && Array.isArray(enabledPrimaryEntities[0].compare)
    )
      ? enabledPrimaryEntities[0]
      : enabledPrimaryEntities.length === 0
        && enabledSecondaryEntities.length === 1
        && Array.isArray(enabledSecondaryEntities[0].compare)
        ? enabledSecondaryEntities[0]
        : null;
    if (soleComparedEntity) {
      const comparisonUsedColors = new Set(
        enabledEntities.map((configured) => graphColorKey(configured.color)).filter(Boolean)
      );
      for (const comparison of graphComparisonRows(soleComparedEntity)) {
        const key = graphColorKey(comparison?.color);
        if (key) comparisonUsedColors.add(key);
      }
      this._colorAutomaticComparisons(
        soleComparedEntity,
        palette,
        comparisonUsedColors,
      );
    }
    const hasSecondaryAxis = mode !== "state_timeline"
      && entities.some((entity) => entity.y_axis === "secondary");
    if (mode !== "state_timeline") {
      const promoteBatteryUpperBound = (axis, option) => {
        if (Object.prototype.hasOwnProperty.call(resolvedCardOptions, option)) return;
        const axisEntities = entities.filter((entity) => {
          const entityAxis = entity.y_axis || "primary";
          return entityAxis === axis;
        });
        if (
          !axisEntities.length
          || !axisEntities.every(
            (entity) => this._hass.states[entity.entity]?.attributes?.device_class === "battery",
          )
        ) return;
        const bounds = axisEntities.map((entity) => entity.upper_bound);
        if (
          bounds[0] !== undefined
          && bounds.every((bound) => bound === bounds[0])
        ) {
          resolvedCardOptions[option] = bounds[0];
        }
      };
      promoteBatteryUpperBound("primary", "upper_bound");
      promoteBatteryUpperBound("secondary", "upper_bound_secondary");
    }
    let config = {
      type: `custom:${CARD_TAG}`, card_header: title,
      entities,
      hours_to_show: this._effectiveDefaultHours(),
      ...resolvedCardOptions,
      height: mode === "state_timeline" ? "auto" : (cardOptions.height ?? "auto"),
      chart_mode: mode === "state_timeline"
        ? "state_timeline"
        : (cardOptions.chart_mode ?? mode),
      show_y2_axis: hasSecondaryAxis,
      ...(mode === "state_timeline"
        ? { auto_scale_points: false, group_by: "raw" }
        : {}),
      time_zone: cardOptions.time_zone ?? this._resolvedTimeZone(),
      ...this._panelGraphHourOptions(),
    };
    if (!this._dashboardCardMode) {
      config.show_date_picker = false;
      config.date_picker_group = this._periodSyncGroup?.();
    }
    if (this._dashboardCardMode) {
      config = withoutDashboardWrapperNavigation(config);
      if (config.card_background_color == null || config.card_background_color === "") {
        config.card_background_color = "transparent";
      }
      config.show_date_picker = false;
      const syncGroup = this._dashboardDatePickerGroup?.() || "advanced-history-dashboard";
      for (const key of DASHBOARD_SYNC_GROUP_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(config, key)) config[key] = syncGroup;
      }
      config = this._applyDashboardChildScaleOptions?.(config) || config;
    }
    if (mode !== "state_timeline" && config.height === "auto") {
      // The card's native height:auto implementation only enables its
      // fill-height path when it is hosted in a numeric grid row. AHP owns
      // the containing block, so expose its current size using the same
      // 50px row convention as the card's getCardSize() implementation.
      config.grid_options = {
        ...(cardOptions.grid_options || {}),
        rows: Math.max(1, Math.ceil(host.getBoundingClientRect().height / 50)),
      };
    }
    if (
      mode === "state_timeline"
      && !String(config.card_header || "").trim()
    ) {
      shell.classList.add("state-controls-row");
    }
    try {
      this._applyDashboardGraphBackground(card, config);
      if (detail?.automatic) {
        // Statistics Graph Chart Card persists its on-card Group By and PPH
        // overrides. Apply one picker-free configuration first so the card's
        // public setConfig path clears those overrides before Auto Scale is
        // restored. Picker visibility then follows the Card Defaults YAML.
        card.setConfig({
          ...config,
          show_group_by_picker: false,
          group_by_picker_group: null,
          show_pph_picker: false,
          pph_picker_group: null,
        });
      }
      card.setConfig(config);
      this._applyDashboardGraphBackground(card, config);
      card.__advancedHistoryConfig = config;
      this._setGraphCardHass(card, this._hass);
      shell.append(card, sourceIndicator);
      this._trackDashboardScaleCard?.(card, this._graphCards?.length || 0);
      // Panel chart overrides belong to the current user's chart state. A
      // bookmark loaded from another user's shared library remains read-only;
      // service defaults and More Info entity overrides retain their separate
      // administrator checks.
      if (this._canEditPanelChart()) {
        shell.classList.add("has-card-editor");
        const editorButton = document.createElement("button");
        editorButton.className = "graph-card-editor icon-button";
        editorButton.title = this._customLocalize("graph_settings");
        editorButton.setAttribute("aria-label", editorButton.title);
        editorButton.innerHTML = '<ha-icon icon="mdi:cog-outline"></ha-icon>';
        editorButton.addEventListener(
          "click",
          () => this._openGraphEditor(series, mode, title),
        );
        shell.append(editorButton);
      }
      host.append(shell);
      this._cards.push(card);
      this._graphCards.push(card);
      this._observeRenderedGraphDataSource(card);
      this._syncGraphCardsToPeriod?.();
      this._graphLayoutObserveCard?.(card);
      card.updateComplete?.then(() => {
        this._applyDashboardGraphBackground(card, config);
        if (this._graphCards?.includes(card)) {
          this._syncGraphCardsToPeriod?.();
        }
        this._graphLayoutSchedule?.();
      });
    }
    catch (error) { host.insertAdjacentHTML("beforeend", `<div class="error">${this._escape(error.message || error)}</div>`); }
  }

  _updateGraphHourOptionsInPlace() {
    const hourOptions = this._panelGraphHourOptions();
    for (const card of this._graphCards || []) {
      const current = card.__advancedHistoryConfig;
      if (!current) continue;
      const next = { ...current };
      delete next.graph_start_hour;
      delete next.graph_end_hour;
      Object.assign(next, hourOptions);
      if (
        current.graph_start_hour === next.graph_start_hour
        && current.graph_end_hour === next.graph_end_hour
      ) continue;
      card.__advancedHistoryConfig = next;
      card.setConfig(next);
      this._setGraphCardHass(card, this._hass);
    }
  }

  _largeRangePeriod() {
    const start = this._periodStore?.start;
    const end = this._periodStore?.end;
    const startMs = start?.getTime?.();
    const endMs = end?.getTime?.();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    const hours = (endMs - startMs) / 3_600_000;
    const compare = this._effectiveCompare?.() || "";
    const compareKey = typeof compare === "string" ? compare : JSON.stringify(compare);
    return {
      start,
      end,
      hours,
      key: `${start.toISOString()}|${end.toISOString()}|${compareKey}`,
    };
  }

  _largeRangeDetailProfile() {
    if (this.config.large_range_automatic_detail === false) return null;
    if (this._hasDetailResolutionOverride()) return null;
    const period = this._largeRangePeriod();
    const thresholdDays = Math.max(7, Number(this.config.large_range_detail_threshold_days) || 31);
    if (!period) return null;
    const nextMonth = new Date(period.start);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const calendarMonth = period.start.getDate() === 1
      && period.start.getHours() === 0
      && period.start.getMinutes() === 0
      && Math.abs(period.end.getTime() - (nextMonth.getTime() - 1)) < 7_200_000;
    // The default 31-day threshold represents a calendar month, including
    // February and 30-day months. The normal duration rule remains exact for
    // user-configured thresholds and non-calendar ranges.
    if (
      period.hours < thresholdDays * 24 - 2
      && !(thresholdDays === 31 && calendarMonth)
    ) return null;
    const groupBy = period.hours > 730 * 24
      ? "week"
      : period.hours > 92 * 24
        ? "date"
        : "6h";
    return {
      ...period,
      thresholdDays,
      groupBy,
      automatic: !this._largeRangeFineDetail,
    };
  }

  _largeRangeDetailRenderKey() {
    const profile = this._largeRangeDetailProfile();
    if (!profile) return "off";
    return profile.automatic
      ? "detail|auto"
      : `fine|${profile.groupBy}`;
  }

  _renderLargeRangeDetailBanner(profile = this._largeRangeDetailProfile()) {
    const banner = this.shadowRoot?.getElementById("detail-banner");
    if (!banner) return;
    const dismissalKey = profile
      ? `${profile.automatic ? "automatic" : `fine|${profile.groupBy}`}|${profile.key}`
      : null;
    if (
      this._periodRestoreLoading
      || !profile
      || dismissalKey === this._largeRangeDetailDismissedKey
    ) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }

    const resolution = this._customLocalize(
      `detail_resolution_${profile.automatic ? "auto" : profile.groupBy}`
    );
    const text = profile.automatic
      ? this._customLocalize("automatic_detail_active", { resolution })
      : this._customLocalize("fine_detail_warning", { resolution });
    const buttonText = profile.automatic
      ? this._customLocalize("show_fine_detail")
      : this._customLocalize("use_automatic_detail");
    banner.className = `detail-banner${profile.automatic ? "" : " warning"}`;
    banner.innerHTML = `
      <ha-icon icon="${profile.automatic ? "mdi:speedometer" : "mdi:alert-outline"}"></ha-icon>
      <span>${this._escape(text)}</span>
      <ha-button appearance="plain">${this._escape(buttonText)}</ha-button>
      <button class="detail-dismiss" type="button" aria-label="${this._escape(
        this._localize("ui.common.close", "Dismiss")
      )}" title="${this._escape(this._localize("ui.common.close", "Dismiss"))}">
        <ha-icon icon="mdi:close"></ha-icon>
      </button>`;
    banner.hidden = false;
    banner.querySelector("ha-button")?.addEventListener("click", () => {
      this._largeRangeFineDetail = profile.automatic;
      this._largeRangeDetailStateKey = this._largeRangeDetailRenderKey();
      this._renderGraphs();
    });
    banner.querySelector(".detail-dismiss")?.addEventListener("click", () => {
      this._largeRangeDetailDismissedKey = dismissalKey;
      banner.hidden = true;
      banner.replaceChildren();
    });
  }

  _canEditPanelChart() {
    return Boolean(this.config.settings_path) && !this._loadedExternalBookmark;
  }

  _createDataSourceTracker(indicator, active = true, sourceKey = null) {
    const sources = new Set();
    const sourceCache = this._graphDataSources || DATA_SOURCE_CACHE;
    const cachedSource = sourceKey ? sourceCache.get(sourceKey) : null;
    if (cachedSource === "mixed") {
      sources.add("history");
      sources.add("statistics");
    } else if (cachedSource === "history" || cachedSource === "statistics") {
      sources.add(cachedSource);
    }
    let enabled = active;
    let cyclePending = false;
    const render = () => {
      const source = !sources.size ? "pending" : sources.size > 1 ? "mixed" : [...sources][0];
      if (sourceKey && source !== "pending") {
        sourceCache.delete(sourceKey);
        sourceCache.set(sourceKey, source);
        while (sourceCache.size > 20) {
          sourceCache.delete(sourceCache.keys().next().value);
        }
      }
      indicator.className = `data-source-indicator ${source}`;
      const label = this._customLocalize(
        source === "pending"
          ? "data_source_pending"
          : source === "mixed"
            ? "data_source_mixed"
            : source === "statistics"
              ? "data_source_statistics"
              : "data_source_history",
      );
      indicator.textContent = this._dashboardCardMode && source === "statistics"
        ? "LTS"
        : label;
      indicator.setAttribute("aria-label", label);
    };
    const tracker = {
      get source() {
        if (!sources.size) return "pending";
        return sources.size > 1 ? "mixed" : [...sources][0];
      },
      reset: () => {
        sources.clear();
        cyclePending = false;
        if (sourceKey) sourceCache.delete(sourceKey);
        render();
      },
      beginCycle: () => {
        // Keep showing the last confirmed source while the card processes a
        // new Energy range. The card may satisfy the new range from its own
        // cache without issuing another websocket request; clearing here left
        // the indicator stuck on "Determining source…" even though the graph
        // had finished rendering. A new request still replaces the retained
        // source through cyclePending in record().
        cyclePending = true;
        render();
      },
      activate: () => {
        enabled = true;
        cyclePending = Boolean(sources.size);
        render();
      },
      record: (source) => {
        if (!enabled || !source) return;
        if (cyclePending) {
          sources.clear();
          cyclePending = false;
        }
        if (sources.has(source)) return;
        sources.add(source);
        render();
      },
    };
    render();
    return tracker;
  }

  _observeRenderedGraphDataSource(card) {
    const record = () => this._recordRenderedGraphDataSource(card);
    record();
    if (typeof MutationObserver === "undefined" || !card?.shadowRoot) return;
    card.__advancedHistorySourceObserver?.disconnect?.();
    const observer = new MutationObserver(record);
    observer.observe(card.shadowRoot, { childList: true, subtree: true });
    card.__advancedHistorySourceObserver = observer;
  }

  _recordRenderedGraphDataSource(card) {
    for (const source of renderedGraphDataSources(card)) {
      card.__advancedHistorySourceTracker?.record?.(source);
    }
  }

  _dataSourceCacheKey(mode, series) {
    const start = this._periodStore?.start;
    const end = this._periodStore?.end;
    const startKey = Number.isFinite(start?.getTime?.()) ? start.toISOString() : "";
    const endKey = Number.isFinite(end?.getTime?.()) ? end.toISOString() : "";
    const compare = this._effectiveCompare?.() || "";
    const compareKey = typeof compare === "string" ? compare : JSON.stringify(compare);
    return [
      mode,
      series.map((item) => item.key).join("\u001f"),
      startKey,
      endKey,
      compareKey,
      this._excludeY2Comparison ? "exclude-y2-comparison" : "compare-y2",
    ].join("\u001e");
  }

  _guardFutureEnergySeries(card) {
    const shouldTrackLive = card?._isLiveTrackingNeeded;
    if (typeof shouldTrackLive === "function") {
      card._isLiveTrackingNeeded = (...args) => {
        // The card otherwise relocates the live state to the end of a future
        // visible window, which its bucketing turns into a flat series.
        const start = this._panelDayPeriod?.()?.start
          || card._energyStart
          || this._periodStore?.start;
        const startTime = start instanceof Date
          ? start.getTime()
          : new Date(start).getTime();
        if (Number.isFinite(startTime) && startTime > Date.now()) return false;
        return shouldTrackLive.apply(card, args);
      };
    }

    const bucketSeries = card?._bucketSeries;
    if (typeof bucketSeries !== "function") return;
    card._bucketSeries = (...args) => {
      let result = bucketSeries.apply(card, args);
      const entity = args[1];
      const entityId = entity?.entity || entity?.statistic_id;
      if (
        card.__advancedHistoryRunningTotalEntities?.has(entityId)
        && Array.isArray(result?.points)
      ) {
        // SGCC can align lower-resolution comparison data by inserting null
        // buckets between every real bucket. A running total is unchanged in
        // those intervals, so carry it across interior nulls; leave leading
        // and trailing nulls intact so unavailable and future data stay empty.
        result = cumulativeRunningTotalSeries(result, {
          carryInteriorNulls: entity?._compareOf != null,
        });
      }
      const windowStart = Number(args[3]);
      const windowEnd = Number(args[4]);
      const offsetHours = Number(entity?.offset);
      const now = Date.now();
      const currentWindowExtendsIntoFuture = (
        Number.isFinite(windowStart)
        && Number.isFinite(windowEnd)
        && windowStart <= now
        && now < windowEnd
      );

      if (
        card?._config?.chart_mode === "timeline"
        && card?._config?.stacked === true
        && entity?._compareOf == null
        && (!Number.isFinite(offsetHours) || offsetHours === 0)
        && currentWindowExtendsIntoFuture
        && Array.isArray(result?.points)
      ) {
        // TODO: Remove this compatibility workaround once Statistics Graph
        // Chart Card fixes stacked live endpoints in future-visible periods.
        // Live states arrive at slightly different times for each entity. If
        // the visible window continues into the future, stacked fills expose
        // those different endpoints as diagonal wedges. Carry every current
        // series to the same minute boundary so the stack ends vertically,
        // while the remainder of the requested future axis stays empty.
        const cutoff = Math.floor(now / 60_000) * 60_000;
        const currentPoints = result.points.filter((point) => point?.t <= now);
        const lastPoint = currentPoints.at(-1);
        const points = currentPoints.filter((point) => point?.t < cutoff);
        if (lastPoint?.v != null) {
          points.push({ ...lastPoint, t: cutoff });
        }
        result = { ...result, points };
      }

      if (
        card?._config?.chart_mode === "state_timeline"
        && entity?._compareOf == null
        && (!Number.isFinite(offsetHours) || offsetHours === 0)
        && Number.isFinite(windowStart)
        && Number.isFinite(windowEnd)
      ) {
        if (windowStart <= now && now < windowEnd && Array.isArray(result?.points)) {
          const points = result.points.filter((point) => point?.t <= now);
          const lastPoint = points.at(-1);
          if (lastPoint?.v != null) {
            // State-timeline rendering carries its final value to the visible
            // window end. A null transition at now closes that segment while
            // leaving the requested future portion of the axis visible.
            points.push({ ...lastPoint, t: now, v: null });
          }
          result = { ...result, points };
        }
      }

      if (
        entity?._compareOf == null
        || !Number.isFinite(offsetHours)
        || offsetHours <= 0
        || !Number.isFinite(windowEnd)
      ) return result;

      const shiftedNow = Date.now() + offsetHours * 60 * 60 * 1000;
      if (shiftedNow >= windowEnd) return result;
      // A partial current period compared in a future window must stop at its
      // shifted "now", rather than carrying its last bucket to the window end.
      const beforeShiftedNow = (point) => point?.t <= shiftedNow;
      return {
        ...result,
        points: result?.points?.filter(beforeShiftedNow) || [],
        maSeries: result?.maSeries?.map((series) => ({
          ...series,
          points: series.points?.filter(beforeShiftedNow) || [],
        })) || result?.maSeries,
      };
    };
  }

  _beginGraphDataSourceCycle() {
    for (const card of this._graphCards || []) {
      card.__advancedHistorySourceTracker?.beginCycle?.();
    }
  }

  _activateGraphDataSourceTracking() {
    for (const card of this._graphCards || []) {
      card.__advancedHistorySourceTracker?.activate?.();
      // SGCC can satisfy a reconnect entirely from its internal data cache,
      // producing no request for the hass proxy to observe.
      this._recordRenderedGraphDataSource(card);
      if (this._hass) {
        // Recreate the instrumented wrapper so reconnecting a cached panel
        // gives the card a genuinely new hass value. This makes the card
        // request its data again after tracking has been activated.
        card.__advancedHistoryHassSource = null;
        card.__advancedHistoryInstrumentedHass = null;
        this._setGraphCardHass(card, this._hass);
        card.requestUpdate?.("hass");
      }
    }
  }

  _requestDataSource(message) {
    const type = typeof message === "string" ? message : message?.type;
    if (typeof type !== "string") return null;
    if (type.includes("statistics_during_period")) return "statistics";
    if (
      type.includes("history/period")
      || type.includes("history_during_period")
      || type.includes("history/stream")
    ) return "history";
    return null;
  }

  _dataSourceResponseHasPoints(response) {
    if (response == null) return false;
    if (Array.isArray(response)) {
      return response.some((item) => {
        if (item && typeof item === "object") {
          return this._dataSourceResponseHasPoints(item);
        }
        return item != null;
      });
    }
    if (typeof response !== "object") return false;

    const pointFields = [
      "state",
      "s",
      "last_changed",
      "lu",
      "start",
      "end",
      "mean",
      "min",
      "max",
      "sum",
    ];
    if (pointFields.some((field) => Object.prototype.hasOwnProperty.call(response, field))) {
      return true;
    }

    return Object.values(response).some(
      (value) => value && typeof value === "object"
        && this._dataSourceResponseHasPoints(value)
    );
  }

  _setGraphCardHass(card, hass) {
    const tracker = card?.__advancedHistorySourceTracker;
    if (!card || !tracker || !hass) {
      if (card) card.hass = hass;
      return;
    }
    if (card.__advancedHistoryHassSource === hass && card.__advancedHistoryInstrumentedHass) {
      card.hass = card.__advancedHistoryInstrumentedHass;
      return;
    }

    const recordResponse = (message, response) => {
      const source = this._requestDataSource(message);
      const normalized = source === "history"
        ? normalizeCompactHistoryResponse(response)
        : response;
      if (source && this._dataSourceResponseHasPoints(normalized)) {
        tracker.record(source);
      }
      return normalized;
    };
    const trackResult = (message, result) => {
      if (!this._requestDataSource(message)) return result;
      if (result && typeof result.then === "function") {
        return result.then((response) => recordResponse(message, response));
      }
      return recordResponse(message, result);
    };
    const connection = hass.connection ? new Proxy(hass.connection, {
      get: (target, property) => {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (!["subscribeMessage", "sendMessage", "sendMessagePromise"].includes(property)) {
          return value.bind(target);
        }
        return (...args) => {
          const message = args.find((argument) => argument?.type);
          if (property === "subscribeMessage" && this._requestDataSource(message)) {
            const callbackIndex = args.findIndex((argument) => typeof argument === "function");
            if (callbackIndex !== -1) {
              const callback = args[callbackIndex];
              args[callbackIndex] = (...callbackArgs) => {
                const normalizedArgs = callbackArgs.map(
                  (response) => recordResponse(message, response)
                );
                return callback(...normalizedArgs);
              };
            }
          }
          const result = value.apply(target, args);
          return property === "sendMessagePromise"
            ? trackResult(message, result)
            : result;
        };
      },
    }) : null;
    const instrumented = new Proxy(hass, {
      get: (target, property) => {
        if (property === "connection" && connection) return connection;
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (property === "callWS") {
          return (message) => {
            return trackResult(message, value.call(target, message));
          };
        }
        if (property === "callApi") {
          return (...args) => {
            const message = args.find(
              (argument) => typeof argument === "string" && argument.includes("history/period")
            );
            return trackResult(message, value.apply(target, args));
          };
        }
        return value.bind(target);
      },
    });
    card.__advancedHistoryHassSource = hass;
    card.__advancedHistoryInstrumentedHass = instrumented;
    card.hass = instrumented;
  }

  _resolvedTimeZone() {
    const preference = this._hass?.locale?.time_zone;
    const serverTimeZone = this._hass?.config?.time_zone;
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

  _seriesKey(entity, attribute = null) {
    return attribute ? `${entity}::${attribute}` : entity;
  }

  _seriesDescriptor(value) {
    if (typeof value === "string") {
      return { entity: value, attribute: null, key: value };
    }
    const entity = value?.entity || value?.statistic_id || "";
    const attribute = value?.attribute || null;
    return {
      entity,
      attribute,
      key: value?.key || this._seriesKey(entity, attribute),
    };
  }

  _usesSingleGraph(series) {
    if (!this._activeSnapshot?.single_graph) return false;
    const hasNumeric = series.some((item) => this._isNumeric(item));
    const hasState = series.some((item) => !this._isNumeric(item));
    return !(hasNumeric && hasState);
  }

  _nativeHistorySeries(entity) {
    const state = this._hass.states[entity];
    return nativeHistoryAttributes(entity, state).map((attribute) => ({
      entity,
      attribute,
      key: this._seriesKey(entity, attribute),
    }));
  }

  _seriesDescriptors(
    entityIds = this._resolvedEntityIds(),
    entityOptionsConfig = this._effectiveEntityOptionsConfig()
  ) {
    const result = [];
    const seen = new Set();
    const selectedAttributes = this._activeSnapshot?.attribute_selection;
    const explicitlySelected = new Set();
    const add = (descriptor) => {
      const normalized = this._seriesDescriptor(descriptor);
      if (!normalized.entity || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      result.push(normalized);
    };

    for (const entity of entityIds) {
      const selection = selectedAttributes?.[entity];
      if (Array.isArray(selection) && selection.length) {
        explicitlySelected.add(entity);
        for (const value of selection) {
          if (value === "state") add(entity);
          else if (typeof value === "string" && value) {
            add({ entity, attribute: value });
          }
        }
        continue;
      }
      const nativeSeries = this._nativeHistorySeries(entity);
      if (nativeSeries.length) nativeSeries.forEach(add);
      else add(entity);
    }

    // Attribute rows created in the card's visual editor are stored with a
    // series-specific key. This permits several attributes from the same
    // entity without collapsing them into one entity override.
    for (const [key, options] of Object.entries(entityOptionsConfig || {})) {
      if (!options || typeof options !== "object" || !options.attribute) continue;
      const entity = key.includes("::") ? key.slice(0, key.indexOf("::")) : key;
      if (!entityIds.includes(entity)) continue;
      if (explicitlySelected.has(entity)) continue;
      add({ entity, attribute: options.attribute });
    }
    return result;
  }

  _attributeValue(state, attribute) {
    if (!state || !attribute) return state?.state;
    return attribute.split(".").reduce(
      (value, part) => value == null ? undefined : value[part],
      state.attributes
    );
  }

  _isNumeric(value) {
    const { entity, attribute } = this._seriesDescriptor(value);
    const state = this._hass.states[entity];
    const domain = entity.split(".")[0];
    if (attribute) {
      if (NATIVE_HISTORY_ATTRIBUTES[domain]?.includes(attribute)) return true;
      const attributeValue = this._attributeValue(state, attribute);
      return attributeValue !== "" && Number.isFinite(Number(attributeValue));
    }
    if (["counter", "input_number", "number"].includes(domain)) return true;
    if (state?.attributes?.state_class != null || state?.attributes?.unit_of_measurement != null) {
      return true;
    }
    if (
      domain === "sensor"
      && state?.attributes?.device_class
      && !["date", "enum", "timestamp"].includes(state.attributes.device_class)
    ) {
      return true;
    }
    if (["date", "datetime", "time"].includes(domain)) return false;
    return state && state.state !== "" && Number.isFinite(Number(state.state));
  }

  _attributeSeriesName(entity, attribute) {
    const entityName = this._entityName(entity);
    return `${entityName} ${this._attributeDisplayName(entity, attribute)}`;
  }

  _attributeDisplayName(entity, attribute) {
    return historyAttributeDisplayName(this._hass, entity, attribute);
  }

  _entityCardConfig(
    value,
    mode,
    cardOptionsConfig = null,
    entityOptionsConfig = this._effectiveEntityOptionsConfig()
  ) {
    cardOptionsConfig ||= this._effectiveCardOptionsConfig(mode);
    const descriptor = this._seriesDescriptor(value);
    const { entity, attribute, key } = descriptor;
    const entitySavedOptions = entityOptionsConfig?.[entity];
    const seriesSavedOptions = attribute ? entityOptionsConfig?.[key] : null;
    const entityOptions = {
      ...automaticEntityOptions(this._hass.states[entity], mode),
      ...this._defaultEntityOptions(cardOptionsConfig, mode),
    };
    const applySavedOptions = (saved) => {
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
      for (const [option, value] of Object.entries(saved)) {
        if (option !== ENTITY_OPTION_REMOVALS) entityOptions[option] = value;
      }
      for (const option of saved[ENTITY_OPTION_REMOVALS] || []) delete entityOptions[option];
    };
    applySavedOptions(entitySavedOptions);
    applySavedOptions(seriesSavedOptions);
    if (attribute) {
      entityOptions.attribute = attribute;
      // Let the card derive its own attribute label so card-level naming
      // options, including area names, remain effective. Remove only the
      // legacy name Advanced History generated; preserve custom names.
      if (entityOptions.name === this._attributeSeriesName(entity, attribute)) {
        delete entityOptions.name;
      }
      const unit = historyAttributeUnit(this._hass, entity);
      if (entityOptions.unit == null && unit != null) entityOptions.unit = unit;
    }
    const enabled = this._enabledResolvedEntityIds?.has(entity) !== false;
    const { compare: compareDefaults, ...options } = entityOptions;
    const activeCompare = this._effectiveCompare();
    let compare = this._withTimeRangeComparisonLayout(
      this._mergeCompareOptions(activeCompare, compareDefaults),
    );
    if (mode !== "state_timeline") {
      delete options.state_map;
      const secondaryAxis = this._y2ResolvedEntityIds?.has(entity);
      options.y_axis = secondaryAxis ? "secondary" : "primary";
      if (secondaryAxis && this._excludeY2Comparison) compare = null;
      return compare == null
        ? { ...options, entity, enabled }
        : { ...options, entity, enabled, compare };
    }
    const stateMap = mergeStateMaps(
      nativeStateMap(this._hass, entity),
      entityOptions.state_map
    );
    const generated = {
      entity,
      ...(stateMap ? { state_map: stateMap } : {}),
    };
    delete options.y_axis;
    return compare == null
      ? { ...options, ...generated, entity, enabled }
      : { ...options, ...generated, entity, enabled, compare };
  }

  _mergeCompareOptions(activeCompare, defaults) {
    if (activeCompare == null || activeCompare === false) return activeCompare;

    const mergeOne = (active, configuredDefaults) => {
      const resolvedDefaults = configuredDefaults
        && typeof configuredDefaults === "object"
        && !Array.isArray(configuredDefaults)
        ? configuredDefaults
        : null;
      if (!resolvedDefaults) return active;
      if (active === true) return { ...resolvedDefaults };
      if (active && typeof active === "object" && !Array.isArray(active)) {
        return { ...resolvedDefaults, ...active };
      }
      return { ...resolvedDefaults, period: active };
    };
    if (Array.isArray(activeCompare)) {
      const defaultRows = Array.isArray(defaults) ? defaults : null;
      return activeCompare.map((active, index) => mergeOne(
        active,
        defaultRows
          ? defaultRows.length === 1
            ? defaultRows[0]
            : defaultRows[index]
          : defaults,
      ));
    }
    return mergeOne(activeCompare, Array.isArray(defaults) ? defaults[0] : defaults);
  }

  _comparisonEditorDefaults(compare) {
    const clean = (configured) => {
      if (!configured || typeof configured !== "object" || Array.isArray(configured)) return {};
      const options = structuredClone(configured);
      // These describe the comparison selected in the Energy picker and must
      // continue to follow that picker rather than becoming entity overrides.
      delete options.period;
      delete options.periods_back;
      if (this._panelTimeRange && options.layout === "sequential") delete options.layout;
      return options;
    };
    const rows = (Array.isArray(compare) ? compare : [compare]).map(clean);
    if (!rows.some((row) => Object.keys(row).length)) return undefined;
    const first = rows[0];
    if (rows.every((row) => this._sameGraphOption(row, first))) return first;
    return rows;
  }

  _withTimeRangeComparisonLayout(compare) {
    // The card's sequential layout places the preceding time slot directly
    // before the selected one. It is meaningful only for a selected day slot.
    if (!this._panelTimeRange || !this._panelDayPeriod?.() || compare == null || compare === false) {
      return compare;
    }
    const withLayout = (value) => {
      if (value === true) return { layout: "sequential" };
      if (typeof value === "string") {
        return value === "previous_period" ? { period: value, layout: "sequential" } : value;
      }
      if (!value || typeof value !== "object" || Array.isArray(value) || value.layout != null) {
        return value;
      }
      if ((value.period ?? "previous_period") !== "previous_period") return value;
      return { ...value, layout: "sequential" };
    };
    return Array.isArray(compare) ? compare.map(withLayout) : withLayout(compare);
  }

  _colorAutomaticComparisons(configured, palette, usedColors = new Set()) {
    if (
      !Array.isArray(this._comparisonState)
      || this._effectiveCompare() !== this._comparisonState
      || !Array.isArray(configured?.compare)
      || !Array.isArray(palette)
      || palette.length < 2
    ) return configured;
    configured.compare = configured.compare.map((comparison, index) => (
      comparison && typeof comparison === "object" && comparison.color == null
        ? {
            ...comparison,
            color: nextUnusedGraphColor(palette, usedColors)
              || palette[index % palette.length],
          }
        : comparison
    ));
    return configured;
  }

  _cardOptions(mode = "timeline", configured = this._effectiveCardOptionsConfig(mode)) {
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) return {};
    const options = { ...configured };
    delete options.entities;
    delete options.energy_date_sync;
    delete options.energy_collection_key;
    if (mode === "state_timeline") delete options.height;
    delete options.hours_to_show;
    delete options.numeric_entities;
    delete options.state_entities;
    return options;
  }

  _defaultEntityOptions(
    cardOptionsConfig = null,
    mode = "timeline",
  ) {
    cardOptionsConfig ||= this._effectiveCardOptionsConfig(mode);
    const defaults = {};
    const applyTemplates = (configured) => {
      const templates = Array.isArray(configured) ? configured : configured ? [configured] : [];
      for (const template of templates) {
        if (!template || typeof template !== "object" || Array.isArray(template)) continue;
        if (template.entity != null || template.statistic_id != null) continue;
        Object.assign(defaults, template);
      }
    };
    applyTemplates(cardOptionsConfig?.entities);
    applyTemplates(
      mode === "state_timeline"
        ? cardOptionsConfig?.state_entities
        : cardOptionsConfig?.numeric_entities,
    );
    return defaults;
  }

  _graphEditorConfig(
    editDefaults = false,
    scopedSeries = null,
    scopedMode = null,
    scopedHeader = null,
  ) {
    const entityIds = this._resolvedEntityIds();
    const entityOptionsConfig = editDefaults ? this.config.entity_options : this._effectiveEntityOptionsConfig();
    const series = this._seriesDescriptors(entityIds, entityOptionsConfig);
    const numeric = series.filter((item) => this._isNumeric(item));
    const editorEntities = Array.isArray(scopedSeries)
      ? scopedSeries
      : this._usesSingleGraph(series)
        ? series
        : (numeric.length ? numeric : series);
    const editorHasNumeric = editorEntities.some((item) => this._isNumeric(item));
    const editorMode = scopedMode || (editorHasNumeric ? "timeline" : "state_timeline");
    const cardOptionsConfig = editDefaults
      ? this._configuredCardOptions(editorMode)
      : this._effectiveCardOptionsConfig(editorMode);
    const editorHeader = scopedHeader
      ?? this._customLocalize(editorHasNumeric ? "numeric_history" : "state_history");
    const cardOptions = this._cardOptions(editorMode, cardOptionsConfig);
    const palette = extendedEntityPalette(
      customElements.get(CARD_TAG)?.PALETTE,
      editorEntities.length,
    );
    this._editorAutoColors = new Map();
    const entities = editorEntities.map((item, index) => {
      const entityConfig = this._entityCardConfig(
        item,
        editorMode,
        cardOptionsConfig,
        entityOptionsConfig,
      );
      const seriesKey = this._seriesDescriptor(item).key;
      if (
        editorMode !== "state_timeline"
        && entityConfig.color == null
        && Array.isArray(palette)
        && palette.length
      ) {
        const color = palette[index % palette.length];
        entityConfig.color = color;
        this._editorAutoColors.set(seriesKey, color);
      }
      return entityConfig;
    });
    return {
      hours_to_show: editDefaults ? Number(this.config.default_hours) || 24 : this._effectiveDefaultHours(),
      ...cardOptions,
      auto_scale_points: editorMode === "state_timeline"
        ? false
        : (cardOptions.auto_scale_points
          ?? (this.config.large_range_automatic_detail !== false)),
      height: editorMode === "state_timeline" ? "auto" : (cardOptions.height ?? "auto"),
      type: `custom:${CARD_TAG}`,
      card_header: cardOptions.card_header ?? editorHeader,
      chart_mode: editorMode === "state_timeline"
        ? "state_timeline"
        : (cardOptions.chart_mode ?? editorMode),
      entities,
      ...(!this._dashboardCardMode ? {
        show_date_picker: false,
        date_picker_group: this._periodSyncGroup?.(),
      } : {}),
    };
  }

  _splitGraphEditorConfig(config, editDefaults = false, editorBase = null) {
    const editorMode = editorBase?.chart_mode === "state_timeline"
      || config?.chart_mode === "state_timeline"
      ? "state_timeline"
      : "timeline";
    const configuredCardOptions = editDefaults
      ? this._configuredCardOptions(editorMode)
      : this._effectiveCardOptionsConfig(editorMode);
    const configuredEntityOptions = editDefaults ? this.config.entity_options : this._effectiveEntityOptionsConfig();
    const integrationConfiguredCardOptions = this._configuredCardOptions(editorMode);
    const integrationCardDefaults = this._cardOptions(editorMode, integrationConfiguredCardOptions);
    if (
      editorMode !== "state_timeline"
      && integrationCardDefaults.auto_scale_points == null
    ) {
      integrationCardDefaults.auto_scale_points =
        this.config.large_range_automatic_detail !== false;
    }
    const integrationEntityDefaults = this.config.entity_options || {};
    const configuredRemovals = this._activeSnapshot?.remove_card_options;
    const typedRemovals = configuredRemovals
      && typeof configuredRemovals === "object"
      && !Array.isArray(configuredRemovals);
    const existingRemovals = editDefaults
      ? []
      : typedRemovals
        ? (editorMode === "state_timeline"
            ? configuredRemovals.state
            : configuredRemovals.numeric)
        : configuredRemovals;
    const removedCardOptions = new Set(
      Array.isArray(existingRemovals) ? existingRemovals : [],
    );
    const protectedKeys = new Set([
      "type", "entities", "energy_date_sync", "energy_collection_key", "hours_to_show",
    ]);
    if (editorMode === "state_timeline") protectedKeys.add("height");
    const cardOptions = {};
    for (const [key, value] of Object.entries(config || {})) {
      if (protectedKeys.has(key) || value === undefined) continue;
      removedCardOptions.delete(key);
      if (editDefaults || !this._sameGraphOption(value, integrationCardDefaults[key])) {
        cardOptions[key] = structuredClone(value);
      }
    }
    if (!editDefaults) {
      for (const key of Object.keys(editorBase || {})) {
        if (
          protectedKeys.has(key)
          || Object.prototype.hasOwnProperty.call(config || {}, key)
          || !Object.prototype.hasOwnProperty.call(integrationCardDefaults, key)
        ) continue;
        // The native editor drops options changed back to its own default.
        // Record that omission so the integration default is removed rather
        // than silently inherited again.
        removedCardOptions.add(key);
        delete cardOptions[key];
      }
    }
    const configuredHasHeader = Object.prototype.hasOwnProperty.call(
      configuredCardOptions || {},
      "card_header"
    );
    const configuredHasMode = Object.prototype.hasOwnProperty.call(
      configuredCardOptions || {},
      "chart_mode"
    );
    const editorSeries = (config?.entities || [])
      .map((row) => typeof row === "string"
        ? this._seriesDescriptor(row)
        : this._seriesDescriptor(row))
      .filter((item) => item.entity);
    const editorHasNumeric = editorSeries.some((item) => this._isNumeric(item));
    const allSeries = this._seriesDescriptors(this._resolvedEntityIds());
    const hasMultipleCharts = !this._usesSingleGraph(allSeries)
      && allSeries.some((item) => this._isNumeric(item))
      && allSeries.some((item) => !this._isNumeric(item));
    const automaticHeader = hasMultipleCharts
      ? this._customLocalize(editorHasNumeric ? "numeric_history" : "state_history")
      : "";
    const automaticMode = editorHasNumeric ? "timeline" : "state_timeline";
    if (!configuredHasHeader && cardOptions.card_header === automaticHeader) {
      delete cardOptions.card_header;
    }
    if (!configuredHasMode && cardOptions.chart_mode === automaticMode) {
      delete cardOptions.chart_mode;
    }
    for (const [key, value] of Object.entries(
      editDefaults ? this._cardOptions(editorMode, configuredCardOptions) : {}
    )) {
      if (value === true && !(key in (config || {}))) cardOptions[key] = false;
    }
    if (editDefaults && configuredCardOptions?.entities !== undefined) {
      cardOptions.entities = structuredClone(configuredCardOptions.entities);
    }

    const editorBaseEntities = new Map();
    for (const raw of editorBase?.entities || []) {
      if (!raw || typeof raw === "string") continue;
      const entity = raw.entity || raw.statistic_id;
      if (!entity) continue;
      editorBaseEntities.set(this._seriesKey(entity, raw.attribute), raw);
    }
    let editorRows = config?.entities || [];
    if (editorBaseEntities.size) {
      const draftEntities = new Map();
      for (const raw of editorRows) {
        if (!raw || typeof raw === "string") continue;
        const entity = raw.entity || raw.statistic_id;
        if (!entity) continue;
        draftEntities.set(this._seriesKey(entity, raw.attribute), raw);
      }
      editorRows = [...editorBaseEntities.entries()].map(([seriesKey, base]) => {
        const row = structuredClone(draftEntities.get(seriesKey) || base);
        if (base.entity != null) {
          row.entity = base.entity;
          delete row.statistic_id;
        } else {
          row.statistic_id = base.statistic_id;
          delete row.entity;
        }
        if (base.attribute != null) row.attribute = base.attribute;
        else delete row.attribute;
        return row;
      });
    }
    const entityOptions = editDefaults ? structuredClone(configuredEntityOptions || {}) : {};
    for (const raw of editorRows) {
      if (!raw || typeof raw === "string") continue;
      const entity = raw.entity || raw.statistic_id;
      if (!entity) continue;
      const seriesKey = this._seriesKey(entity, raw.attribute);
      const options = structuredClone(raw);
      delete options.entity;
      delete options.statistic_id;
      delete options[ENTITY_OPTION_REMOVALS];
      const compareOptions = this._comparisonEditorDefaults(options.compare);
      delete options.compare;
      if (compareOptions !== undefined) options.compare = compareOptions;
      // Target-chip visibility is stored separately with the chart and is
      // applied to generated card entities through the card's native enabled
      // option. Do not turn that transient state into an editor override.
      delete options.enabled;
      const integrationBase = {
        ...automaticEntityOptions(this._hass.states[entity], editorMode),
        ...this._defaultEntityOptions(
          integrationConfiguredCardOptions,
          editorMode,
        ),
        ...(integrationEntityDefaults?.[entity] || {}),
        ...(integrationEntityDefaults?.[seriesKey] || {}),
      };
      delete integrationBase[ENTITY_OPTION_REMOVALS];
      const existingOptions = configuredEntityOptions?.[seriesKey];
      const removedOptions = new Set(
        Array.isArray(existingOptions?.[ENTITY_OPTION_REMOVALS])
          ? existingOptions[ENTITY_OPTION_REMOVALS]
          : [],
      );
      for (const key of Object.keys(options)) removedOptions.delete(key);
      const editorBaseOptions = structuredClone(editorBaseEntities.get(seriesKey) || {});
      delete editorBaseOptions.entity;
      delete editorBaseOptions.statistic_id;
      delete editorBaseOptions.enabled;
      delete editorBaseOptions[ENTITY_OPTION_REMOVALS];
      const baseCompareOptions = this._comparisonEditorDefaults(editorBaseOptions.compare);
      delete editorBaseOptions.compare;
      if (baseCompareOptions !== undefined) editorBaseOptions.compare = baseCompareOptions;
      if (!editDefaults) {
        for (const key of Object.keys(editorBaseOptions)) {
          if (
            !Object.prototype.hasOwnProperty.call(options, key)
            && Object.prototype.hasOwnProperty.call(integrationBase, key)
          ) {
            removedOptions.add(key);
          }
        }
      }
      if (
        !Object.prototype.hasOwnProperty.call(options, "aggregate_func")
        && (integrationBase.aggregate_func ?? CARD_DEFAULT_AGGREGATE) !== CARD_DEFAULT_AGGREGATE
      ) {
        // The card removes values equal to its own default from editor output.
        // Preserve that as an explicit override when our automatic/configured
        // fallback would otherwise select a different aggregation.
        options.aggregate_func = CARD_DEFAULT_AGGREGATE;
      }
      const automaticColor = this._editorAutoColors.get(seriesKey);
      if (
        automaticColor &&
        typeof options.color === "string" &&
        options.color.toLowerCase() === automaticColor.toLowerCase()
      ) {
        delete options.color;
      }
      for (const [key, value] of Object.entries(
        editDefaults
          ? this._defaultEntityOptions(configuredCardOptions, config?.chart_mode)
          : {}
      )) {
        if (value === true && !(key in options)) options[key] = false;
      }
      if (!editDefaults) {
        for (const [key, value] of Object.entries(options)) {
          if (this._sameGraphOption(value, integrationBase[key])) delete options[key];
        }
        if (removedOptions.size) {
          options[ENTITY_OPTION_REMOVALS] = [...removedOptions].sort();
        }
      }
      if (Object.keys(options).length) entityOptions[seriesKey] = options;
      else delete entityOptions[seriesKey];
    }
    return {
      cardOptions,
      cardOptionRemovals: [...removedCardOptions].sort(),
      entityOptions,
    };
  }

  _sameGraphOption(left, right) {
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

  _applyGraphEditorConfig(config, scopedSeries = null, editorBase = null) {
    const {
      cardOptions,
      cardOptionRemovals,
      entityOptions: editedEntityOptions,
    } = this._splitGraphEditorConfig(
      config,
      false,
      editorBase,
    );
    let entityOptions = editedEntityOptions;
    if (Array.isArray(scopedSeries)) {
      entityOptions = structuredClone(this._activeSnapshot?.entity_options || {});
      for (const item of scopedSeries) {
        const descriptor = this._seriesDescriptor(item);
        delete entityOptions[descriptor.key];
        if (!descriptor.attribute) delete entityOptions[descriptor.entity];
      }
      Object.assign(entityOptions, editedEntityOptions);
    }
    const editorMode = editorBase?.chart_mode === "state_timeline"
      || config?.chart_mode === "state_timeline"
      ? "state_timeline"
      : "timeline";
    return this._commitGraphEditorConfig(
      cardOptions,
      cardOptionRemovals,
      entityOptions,
      config,
      editorMode,
    );
  }

  _commitGraphEditorConfig(
    cardOptions,
    cardOptionRemovals,
    entityOptions,
    config,
    editorMode = null,
  ) {
    const defaultHours = Number(config?.hours_to_show) || this._effectiveDefaultHours();
    const compare = this._activeSnapshot?.compare;
    const singleGraph = Boolean(this._activeSnapshot?.single_graph);
    const attributeSelection = this._clone(this._activeSnapshot?.attribute_selection);
    const seriesTransforms = this._clone(this._activeSnapshot?.series_transforms);
    const runningTotalAxes = this._clone(this._activeSnapshot?.running_total_axes);
    const currentCardOptions = this._activeSnapshot?.card_options;
    const currentTypedOptions = currentCardOptions
      && typeof currentCardOptions === "object"
      && !Array.isArray(currentCardOptions)
      && (currentCardOptions.numeric || currentCardOptions.state);
    const typedCardOptions = editorMode == null
      ? this._clone(cardOptions || { numeric: {}, state: {} })
      : currentTypedOptions
        ? this._clone(currentCardOptions)
        : {
            numeric: this._clone(currentCardOptions || {}),
            state: this._clone(currentCardOptions || {}),
          };
    const currentRemovals = this._activeSnapshot?.remove_card_options;
    const currentTypedRemovals = currentRemovals
      && typeof currentRemovals === "object"
      && !Array.isArray(currentRemovals);
    const typedCardOptionRemovals = editorMode == null
      ? this._clone(cardOptionRemovals || { numeric: [], state: [] })
      : currentTypedRemovals
        ? this._clone(currentRemovals)
        : {
            numeric: this._clone(Array.isArray(currentRemovals) ? currentRemovals : []),
            state: this._clone(Array.isArray(currentRemovals) ? currentRemovals : []),
          };
    if (editorMode != null) {
      const variant = editorMode === "state_timeline" ? "state" : "numeric";
      typedCardOptions[variant] = this._clone(cardOptions || {});
      typedCardOptionRemovals[variant] = this._clone(cardOptionRemovals || []);
    }
    this._activeSnapshot = {
      defaults_mode: "overrides",
      card_options: typedCardOptions,
      entity_options: entityOptions,
    };
    if (
      typedCardOptionRemovals.numeric?.length
      || typedCardOptionRemovals.state?.length
    ) {
      this._activeSnapshot.remove_card_options = typedCardOptionRemovals;
    }
    if (defaultHours !== (Number(this.config.default_hours) || 24)) {
      this._activeSnapshot.default_hours = defaultHours;
    }
    if (singleGraph) this._activeSnapshot.single_graph = true;
    if (attributeSelection && Object.keys(attributeSelection).length) {
      this._activeSnapshot.attribute_selection = attributeSelection;
    }
    if (seriesTransforms && Object.keys(seriesTransforms).length) {
      this._activeSnapshot.series_transforms = seriesTransforms;
    }
    if (runningTotalAxes && Object.keys(runningTotalAxes).length) {
      this._activeSnapshot.running_total_axes = runningTotalAxes;
    }
    if (compare !== undefined) this._activeSnapshot.compare = this._clone(compare);
    if (this._hasDetailResolutionOverride()) this._largeRangeFineDetail = false;
    this._recordChange(null, true);
    return { cardOptions, entityOptions, defaultHours };
  }

  _applyGraphEditorVariants(variants) {
    const entityOptions = structuredClone(this._activeSnapshot?.entity_options || {});
    const cardOptions = { numeric: {}, state: {} };
    const cardOptionRemovals = { numeric: [], state: [] };
    let primaryConfig = null;
    for (const variant of variants) {
      const split = this._splitGraphEditorConfig(variant.config, false, variant.initialConfig);
      const key = variant.mode === "state_timeline" ? "state" : "numeric";
      cardOptions[key] = split.cardOptions;
      cardOptionRemovals[key] = split.cardOptionRemovals;
      if (!primaryConfig || key === "numeric") primaryConfig = variant.config;
      for (const item of variant.series) {
        const descriptor = this._seriesDescriptor(item);
        delete entityOptions[descriptor.key];
        if (!descriptor.attribute) delete entityOptions[descriptor.entity];
      }
      Object.assign(entityOptions, split.entityOptions);
    }
    return this._commitGraphEditorConfig(
      cardOptions,
      cardOptionRemovals,
      entityOptions,
      primaryConfig || {},
    );
  }

  async _openGraphEditor(scopedSeries = null, scopedMode = null, scopedHeader = null) {
    const allSeries = this._seriesDescriptors(this._resolvedEntityIds());
    const numeric = allSeries.filter((item) => this._isNumeric(item));
    const states = allSeries.filter((item) => !this._isNumeric(item));
    const combinedEditor = !this._usesSingleGraph(allSeries) && numeric.length && states.length;
    const entries = combinedEditor
      ? [
        {
          key: "numeric",
          mode: this._cardOptions("timeline").chart_mode || "timeline",
          header: this._customLocalize("numeric_history"),
          series: numeric,
        },
        {
          key: "state",
          mode: "state_timeline",
          header: this._customLocalize("state_history"),
          series: states,
        },
      ]
      : [{
        key: scopedMode === "state_timeline" ? "state" : "numeric",
        mode: scopedMode,
        header: scopedHeader,
        series: scopedSeries,
      }];
    for (const entry of entries) {
      entry.initialConfig = this._graphEditorConfig(
        false,
        entry.series,
        entry.mode,
        entry.header,
      );
      entry.styles = `
        #add-entity,
        .edb[data-action="delete"],
        .edup[data-action="duplicate"],
        .cmp-add,
        .cmp-del,
        .cmp-row .f:has(.cmp-period),
        .cmp-row .f:has(.cmp-back),
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
        ${entry.mode === "state_timeline"
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
    const initialEntry = entries.find((entry) => entry.mode === scopedMode) || entries[0];
    const variantSpecificKeys = new Set([
      "entities", "chart_mode", "height", "group_by", "auto_scale_points", "points_per_hour",
      "show_pph_picker", "pph_picker_position", "pph_picker_group",
      "show_group_by_picker", "group_by_picker_position", "group_by_picker_group",
    ]);
    await openCardEditorDialog({
      hass: this._hass,
      container: this,
      initialConfig: initialEntry.initialConfig,
      title: this._customLocalize("graph_settings"),
      note: this._customLocalize("graph_editor_note"),
      labels: {
        loading: this._localize("ui.common.loading", "Loading"),
        cancel: this._localize("ui.common.cancel", "Cancel"),
        save: this._localize("ui.common.save", "Save"),
        reset: this._localize("ui.common.reset", "Reset"),
        confirmResetTitle: `${this._localize("ui.common.reset", "Reset")} ${this._customLocalize("graph_settings")}?`,
        confirmReset: "This removes this panel's saved graph and entity overrides and restores the integration defaults.",
        showCode: this._localize(
          "ui.panel.lovelace.editor.edit_card.show_code_editor",
          "Show code editor",
        ),
        showVisual: this._localize(
          "ui.panel.lovelace.editor.edit_card.show_visual_editor",
          "Show visual editor",
        ),
        mappingError: this._customLocalize("graph_code_editor_mapping_error"),
        loadError: this._customLocalize("graph_editor_load_error"),
      },
      leadingAction: {
        label: this._customLocalize("diagnostics"),
        onClick: () => this._openDiagnostics(),
      },
      editorVariants: combinedEditor
        ? entries.map((entry) => ({
          key: entry.key,
          label: entry.header,
          initialConfig: entry.initialConfig,
          visualEditorStyles: entry.styles,
        }))
        : null,
      initialVariantKey: initialEntry.key,
      shouldSyncVariantKey: combinedEditor
        ? (key) => !variantSpecificKeys.has(key)
        : null,
      visualEditorStyles: initialEntry.styles,
      onReset: () => {
        const snapshot = this._clone(this._activeSnapshot || {});
        snapshot.defaults_mode = "overrides";
        snapshot.card_options = { numeric: {}, state: {} };
        snapshot.entity_options = {};
        delete snapshot.remove_card_options;
        this._activeSnapshot = snapshot;
        this._largeRangeFineDetail = false;
        this._recordChange(null, true);
        this._render();
      },
      onSave: (draft, variantState) => {
        if (combinedEditor) {
          this._applyGraphEditorVariants(entries.map((entry) => ({
            ...entry,
            config: variantState?.drafts?.[entry.key] || entry.initialConfig,
          })));
        } else {
          this._applyGraphEditorConfig(draft, scopedSeries, initialEntry.initialConfig);
        }
        this._render();
      },
    });
  }

}
