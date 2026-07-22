import { CARD_HACS_INSTALL_URL, CARD_TAG } from "./constants.js";
import { openCardEditorDialog } from "./card-editor-dialog.js";
import { CARD_DEFAULT_AGGREGATE, automaticEntityOptions } from "./entity-defaults.js";

const DATA_SOURCE_CACHE = new Map();

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
    if (this._notice && !this.shadowRoot.querySelector(".notice")) host.insertAdjacentHTML("beforebegin", `<div class="notice">${this._escape(this._notice)}</div>`);
    if (!entityIds.length) {
      this._renderLargeRangeDetailBanner(null);
      const prompt = this._localize("ui.panel.history.start_search", "Select areas, devices, entities or labels above");
      host.innerHTML = `<div class="start"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon><p>${this._escape(prompt)}</p></div>`;
      return;
    }
    this._renderLargeRangeDetailBanner(detail);
    const numeric = entityIds.filter((id) => this._isNumeric(id));
    const states = entityIds.filter((id) => !this._isNumeric(id));
    if (numeric.length) this._createGraph(host, numeric, this._customLocalize("numeric_history"), "timeline", detail);
    if (states.length) this._createGraph(host, states, this._customLocalize("state_history"), "state_timeline", detail);
  }

  _createGraph(host, entityIds, title, mode, detail = null) {
    const shell = document.createElement("div");
    shell.className = "graph-shell";
    const sourceIndicator = document.createElement("span");
    sourceIndicator.className = "data-source-indicator pending";
    sourceIndicator.textContent = this._customLocalize("data_source_pending");
    sourceIndicator.title = this._customLocalize("data_source_help");
    const card = document.createElement(CARD_TAG);
    const sourceKey = `${mode}:${entityIds.join("\u001f")}`;
    card.__advancedHistorySourceTracker = this._createDataSourceTracker(
      sourceIndicator,
      Boolean(this._energyCollection),
      sourceKey
    );
    card.__advancedHistoryChartMode = mode;
    card.__advancedHistorySourceKey = sourceKey;
    const cardOptions = this._cardOptions();
    const detailOptions = !detail
      ? {}
      : detail.automatic
        ? { auto_scale_points: true }
        : { auto_scale_points: false, group_by: detail.groupBy, show_group_by_picker: true };
    const palette = customElements.get(CARD_TAG)?.PALETTE;
    const entities = entityIds.map((id, index) => {
      const entity = this._entityCardConfig(id, mode);
      const configured = detail && mode === "state_timeline"
        ? { ...entity, aggregate_func: "last" }
        : entity;
      // Keep automatically assigned colors stable when entities are toggled.
      // The card otherwise reindexes its palette after disabled entities are
      // removed, causing the remaining series to change color.
      if (configured.color == null && Array.isArray(palette) && palette.length) {
        configured.color = palette[index % palette.length];
      }
      return configured;
    });
    const config = {
      type: `custom:${CARD_TAG}`, card_header: title, chart_mode: mode,
      entities,
      hours_to_show: this._effectiveDefaultHours(),
      height: this._effectiveGraphHeight(),
      ...(mode === "state_timeline" ? { group_by: "raw" } : {}),
      ...cardOptions,
      ...detailOptions,
      time_zone: cardOptions.time_zone ?? this._resolvedTimeZone(),
      energy_date_sync: true,
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
    // Calendar periods end one millisecond before midnight and DST can add or
    // remove an hour. A two-hour tolerance makes a configured 31-day
    // threshold reliably include a selected calendar month.
    if (!period || period.hours < thresholdDays * 24 - 2) return null;
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
    if (!profile) {
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
      <ha-button appearance="plain">${this._escape(buttonText)}</ha-button>`;
    banner.hidden = false;
    banner.querySelector("ha-button")?.addEventListener("click", () => {
      this._largeRangeFineDetail = profile.automatic;
      this._largeRangeDetailStateKey = this._largeRangeDetailRenderKey();
      this._renderGraphs();
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
        cyclePending = true;
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
    if (type.includes("history/period") || type.includes("history_during_period")) return "history";
    return null;
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

    const record = (message) => tracker.record(this._requestDataSource(message));
    const connection = hass.connection ? new Proxy(hass.connection, {
      get: (target, property) => {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (!["subscribeMessage", "sendMessage", "sendMessagePromise"].includes(property)) {
          return value.bind(target);
        }
        return (...args) => {
          record(args.find((argument) => argument?.type));
          return value.apply(target, args);
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
            record(message);
            return value.call(target, message);
          };
        }
        if (property === "callApi") {
          return (...args) => {
            record(args.find((argument) => typeof argument === "string" && argument.includes("history/period")));
            return value.apply(target, args);
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

  _isNumeric(id) {
    const state = this._hass.states[id];
    const domain = id.split(".")[0];
    if (["binary_sensor","input_boolean","input_select","select","person","device_tracker","alarm_control_panel","lock","cover","fan","switch","light","climate","media_player","date","datetime","time"].includes(domain)) return false;
    return state && state.state !== "" && Number.isFinite(Number(state.state));
  }

  _entityCardConfig(
    entity,
    mode,
    cardOptionsConfig = this._effectiveCardOptionsConfig(),
    entityOptionsConfig = this._effectiveEntityOptionsConfig()
  ) {
    const savedOptions = entityOptionsConfig?.[entity];
    const entityOptions = {
      ...automaticEntityOptions(this._hass.states[entity], mode),
      ...this._defaultEntityOptions(cardOptionsConfig),
      ...(savedOptions && typeof savedOptions === "object" ? savedOptions : {}),
    };
    const enabled = this._enabledResolvedEntityIds?.has(entity) !== false;
    if (mode !== "state_timeline") {
      const { compare: compareDefaults, ...options } = entityOptions;
      const activeCompare = this._effectiveCompare();
      const compare = this._mergeCompareOptions(activeCompare, compareDefaults);
      return compare == null
        ? { ...options, entity, enabled }
        : { ...options, entity, enabled, compare };
    }
    const state = this._hass.states[entity];
    const domain = entity.split(".")[0];
    let values = [];
    if (["binary_sensor","input_boolean","switch","light","fan"].includes(domain)) values = ["off","on"];
    else if (domain === "cover") values = ["closed","closing","open","opening"];
    else if (domain === "lock") values = ["locked","locking","unlocked","unlocking","jammed"];
    else if (["person","device_tracker"].includes(domain)) values = ["not_home","home"];
    else if (domain === "alarm_control_panel") values = ["disarmed","arming","armed_home","armed_away","armed_night","pending","triggered"];
    else if (domain === "climate") values = state?.attributes?.hvac_modes || [];
    else if (["select","input_select"].includes(domain)) values = state?.attributes?.options || [];
    if (state?.state && !values.includes(state.state)) values.push(state.state);
    const generated = values.length ? { entity, state_map: values.map((value) => ({ value })) } : { entity };
    return { ...generated, ...entityOptions, entity, enabled };
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

  _graphEditorConfig(editDefaults = false) {
    const entityIds = this._resolvedEntityIds();
    const numeric = entityIds.filter((id) => this._isNumeric(id));
    const editorEntities = numeric.length ? numeric : entityIds;
    const cardOptionsConfig = editDefaults ? this.config.card_options : this._effectiveCardOptionsConfig();
    const entityOptionsConfig = editDefaults ? this.config.entity_options : this._effectiveEntityOptionsConfig();
    const palette = customElements.get(CARD_TAG)?.PALETTE;
    this._editorAutoColors = new Map();
    const entities = editorEntities.map((id, index) => {
      const entityConfig = this._entityCardConfig(id, "timeline", cardOptionsConfig, entityOptionsConfig);
      if (entityConfig.color == null && Array.isArray(palette) && palette.length) {
        const color = palette[index % palette.length];
        entityConfig.color = color;
        this._editorAutoColors.set(id, color);
      }
      return entityConfig;
    });
    return {
      hours_to_show: editDefaults ? Number(this.config.default_hours) || 24 : this._effectiveDefaultHours(),
      height: editDefaults ? Number(this.config.graph_height) || 300 : this._effectiveGraphHeight(),
      ...this._cardOptions(cardOptionsConfig),
      type: `custom:${CARD_TAG}`,
      card_header: this._customLocalize("numeric_history"),
      chart_mode: "timeline",
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
      "type", "card_header", "chart_mode", "entities", "energy_date_sync", "height", "hours_to_show",
    ]);
    const cardOptions = {};
    for (const [key, value] of Object.entries(config || {})) {
      if (protectedKeys.has(key) || value === undefined) continue;
      if (editDefaults || !this._sameGraphOption(value, integrationCardDefaults[key])) {
        cardOptions[key] = structuredClone(value);
      }
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
      const automaticColor = this._editorAutoColors.get(entity);
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
      if (Object.keys(options).length) entityOptions[entity] = options;
      else delete entityOptions[entity];
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

  _applyGraphEditorConfig(config) {
    const { cardOptions, entityOptions } = this._splitGraphEditorConfig(config);
    const defaultHours = Number(config?.hours_to_show) || this._effectiveDefaultHours();
    const graphHeight = Number(config?.height) || this._effectiveGraphHeight();
    const compare = this._snapshotCompareSetting();
    this._activeSnapshot = {
      card_options: cardOptions,
      entity_options: entityOptions,
      default_hours: defaultHours,
      graph_height: graphHeight,
    };
    if (compare !== undefined) this._activeSnapshot.compare = this._clone(compare);
    this._recordChange(null, true);
    return { cardOptions, entityOptions, defaultHours, graphHeight };
  }

  async _openGraphEditor() {
    await openCardEditorDialog({
      hass: this._hass,
      initialConfig: this._graphEditorConfig(),
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
        this._applyGraphEditorConfig(draft);
        this._render();
      },
    });
  }

}
