import { CARD_HACS_INSTALL_URL, CARD_TAG } from "./constants.js";
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

const DATA_SOURCE_CACHE = new Map();

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

export class GraphMethods {
  _renderGraphs() {
    const host = this.shadowRoot.getElementById("charts");
    if (!host) return;
    const detail = this._largeRangeDetailProfile();
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
    if (this._activeSnapshot?.single_graph) {
      const cardOptions = this._cardOptions();
      const mode = cardOptions.chart_mode
        || (series.some((item) => this._isNumeric(item)) ? "timeline" : "state_timeline");
      const title = cardOptions.card_header
        || this._customLocalize(mode === "state_timeline" ? "state_history" : "numeric_history");
      const graphDetail = mode === "state_timeline" ? null : detail;
      this._renderLargeRangeDetailBanner(graphDetail);
      this._createGraph(host, series, title, mode, graphDetail);
      return;
    }
    const numeric = series.filter((item) => this._isNumeric(item));
    const states = series.filter((item) => !this._isNumeric(item));
    this._renderLargeRangeDetailBanner(numeric.length ? detail : null);
    if (numeric.length) {
      this._createGraph(
        host,
        numeric,
        this._customLocalize("numeric_history"),
        "timeline",
        detail,
      );
    }
    if (states.length) {
      this._createGraph(
        host,
        states,
        this._customLocalize("state_history"),
        "state_timeline",
        null,
      );
    }
  }

