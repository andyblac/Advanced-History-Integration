import { CARD_HACS_INSTALL_URL, CARD_TAG } from "./constants.js";

export class GraphMethods {
  _renderGraphs() {
    const host = this.shadowRoot.getElementById("charts");
    if (!host) return;
    this._cards = this._cards.filter((card) => !this._graphCards.includes(card));
    this._graphCards = [];
    host.replaceChildren();
    if (this._cardLoadError) {
      const title = this._customLocalize("card_missing_title");
      const install = this._customLocalize("install_with_hacs");
      const retry = this._localize("ui.common.retry", "Retry");
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
      const prompt = this._localize("ui.panel.history.start_search", "Select areas, devices, entities or labels above");
      host.innerHTML = `<div class="start"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon><p>${this._escape(prompt)}</p></div>`;
      return;
    }
    const numeric = entityIds.filter((id) => this._isNumeric(id));
    const states = entityIds.filter((id) => !this._isNumeric(id));
    if (numeric.length) this._createGraph(host, numeric, this._customLocalize("numeric_history"), "timeline");
    if (states.length) this._createGraph(host, states, this._customLocalize("state_history"), "state_timeline");
  }

  _createGraph(host, entityIds, title, mode) {
    const card = document.createElement(CARD_TAG);
    const cardOptions = this._cardOptions();
    const config = {
      type: `custom:${CARD_TAG}`, card_header: title, chart_mode: mode,
      entities: entityIds.map((id) => this._entityCardConfig(id, mode)),
      hours_to_show: this._effectiveDefaultHours(),
      height: this._effectiveGraphHeight(),
      ...(mode === "state_timeline" ? { group_by: "raw" } : {}),
      ...cardOptions,
      time_zone: cardOptions.time_zone ?? this._resolvedTimeZone(),
      energy_date_sync: true,
    };
    try { card.setConfig(config); card.hass = this._hass; host.append(card); this._cards.push(card); this._graphCards.push(card); }
    catch (error) { host.insertAdjacentHTML("beforeend", `<div class="error">${this._escape(error.message || error)}</div>`); }
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
      ...this._defaultEntityOptions(cardOptionsConfig),
      ...(savedOptions && typeof savedOptions === "object" ? savedOptions : {}),
    };
    if (mode !== "state_timeline") {
      const { compare: compareDefaults, ...options } = entityOptions;
      const activeCompare = this._effectiveCompare();
      const compare = this._mergeCompareOptions(activeCompare, compareDefaults);
      return compare == null ? { ...options, entity } : { ...options, entity, compare };
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
    return { ...generated, ...entityOptions, entity };
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
        const entityBase = {
          ...this._defaultEntityOptions(this.config.card_options),
          ...(integrationEntityDefaults?.[entity] || {}),
        };
        for (const [key, value] of Object.entries(options)) {
          if (this._sameGraphOption(value, entityBase[key])) delete options[key];
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
    this._activeSnapshot = {
      card_options: cardOptions,
      entity_options: entityOptions,
      default_hours: defaultHours,
      graph_height: graphHeight,
      compare: this._clone(this._snapshotCompareSetting()),
    };
    this._recordChange();
    return { cardOptions, entityOptions, defaultHours, graphHeight };
  }

  async _openGraphEditor() {
    if (this.shadowRoot.querySelector(".backdrop")) return;
    const cancel = this._localize("ui.common.cancel", "Cancel");
    const saveLabel = this._localize("ui.common.save", "Save");
    const loading = this._localize("ui.common.loading", "Loading");
    const graphSettings = this._customLocalize("graph_settings");
    const editorNote = this._customLocalize("graph_editor_note");
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<section class="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="${this._escape(graphSettings)}">
      <header class="dialog-title"><h2>${this._escape(graphSettings)}</h2></header>
      <div class="editor-note">${this._escape(editorNote)}</div>
      <div class="editor-host"><div class="start"><p>${this._escape(loading)}…</p></div></div>
      <footer class="dialog-actions"><span class="editor-status"></span><button data-action="cancel">${this._escape(cancel)}</button><button class="primary" data-action="save">${this._escape(saveLabel)}</button></footer>
    </section>`;
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => backdrop.remove());
    this.shadowRoot.append(backdrop);

    const host = backdrop.querySelector(".editor-host");
    const status = backdrop.querySelector(".editor-status");
    const save = backdrop.querySelector('[data-action="save"]');
    let draft = this._graphEditorConfig();
    try {
      const cardClass = customElements.get(CARD_TAG);
      let editor = typeof cardClass?.getConfigElement === "function" ? await cardClass.getConfigElement() : null;
      if (!editor) {
        await customElements.whenDefined("statistics-graph-chart-card-editor");
        editor = document.createElement("statistics-graph-chart-card-editor");
      }
      if (!backdrop.isConnected) return;
      editor.hass = this._hass;
      editor.setConfig(draft);
      editor.addEventListener("config-changed", (event) => { if (event.detail?.config) draft = event.detail.config; });
      host.replaceChildren(editor);
    } catch (error) {
      console.error("Advanced History: graph editor failed to load", error);
      host.innerHTML = `<div class="error">${this._escape(error.message || this._customLocalize("graph_editor_load_error"))}</div>`;
      save.disabled = true;
    }

    save.addEventListener("click", () => {
      this._applyGraphEditorConfig(draft);
      backdrop.remove();
      this._render();
    });
  }

}