  _createGraph(host, series, title, mode, detail = null) {
    const shell = document.createElement("div");
    shell.className = "graph-shell";
    const sourceIndicator = document.createElement("span");
    sourceIndicator.className = "data-source-indicator pending";
    sourceIndicator.textContent = this._customLocalize("data_source_pending");
    sourceIndicator.title = this._customLocalize("data_source_help");
    const card = document.createElement(CARD_TAG);
    const sourceKey = this._dataSourceCacheKey(mode, series);
    card.__advancedHistorySourceTracker = this._createDataSourceTracker(
      sourceIndicator,
      Boolean(this._energyCollection),
      sourceKey
    );
    card.__advancedHistoryChartMode = mode;
    card.__advancedHistorySourceKey = sourceKey;
    this._guardFutureEnergySeries(card);
    const cardOptions = { ...this._cardOptions() };
    if (cardOptions.chart_mode && cardOptions.chart_mode !== mode) {
      delete cardOptions.chart_mode;
    }
    const detailOptions = !detail
      ? {}
      : detail.automatic
        ? { auto_scale_points: true }
        : { auto_scale_points: false, group_by: detail.groupBy, show_group_by_picker: true };
    const palette = customElements.get(CARD_TAG)?.PALETTE;
    const entities = series.map((item, index) => {
      const configured = this._entityCardConfig(item, mode);
      // Keep automatically assigned colors stable when entities are toggled.
      // The card otherwise reindexes its palette after disabled entities are
      // removed, causing the remaining series to change color.
      if (
        mode !== "state_timeline"
        && configured.color == null
        && Array.isArray(palette)
        && palette.length
      ) {
        configured.color = palette[index % palette.length];
      }
      return configured;
    });
    const height = this._effectiveGraphHeight();
    const config = {
      type: `custom:${CARD_TAG}`, card_header: title, chart_mode: mode,
      entities,
      hours_to_show: this._effectiveDefaultHours(),
      height,
      ...cardOptions,
      ...detailOptions,
      ...(mode === "state_timeline"
        ? { height: "auto", auto_scale_points: false, group_by: "raw" }
        : {}),
      time_zone: cardOptions.time_zone ?? this._resolvedTimeZone(),
      energy_date_sync: true,
      ...this._panelGraphHourOptions(),
    };
    try {
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
      this._setGraphCardHass(card, this._hass);
      shell.append(card, sourceIndicator);
      if (
        this.config.settings_path
        && this._hass?.user?.is_admin
      ) {
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
    }
    catch (error) { host.insertAdjacentHTML("beforeend", `<div class="error">${this._escape(error.message || error)}</div>`); }
  }

  _largeRangePeriod() {
    const start = this._energyCollection?.start;
    const end = this._energyCollection?.end;
    const startMs = start?.getTime?.();
    const endMs = end?.getTime?.();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    const hours = (endMs - startMs) / 3_600_000;
    const compare = this._energyCollection?.compare || "";
    return {
      start,
      end,
      hours,
      key: `${start.toISOString()}|${end.toISOString()}|${compare}`,
    };
  }

  _largeRangeDetailProfile() {
    if (this.config.large_range_automatic_detail === false) return null;
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
      ? `detail|auto|${profile.key}`
      : `fine|${profile.groupBy}|${profile.key}`;
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
      indicator.textContent = this._customLocalize(
        source === "pending"
          ? "data_source_pending"
          : source === "mixed"
            ? "data_source_mixed"
            : source === "statistics"
              ? "data_source_statistics"
              : "data_source_history"
      );
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

  _dataSourceCacheKey(mode, series) {
    const start = this._energyCollection?.start;
    const end = this._energyCollection?.end;
    const startKey = Number.isFinite(start?.getTime?.()) ? start.toISOString() : "";
    const endKey = Number.isFinite(end?.getTime?.()) ? end.toISOString() : "";
    const compare = this._energyCollection?.compare || "";
    return [
      mode,
      series.map((item) => item.key).join("\u001f"),
      startKey,
      endKey,
      compare,
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
          || this._energyCollection?.start;
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
      const result = bucketSeries.apply(card, args);
      const entity = args[1];
      const windowEnd = Number(args[4]);
      const offsetHours = Number(entity?.offset);
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
    cardOptionsConfig = this._effectiveCardOptionsConfig(),
    entityOptionsConfig = this._effectiveEntityOptionsConfig()
  ) {
    const descriptor = this._seriesDescriptor(value);
    const { entity, attribute, key } = descriptor;
    const entitySavedOptions = entityOptionsConfig?.[entity];
    const seriesSavedOptions = attribute ? entityOptionsConfig?.[key] : null;
    const entityOptions = {
      ...automaticEntityOptions(this._hass.states[entity], mode),
      ...this._defaultEntityOptions(cardOptionsConfig),
      ...(entitySavedOptions && typeof entitySavedOptions === "object" ? entitySavedOptions : {}),
      ...(seriesSavedOptions && typeof seriesSavedOptions === "object" ? seriesSavedOptions : {}),
    };
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
    if (mode !== "state_timeline") {
      const { compare: compareDefaults, ...options } = entityOptions;
      delete options.state_map;
      const activeCompare = this._effectiveCompare();
      const compare = this._mergeCompareOptions(activeCompare, compareDefaults);
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
    return { ...entityOptions, ...generated, entity, enabled };
  }

  _mergeCompareOptions(activeCompare, defaults) {
    if (activeCompare == null || activeCompare === false) return activeCompare;
    if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) return activeCompare;

    const mergeOne = (active) => {
      if (active === true) return { ...defaults };
      if (active && typeof active === "object" && !Array.isArray(active)) {
        return { ...defaults, ...active };
      }
      return { ...defaults, period: active };
    };
    return Array.isArray(activeCompare) ? activeCompare.map(mergeOne) : mergeOne(activeCompare);
  }

  _cardOptions(configured = this._effectiveCardOptionsConfig()) {
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) return {};
    const options = { ...configured };
    delete options.entities;
    delete options.energy_date_sync;
    delete options.height;
    delete options.hours_to_show;
    return options;
  }

  _defaultEntityOptions(cardOptionsConfig = this._effectiveCardOptionsConfig()) {
    const configured = cardOptionsConfig?.entities;
    const templates = Array.isArray(configured) ? configured : configured ? [configured] : [];
    const defaults = {};
    for (const template of templates) {
      if (!template || typeof template !== "object" || Array.isArray(template)) continue;
      if (template.entity != null || template.statistic_id != null) continue;
      Object.assign(defaults, template);
    }
    return defaults;
  }

  _graphEditorConfig(
    editDefaults = false,
    scopedSeries = null,
    scopedMode = null,
    scopedHeader = null,
  ) {
    const entityIds = this._resolvedEntityIds();
    const cardOptionsConfig = editDefaults ? this.config.card_options : this._effectiveCardOptionsConfig();
    const entityOptionsConfig = editDefaults ? this.config.entity_options : this._effectiveEntityOptionsConfig();
    const series = this._seriesDescriptors(entityIds, entityOptionsConfig);
    const numeric = series.filter((item) => this._isNumeric(item));
    const editorEntities = Array.isArray(scopedSeries)
      ? scopedSeries
      : this._activeSnapshot?.single_graph
        ? series
        : (numeric.length ? numeric : series);
    const editorHasNumeric = editorEntities.some((item) => this._isNumeric(item));
    const editorMode = scopedMode || (editorHasNumeric ? "timeline" : "state_timeline");
    const editorHeader = scopedHeader
      || this._customLocalize(editorHasNumeric ? "numeric_history" : "state_history");
    const cardOptions = this._cardOptions(cardOptionsConfig);
    const palette = customElements.get(CARD_TAG)?.PALETTE;
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
      height: editDefaults ? Number(this.config.graph_height) || 300 : this._effectiveGraphHeight(),
      ...cardOptions,
      type: `custom:${CARD_TAG}`,
      card_header: cardOptions.card_header ?? editorHeader,
      chart_mode: cardOptions.chart_mode ?? editorMode,
      entities,
      energy_date_sync: true,
    };
  }

  _splitGraphEditorConfig(config, editDefaults = false) {
    const configuredCardOptions = editDefaults ? this.config.card_options : this._effectiveCardOptionsConfig();
    const configuredEntityOptions = editDefaults ? this.config.entity_options : this._effectiveEntityOptionsConfig();
    const integrationCardDefaults = this._cardOptions(this.config.card_options);
    const integrationEntityDefaults = this.config.entity_options || {};
    const protectedKeys = new Set([
      "type", "entities", "energy_date_sync", "height", "hours_to_show",
    ]);
    const cardOptions = {};
    for (const [key, value] of Object.entries(config || {})) {
      if (protectedKeys.has(key) || value === undefined) continue;
      if (editDefaults || !this._sameGraphOption(value, integrationCardDefaults[key])) {
        cardOptions[key] = structuredClone(value);
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
    const automaticHeader = this._customLocalize(
      editorHasNumeric ? "numeric_history" : "state_history"
    );
    const automaticMode = editorHasNumeric ? "timeline" : "state_timeline";
    if (!configuredHasHeader && cardOptions.card_header === automaticHeader) {
      delete cardOptions.card_header;
    }
    if (!configuredHasMode && cardOptions.chart_mode === automaticMode) {
      delete cardOptions.chart_mode;
    }
    for (const [key, value] of Object.entries(
      editDefaults ? this._cardOptions(configuredCardOptions) : {}
    )) {
      if (value === true && !(key in (config || {}))) cardOptions[key] = false;
    }
    if (editDefaults && configuredCardOptions?.entities !== undefined) {
      cardOptions.entities = structuredClone(configuredCardOptions.entities);
    }

    const entityOptions = editDefaults ? structuredClone(configuredEntityOptions || {}) : {};
    for (const raw of config?.entities || []) {
      if (!raw || typeof raw === "string") continue;
      const entity = raw.entity || raw.statistic_id;
      if (!entity) continue;
      const seriesKey = this._seriesKey(entity, raw.attribute);
      const options = structuredClone(raw);
      delete options.entity;
      delete options.statistic_id;
      delete options.compare;
      // Target-chip visibility is stored separately with the chart and is
      // applied to generated card entities through the card's native enabled
      // option. Do not turn that transient state into an editor override.
      delete options.enabled;
      const integrationBase = {
        ...automaticEntityOptions(this._hass.states[entity], "timeline"),
        ...this._defaultEntityOptions(this.config.card_options),
        ...(integrationEntityDefaults?.[entity] || {}),
        ...(integrationEntityDefaults?.[seriesKey] || {}),
      };
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
        editDefaults ? this._defaultEntityOptions(configuredCardOptions) : {}
      )) {
        if (value === true && !(key in options)) options[key] = false;
      }
      if (!editDefaults) {
        for (const [key, value] of Object.entries(options)) {
          if (this._sameGraphOption(value, integrationBase[key])) delete options[key];
        }
      }
      if (Object.keys(options).length) entityOptions[seriesKey] = options;
      else delete entityOptions[seriesKey];
    }
    return { cardOptions, entityOptions };
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

  _applyGraphEditorConfig(config, scopedSeries = null) {
    const { cardOptions, entityOptions: editedEntityOptions } = this._splitGraphEditorConfig(config);
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
    const defaultHours = Number(config?.hours_to_show) || this._effectiveDefaultHours();
    const graphHeight = Number(config?.height) || this._effectiveGraphHeight();
    const compare = this._snapshotCompareSetting();
    const singleGraph = Boolean(this._activeSnapshot?.single_graph);
    const attributeSelection = this._clone(this._activeSnapshot?.attribute_selection);
    this._activeSnapshot = {
      card_options: cardOptions,
      entity_options: entityOptions,
      default_hours: defaultHours,
      graph_height: graphHeight,
    };
    if (singleGraph) this._activeSnapshot.single_graph = true;
    if (attributeSelection && Object.keys(attributeSelection).length) {
      this._activeSnapshot.attribute_selection = attributeSelection;
    }
    if (compare !== undefined) this._activeSnapshot.compare = this._clone(compare);
    this._recordChange(null, true);
    return { cardOptions, entityOptions, defaultHours, graphHeight };
  }

  async _openGraphEditor(scopedSeries = null, scopedMode = null, scopedHeader = null) {
    await openCardEditorDialog({
      hass: this._hass,
      container: this,
      initialConfig: this._graphEditorConfig(
        false,
        scopedSeries,
        scopedMode,
        scopedHeader,
      ),
      title: this._customLocalize("graph_settings"),
      note: this._customLocalize("graph_editor_note"),
      labels: {
        loading: this._localize("ui.common.loading", "Loading"),
        cancel: this._localize("ui.common.cancel", "Cancel"),
        save: this._localize("ui.common.save", "Save"),
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
      onSave: (draft) => {
        this._applyGraphEditorConfig(draft, scopedSeries);
        this._render();
      },
    });
  }

}
