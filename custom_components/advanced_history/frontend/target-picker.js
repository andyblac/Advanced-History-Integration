export class TargetPickerMethods {
  _secondaryAxisEditable() {
    if (this._narrow) return false;
    return typeof globalThis.matchMedia !== "function"
      || globalThis.matchMedia("(min-width: 769px)").matches;
  }

  _secondaryAxisVisible() {
    return this._secondaryAxisEditable() || Boolean(this._loadedBookmarkId);
  }

  async _loadNativeHistoryPicker() {
    if (customElements.get("ha-target-picker")) return;

    let node = this;
    let resolver = null;
    while (node) {
      if (node.localName === "partial-panel-resolver") {
        resolver = node;
        break;
      }
      const root = node.getRootNode?.();
      if (root instanceof ShadowRoot) {
        node = root.host;
      } else {
        node = node.parentElement;
      }
    }

    const resolverCandidates = resolver ? [resolver] : [];
    if (customElements.get("partial-panel-resolver")) {
      const standaloneResolver = document.createElement("partial-panel-resolver");
      standaloneResolver.hass = this._hass;
      resolverCandidates.push(standaloneResolver);
    }

    let historyRoute = null;
    for (const candidate of resolverCandidates) {
      const optionCandidates = [];
      for (const key of ["routerOptions", "_routerOptions"]) {
        try {
          if (candidate[key]?.routes) optionCandidates.push(candidate[key]);
        } catch (_) { /* A frontend version may expose this through a guarded getter. */ }
      }
      for (const key of Object.getOwnPropertyNames(candidate)) {
        try {
          const value = candidate[key];
          if (value?.routes && !optionCandidates.includes(value)) optionCandidates.push(value);
        } catch (_) { /* Ignore unrelated private frontend state. */ }
      }

      const panels = { ...(this._hass?.panels || {}) };
      if (!Object.values(panels).some((panel) => panel?.component_name === "history")) {
        panels.__advanced_history_native_loader = {
          component_name: "history",
          url_path: "__advanced_history_native_loader",
        };
      }
      for (const method of ["_getRoutes", "getRoutes"]) {
        try {
          if (typeof candidate[method] === "function") {
            const options = candidate[method](panels);
            if (options?.routes) optionCandidates.push(options);
          }
        } catch (_) { /* Try the next resolver API shape. */ }
      }

      for (const options of optionCandidates) {
        historyRoute = Object.values(options.routes).find(
          (route) => typeof route === "object" && route?.tag === "ha-panel-history" && typeof route.load === "function"
        );
        if (historyRoute) break;
      }
      if (historyRoute) break;
    }

    if (!historyRoute?.load) {
      throw new Error("Home Assistant's History panel loader is unavailable");
    }

    await historyRoute.load();
    await customElements.whenDefined("ha-target-picker");
  }

  async _renderNativeTargetPicker(axis = "primary") {
    const secondary = axis === "secondary";
    const host = this.shadowRoot.getElementById(
      secondary ? "y2-target-picker-host" : "target-picker-host"
    );
    if (!host) return;
    try {
      await this._loadNativeHistoryPicker();
      if (!host.isConnected) return;
      const picker = document.createElement("ha-target-picker");
      picker.hass = this._targetPickerHass();
      picker.value = structuredClone(secondary ? this._y2Targets : this._targets);
      picker.narrow = this._narrow;
      picker.setAttribute("add-on-top", "");
      picker.setAttribute("compact", "");
      picker.addEventListener("value-changed", (event) => this._nativeTargetsChanged(event, axis));
      picker.addEventListener("click", (event) => this._nativeTargetChipClicked(event, axis));
      host.replaceChildren(picker);
      if (secondary) this._nativeY2TargetPicker = picker;
      else this._nativeTargetPicker = picker;
      await picker.updateComplete;
      this._syncNativeTargetVisibility(axis);
    } catch (error) {
      console.error("Advanced History: native target picker could not be loaded", error);
      if (host.isConnected) {
        const message = this._customLocalize("native_picker_error", { error: error.message || error });
        host.innerHTML = `<div class="native-picker-status">${this._escape(message)}</div>`;
      }
    }
  }

  _nativeTargetsChanged(event, axis = "primary") {
    const secondary = axis === "secondary";
    const currentTargets = secondary ? this._y2Targets : this._targets;
    const otherTargets = secondary ? this._targets : this._y2Targets;
    const picker = secondary ? this._nativeY2TargetPicker : this._nativeTargetPicker;
    const otherPicker = secondary ? this._nativeTargetPicker : this._nativeY2TargetPicker;
    const nextTargets = this._normalizeTargets(event.detail?.value || {});
    const clearedAxis = Boolean(this._targetCount(currentTargets) && !this._targetCount(nextTargets));
    const clearedChart = clearedAxis && !this._targetCount(otherTargets);
    if (clearedChart) {
      if (picker) {
        picker.value = structuredClone(currentTargets);
        picker.requestUpdate?.();
      }
      this._requestClearCurrentChart();
      return;
    }

    // A target belongs to one axis. Selecting it in the other picker moves it.
    for (const kind of ["area_id", "device_id", "entity_id"]) {
      otherTargets[kind] = otherTargets[kind].filter((id) => !nextTargets[kind].includes(id));
    }
    if (secondary) this._y2Targets = nextTargets;
    else this._targets = nextTargets;
    this._pruneHiddenTargets();
    if (!this._targetCount()) this._resetEnergySelection();
    if (picker) {
      picker.value = structuredClone(nextTargets);
      picker.requestUpdate?.();
    }
    if (otherPicker) {
      otherPicker.value = structuredClone(otherTargets);
      otherPicker.requestUpdate?.();
    }
    this._saveTargets();
    this._recordChange(null, true);
    this._notice = "";
    const removeAll = this.shadowRoot.getElementById("remove-all");
    if (removeAll) removeAll.hidden = !this._targetCount();
    this._syncAxisTargetLayout();
    this._syncNativeTargetVisibility(axis);
    this._syncNativeTargetVisibility(secondary ? "primary" : "secondary");
    this.shadowRoot.querySelector(".notice")?.remove();
    this._renderGraphs();
  }

  _syncAxisTargetLayout() {
    const hasY1Targets = Boolean(this._targetCount(this._targets));
    const hasY2Targets = Boolean(this._targetCount(this._y2Targets));
    this.shadowRoot.querySelector(".axis-target-primary")?.classList.toggle(
      "axis-target-compact",
      !hasY1Targets && hasY2Targets,
    );
    this.shadowRoot.querySelector(".axis-target-secondary")?.classList.toggle(
      "axis-target-compact",
      !hasY2Targets && hasY1Targets,
    );
  }

  _targetPickerHass() {
    const hass = this._hass;
    if (!hass?.states) return hass;

    const areaNames = new Map(this._areas.map((area) => [area.area_id, area.name]));
    const deviceAreas = new Map(this._devices.map((device) => [device.id, device.area_id]));
    const entityAreas = new Map();
    for (const entity of this._entities) {
      const areaId = entity.area_id || (entity.device_id ? deviceAreas.get(entity.device_id) : null);
      const areaName = areaId ? areaNames.get(areaId) : null;
      if (areaName) entityAreas.set(entity.entity_id, areaName);
    }

    const displayStateCache = new Map();
    const states = new Proxy(hass.states, {
      get(target, property, receiver) {
        const state = Reflect.get(target, property, receiver);
        if (typeof property !== "string" || !state) return state;
        const areaName = entityAreas.get(property);
        if (!areaName) return state;

        const friendlyName = String(
          state.attributes?.friendly_name ?? property.split(".").pop().replaceAll("_", " ")
        );
        if (friendlyName.toLocaleLowerCase().includes(areaName.toLocaleLowerCase())) return state;

        const cached = displayStateCache.get(property);
        if (cached?.source === state) return cached.display;
        const display = {
          ...state,
          attributes: {
            ...state.attributes,
            friendly_name: `${friendlyName} · ${areaName}`,
          },
        };
        displayStateCache.set(property, { source: state, display });
        return display;
      },
    });
    return { ...hass, states };
  }

  _nativeTargetChipClicked(event, axis = "primary") {
    const path = event.composedPath();
    const chipIndex = path.findIndex(
      (node) => node?.localName === "ha-target-picker-value-chip"
    );
    if (chipIndex < 0) return;
    const usedChipControl = path.slice(0, chipIndex).some((node) =>
      node?.localName === "button" ||
      node?.localName === "ha-icon-button" ||
      node?.classList?.contains("expand-btn") ||
      String(node?.getAttribute?.("part") || "").includes("remove")
    );
    if (usedChipControl) return;
    const chip = path[chipIndex];
    if (!chip?.type || !chip.itemId) return;
    const kind = `${chip.type}_id`;
    const targets = axis === "secondary" ? this._y2Targets : this._targets;
    if (!targets[kind]) return;
    this._toggleTargetVisibility(axis, kind, chip.itemId);
  }

  _syncNativeTargetVisibility(axis = "primary") {
    const secondary = axis === "secondary";
    const picker = secondary ? this._nativeY2TargetPicker : this._nativeTargetPicker;
    const targets = secondary ? this._y2Targets : this._targets;
    const hiddenTargets = secondary ? this._hiddenY2Targets : this._hiddenTargets;
    if (!picker) return;
    const syncKey = secondary ? "_nativeY2TargetSyncId" : "_nativeTargetSyncId";
    const pickerKey = secondary ? "_nativeY2TargetPicker" : "_nativeTargetPicker";
    const syncId = (this[syncKey] || 0) + 1;
    this[syncKey] = syncId;
    const apply = async () => {
      await picker.updateComplete;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      if (
        picker !== this[pickerKey] ||
        syncId !== this[syncKey] ||
        !picker.shadowRoot
      ) return;
      let axisStyle = picker.shadowRoot.querySelector("style[data-advanced-history-axis]");
      if (!axisStyle) {
        axisStyle = document.createElement("style");
        axisStyle.dataset.advancedHistoryAxis = axis;
        picker.shadowRoot.append(axisStyle);
      }
      axisStyle.textContent = [
        "ha-generic-picker{--ha-generic-picker-width:min(800px,calc(100vw - 32px));--ha-generic-picker-max-width:calc(100vw - 32px)}",
        secondary ? ".add-target-wrapper,.items{justify-content:flex-end}" : "",
      ].join("");
      const genericPicker = picker.shadowRoot.querySelector("ha-generic-picker");
      if (genericPicker) {
        await genericPicker.updateComplete;
        if (picker !== this[pickerKey] || syncId !== this[syncKey]) return;
        let buttonStyle = genericPicker.shadowRoot?.querySelector(
          "style[data-advanced-history-axis]"
        );
        if (secondary && genericPicker.shadowRoot && !buttonStyle) {
          buttonStyle = document.createElement("style");
          buttonStyle.dataset.advancedHistoryAxis = axis;
          genericPicker.shadowRoot.append(buttonStyle);
        }
        if (buttonStyle) {
          buttonStyle.textContent = secondary
            ? "#picker{display:flex;justify-content:flex-end}"
            : "";
        }
      }
      const chips = [
        ...picker.shadowRoot.querySelectorAll("ha-target-picker-value-chip"),
      ];
      const entityIds = new Set(targets.entity_id || []);
      picker.shadowRoot
        .querySelectorAll("[data-advanced-history-series]")
        .forEach((button) => button.remove());
      chips.forEach((chip) => {
        const kind = `${chip.type}_id`;
        const hidden = Boolean(hiddenTargets[kind]?.includes(chip.itemId));
        const name = kind === "area_id"
          ? this._areaName(chip.itemId)
          : kind === "device_id"
            ? this._deviceName(chip.itemId)
            : this._entityName(chip.itemId);
        chip.style.cursor = "pointer";
        chip.style.opacity = hidden ? ".45" : "";
        chip.style.filter = hidden ? "grayscale(1)" : "";
        chip.setAttribute("role", "button");
        chip.setAttribute("aria-pressed", hidden ? "true" : "false");
        chip.setAttribute("title", this._customLocalize(hidden ? "show_target" : "hide_target", { target: name }));
        if (secondary) {
          const applyAxisColor = async () => {
            await chip.updateComplete;
            if (picker !== this[pickerKey] || syncId !== this[syncKey]) return;
            const tag = chip.shadowRoot?.querySelector("wa-tag");
            if (!tag) return;
            const axisColor = "var(--primary-color)";
            tag.style.borderColor = axisColor;
            tag.style.setProperty("--background-color", axisColor);
          };
          void applyAxisColor();
        }
        if (
          kind === "entity_id"
          && entityIds.has(chip.itemId)
          && this._seriesChoices(chip.itemId).length > 1
        ) {
          this._syncSeriesButton(chip, name);
        }
      });
    };
    void apply();
  }

  _syncSeriesButton(chip, name) {
    const entity = chip.itemId;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.advancedHistorySeries = entity;
    button.setAttribute(
      "aria-label",
      this._customLocalize("configure_attributes", { target: name })
    );
    button.title = this._customLocalize("configure_attributes", { target: name });
    button.innerHTML = '<ha-icon icon="mdi:tune-variant"></ha-icon>';
    button.style.cssText = [
      "width:28px",
      "height:28px",
      "margin-inline:-6px 4px",
      "padding:4px",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "align-self:center",
      "border:0",
      "border-radius:50%",
      "color:var(--secondary-text-color)",
      "background:transparent",
      "cursor:pointer",
    ].join(";");
    button.querySelector("ha-icon").style.cssText = "width:18px;height:18px";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._openSeriesDialog(entity);
    });
    chip.insertAdjacentElement("afterend", button);
  }

  _seriesChoiceValue(entity, attribute) {
    const state = this._hass.states[entity];
    const value = attribute ? this._attributeValue(state, attribute) : state?.state;
    if (value == null || value === "") {
      return this._localize("state.default.unknown", "Unknown");
    }
    if (typeof value === "object") return "";
    return String(value);
  }

  _seriesStateMap(entity, attribute) {
    const options = this._effectiveEntityOptionsConfig()?.[
      this._seriesKey(entity, attribute)
    ];
    return Array.isArray(options?.state_map) ? options.state_map : [];
  }

  _seriesStateMapValues(entity, attribute) {
    const values = this._seriesStateMap(entity, attribute)
      .map((item) => item?.value)
      .filter((value) => value != null && value !== "")
      .map(String);
    const current = this._attributeValue(this._hass.states[entity], attribute);
    if (
      current != null &&
      current !== "" &&
      typeof current !== "object" &&
      !["unknown", "unavailable"].includes(String(current).toLowerCase())
    ) {
      values.push(String(current));
    }
    return [...new Set(values)];
  }

  _seriesStateLabel(value) {
    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  _seriesChoices(entity) {
    const state = this._hass.states[entity];
    if (!state) return [];
    const selected = new Set(
      this._seriesDescriptors([entity]).map((item) => item.attribute || "state")
    );
    const configuredAttributes = Object.entries(this._effectiveEntityOptionsConfig() || {})
      .filter(([key, options]) =>
        key.startsWith(`${entity}::`) &&
        options &&
        typeof options === "object" &&
        typeof options.attribute === "string"
      )
      .map(([, options]) => options.attribute);
    const nativeAttributes = this._nativeHistorySeries(entity).map((item) => item.attribute);
    const metadataAttributes = new Set([
      "assumed_state",
      "attribution",
      "device_class",
      "editable",
      "entity_picture",
      "friendly_name",
      "icon",
      "restored",
      "state_class",
      "supported_features",
      "unit_of_measurement",
    ]);
    const availableAttributes = Object.entries(state.attributes || {})
      .filter(([attribute, value]) =>
        !metadataAttributes.has(attribute) &&
        value !== "" &&
        (typeof value === "string" || typeof value === "number")
      );
    const numericAttributes = availableAttributes
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([attribute]) => attribute);
    const categoricalAttributes = availableAttributes
      .filter(([, value]) => !Number.isFinite(Number(value)))
      .map(([attribute]) => attribute);
    const attributes = [...new Set([
      ...nativeAttributes,
      ...configuredAttributes,
      ...numericAttributes,
      ...categoricalAttributes,
      ...[...selected].filter((value) => value !== "state"),
    ])];
    return [
      {
        value: "state",
        label: this._localize("ui.dialogs.more_info_control.state", "Entity state"),
        current: this._seriesChoiceValue(entity, null),
        detail: entity,
        selected: selected.has("state"),
      },
      ...attributes.map((attribute) => {
        const numeric = numericAttributes.includes(attribute) ||
          nativeAttributes.includes(attribute);
        const categorical = !numeric && (
          categoricalAttributes.includes(attribute) ||
          this._seriesStateMap(entity, attribute).length > 0
        );
        return {
          value: attribute,
          label: this._attributeDisplayName(entity, attribute),
          current: this._seriesChoiceValue(entity, attribute),
          detail: attribute,
          selected: selected.has(attribute),
          categorical,
          mapValues: categorical
            ? this._seriesStateMapValues(entity, attribute)
            : [],
        };
      }),
    ];
  }

  _openSeriesDialog(entity) {
    if (!this._targets.entity_id.includes(entity)) return;
    this.shadowRoot.querySelector(".series-backdrop")?.remove();
    const name = this._entityDisplayName(entity);
    const choices = this._seriesChoices(entity);
    const cancel = this._localize("ui.common.cancel", "Cancel");
    const apply = this._localize("ui.common.apply", "Apply");
    const close = this._localize("ui.common.close", "Close");
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop series-backdrop";
    backdrop.innerHTML = `<section class="dialog series-dialog" role="dialog" aria-modal="true" aria-label="${this._escape(this._customLocalize("attributes_settings", { target: name }))}">
      <header class="dialog-title"><button class="dialog-close" data-action="close-dialog" title="${this._escape(close)}" aria-label="${this._escape(close)}"><ha-icon icon="mdi:close"></ha-icon></button><h2>${this._escape(this._customLocalize("attributes_settings", { target: name }))}</h2></header>
      <p class="series-note">${this._escape(this._customLocalize("attributes_settings_note"))}</p>
      <div class="target-list series-list">
        ${choices.map((choice) => `<div class="series-choice">
          <label class="target-row series-row">
            <input type="checkbox" data-series="${this._escape(choice.value)}" ${choice.selected ? "checked" : ""}>
            <ha-icon icon="${choice.value === "state" ? "mdi:information-outline" : choice.categorical ? "mdi:format-list-bulleted" : "mdi:chart-line"}"></ha-icon>
            <span class="row-name">${this._escape(choice.label)}<span class="row-secondary">${this._escape(choice.detail)} · ${this._escape(choice.current)}</span></span>
          </label>
          ${choice.categorical ? `<label class="series-map" ${choice.selected ? "" : "hidden"}>
            <span>${this._escape(this._customLocalize("categorical_attribute_values"))}</span>
            <input type="text" data-state-map="${this._escape(choice.value)}" value="${this._escape(choice.mapValues.join(", "))}" placeholder="${this._escape(this._customLocalize("categorical_attribute_values_hint"))}">
          </label>` : ""}
        </div>`).join("")}
      </div>
      <footer class="dialog-actions"><button data-action="cancel">${this._escape(cancel)}</button><button class="primary" data-action="apply">${this._escape(apply)}</button></footer>
    </section>`;
    const applyButton = backdrop.querySelector('[data-action="apply"]');
    const updateApply = () => {
      const selected = [...backdrop.querySelectorAll("[data-series]:checked")];
      const missingMap = selected.some((checkbox) => {
        const input = backdrop.querySelector(
          `[data-state-map="${CSS.escape(checkbox.dataset.series)}"]`
        );
        return input && !input.value.split(",").some((value) => value.trim());
      });
      applyButton.disabled = !selected.length || missingMap;
    };
    backdrop.querySelectorAll("[data-series]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const map = backdrop.querySelector(
          `[data-state-map="${CSS.escape(checkbox.dataset.series)}"]`
        )?.closest(".series-map");
        if (map) map.hidden = !checkbox.checked;
        updateApply();
      });
    });
    backdrop.querySelectorAll("[data-state-map]").forEach((input) =>
      input.addEventListener("input", updateApply)
    );
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) backdrop.remove();
    });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="close-dialog"]').addEventListener("click", () => backdrop.remove());
    applyButton.addEventListener("click", () => {
      const selection = [...backdrop.querySelectorAll("[data-series]:checked")]
        .map((checkbox) => checkbox.dataset.series);
      const chart = this._activeSnapshot
        ? this._clone(this._activeSnapshot)
        : this._captureSnapshot().chart;
      chart.attribute_selection = {
        ...(chart.attribute_selection || {}),
        [entity]: selection,
      };
      const entityOptions = this._clone(
        chart.entity_options || this._effectiveEntityOptionsConfig() || {}
      );
      const choicesByValue = new Map(
        choices.map((choice) => [choice.value, choice])
      );
      for (const attribute of selection) {
        if (attribute === "state" || choicesByValue.get(attribute)?.categorical) continue;
        const key = this._seriesKey(entity, attribute);
        const existing = entityOptions[key];
        if (
          existing &&
          typeof existing === "object" &&
          !Array.isArray(existing) &&
          Object.prototype.hasOwnProperty.call(existing, "state_map")
        ) {
          entityOptions[key] = { ...existing };
          delete entityOptions[key].state_map;
        }
      }
      for (const input of backdrop.querySelectorAll("[data-state-map]")) {
        if (!selection.includes(input.dataset.stateMap)) continue;
        const attribute = input.dataset.stateMap;
        const key = this._seriesKey(entity, attribute);
        const existing = entityOptions[key] || {};
        const existingByValue = new Map(
          this._seriesStateMap(entity, attribute)
            .map((item) => [String(item?.value), item])
        );
        const values = [...new Set(
          input.value.split(",").map((value) => value.trim()).filter(Boolean)
        )];
        entityOptions[key] = {
          ...existing,
          attribute,
          state_map: values.map((value) => ({
            ...(existingByValue.get(value) || {}),
            value,
            label: existingByValue.get(value)?.label || this._seriesStateLabel(value),
          })),
        };
      }
      chart.entity_options = entityOptions;
      this._activeSnapshot = chart;
      this._recordChange(null, true);
      backdrop.remove();
      this._renderGraphs();
    });
    updateApply();
    this.shadowRoot.append(backdrop);
  }

  _toggleTargetVisibility(axis, kind, id) {
    const secondary = axis === "secondary";
    const targets = secondary ? this._y2Targets : this._targets;
    const hiddenTargets = secondary ? this._hiddenY2Targets : this._hiddenTargets;
    if (!targets[kind]?.includes(id)) return;
    const hidden = new Set(hiddenTargets[kind] || []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    hiddenTargets[kind] = [...hidden];
    this._recordChange(null, true);
    this._syncNativeTargetVisibility(axis);
    this._renderGraphs();
  }

  _pruneHiddenTargets() {
    for (const [targetsKey, hiddenKey] of [
      ["_targets", "_hiddenTargets"],
      ["_y2Targets", "_hiddenY2Targets"],
    ]) {
      const hidden = this._normalizeTargets(this[hiddenKey] || {});
      for (const kind of ["area_id", "device_id", "entity_id"]) {
        hidden[kind] = hidden[kind].filter((id) => this[targetsKey][kind].includes(id));
      }
      this[hiddenKey] = hidden;
    }
  }

  _targetCount(targets) {
    const count = (value) => value.area_id.length + value.device_id.length + value.entity_id.length;
    return targets
      ? count(targets)
      : count(this._targets) + (this._secondaryAxisVisible() ? count(this._y2Targets) : 0);
  }

  _snapshotTargetCount(snapshot) {
    return this._targetCount(this._normalizeTargets(snapshot?.targets || {}))
      + this._targetCount(this._normalizeTargets(snapshot?.y2_targets || {}));
  }

  _resolvedEntityIds() {
    const deviceById = new Map(this._devices.map((device) => [device.id, device]));
    const resolve = (targets, hiddenTargets) => {
      const hidden = this._normalizeTargets(hiddenTargets || {});
      const ids = new Set(targets.entity_id);
      const enabled = new Set(
        targets.entity_id.filter((id) => !hidden.entity_id.includes(id))
      );
      const selectedDevices = new Set(targets.device_id);
      const selectedAreas = new Set(targets.area_id);
      const enabledDevices = new Set(
        targets.device_id.filter((id) => !hidden.device_id.includes(id))
      );
      const enabledAreas = new Set(
        targets.area_id.filter((id) => !hidden.area_id.includes(id))
      );
      for (const entity of this._entities) {
        if (entity.disabled_by || (!this.config.include_hidden && entity.hidden_by)) continue;
        const device = entity.device_id ? deviceById.get(entity.device_id) : null;
        const areaId = entity.area_id || device?.area_id;
        if (selectedDevices.has(entity.device_id) || selectedAreas.has(areaId)) ids.add(entity.entity_id);
        if (enabledDevices.has(entity.device_id) || enabledAreas.has(areaId)) enabled.add(entity.entity_id);
      }
      return { ids, enabled };
    };
    const primary = resolve(this._targets, this._hiddenTargets);
    const secondary = this._secondaryAxisVisible()
      ? resolve(this._y2Targets, this._hiddenY2Targets)
      : { ids: new Set(), enabled: new Set() };
    const available = [...new Set([...primary.ids, ...secondary.ids])]
      .filter((id) => this._hass.states[id]);
    this._enabledResolvedEntityIds = new Set([...primary.enabled, ...secondary.enabled]);
    this._y2ResolvedEntityIds = new Set(
      [...secondary.ids].filter((id) => this._hass.states[id])
    );
    if (available.length > this.maxEntities) {
      this._notice = this._customLocalize("entity_limit", { count: available.length, max: this.maxEntities });
      const limited = available.slice(0, this.maxEntities);
      this._y2ResolvedEntityIds = new Set(limited.filter((id) => this._y2ResolvedEntityIds.has(id)));
      return limited;
    }
    return available;
  }

  _openTargetDialog() {
    if (this.shadowRoot.querySelector(".backdrop")) return;
    this._draftTargets = structuredClone(this._targets);
    this._dialogSearch = "";
    this._activeTab = "area_id";
    this._renderDialog();
  }

  _renderDialog() {
    this.shadowRoot.querySelector(".backdrop")?.remove();
    const addTarget = this._localize("ui.components.target-picker.add_target", "Add target");
    const cancel = this._localize("ui.common.cancel", "Cancel");
    const apply = this._localize("ui.common.apply", "Apply");
    const close = this._localize("ui.common.close", "Close");
    const targetTypes = {
      area_id: this._localize("ui.components.target-picker.type.areas", "Areas"),
      device_id: this._localize("ui.components.target-picker.type.devices", "Devices"),
      entity_id: this._localize("ui.components.target-picker.type.entities", "Entities"),
    };
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="${this._escape(addTarget)}">
      <header class="dialog-title"><button class="dialog-close" data-action="close-dialog" title="${this._escape(close)}" aria-label="${this._escape(close)}"><ha-icon icon="mdi:close"></ha-icon></button><h2>${this._escape(addTarget)}</h2><span class="count">${this._escape(this._localize("ui.panel.config.entities.picker.selected", `${this._targetCount(this._draftTargets)} selected`, { number: this._targetCount(this._draftTargets) }))}</span></header>
      <nav class="tabs">${Object.entries(targetTypes).map(([key,label]) => `<button class="tab ${key === this._activeTab ? "active" : ""}" data-tab="${key}">${this._escape(label)}</button>`).join("")}</nav>
      <div class="search-wrap"><input class="search" type="search" placeholder="${this._escape(this._localize("ui.common.search", "Search"))}" value="${this._escape(this._dialogSearch)}"></div>
      <div class="target-list">${this._dialogRows()}</div>
      <footer class="dialog-actions"><button data-action="cancel">${this._escape(cancel)}</button><button class="primary" data-action="apply">${this._escape(apply)}</button></footer>
    </section>`;
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => { this._activeTab = tab.dataset.tab; this._dialogSearch = ""; this._renderDialog(); }));
    const search = backdrop.querySelector(".search");
    search.addEventListener("input", () => { this._dialogSearch = search.value; backdrop.querySelector(".target-list").innerHTML = this._dialogRows(); this._bindDialogRows(backdrop); });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="close-dialog"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="apply"]').addEventListener("click", () => {
      const nextTargets = this._normalizeTargets(this._draftTargets);
      const clearedAll = Boolean(
        this._targetCount(this._targets) && !this._targetCount(nextTargets)
      );
      if (clearedAll) {
        backdrop.remove();
        this._requestClearCurrentChart();
        return;
      }
      this._targets = nextTargets;
      this._pruneHiddenTargets();
      this._saveTargets();
      this._recordChange(null, true);
      this._notice = "";
      backdrop.remove();
      this._render();
    });
    this.shadowRoot.append(backdrop);
    this._bindDialogRows(backdrop);
    search.focus();
  }

  _dialogRows() {
    const search = this._dialogSearch.trim().toLocaleLowerCase();
    let rows;
    if (this._activeTab === "area_id") rows = this._areas.map((area) => ({ id: area.area_id, name: area.name, secondary: this._localize("ui.components.target-picker.type.area", "Area"), icon: "mdi:texture-box" }));
    else if (this._activeTab === "device_id") rows = this._devices.map((device) => ({ id: device.id, name: device.name_by_user || device.name || device.id, secondary: this._areaName(device.area_id), icon: "mdi:devices" }));
    else rows = this._entities.filter((entity) => !entity.disabled_by && (this.config.include_hidden || !entity.hidden_by)).map((entity) => ({
      id: entity.entity_id, name: this._entityName(entity.entity_id), secondary: entity.entity_id,
      icon: this._hass.states[entity.entity_id]?.attributes?.icon || "mdi:checkbox-blank-circle-outline",
    }));
    rows = rows.filter((row) => !search || `${row.name} ${row.secondary}`.toLocaleLowerCase().includes(search)).sort((a,b) => a.name.localeCompare(b.name, this._hass.locale?.language));
    if (!rows.length) return `<div class="no-results">${this._escape(this._localize("ui.components.combo-box.no_match", "No matching items found"))}</div>`;
    return rows.map((row) => `<label class="target-row"><input type="checkbox" data-target-id="${this._escape(row.id)}" ${this._draftTargets[this._activeTab].includes(row.id) ? "checked" : ""}><ha-icon icon="${this._escape(row.icon)}"></ha-icon><span class="row-name">${this._escape(row.name)}<span class="row-secondary">${this._escape(row.secondary || "")}</span></span></label>`).join("");
  }

  _bindDialogRows(backdrop) {
    backdrop.querySelectorAll("[data-target-id]").forEach((checkbox) => checkbox.addEventListener("change", () => {
      const list = this._draftTargets[this._activeTab];
      if (checkbox.checked && !list.includes(checkbox.dataset.targetId)) list.push(checkbox.dataset.targetId);
      if (!checkbox.checked) this._draftTargets[this._activeTab] = list.filter((id) => id !== checkbox.dataset.targetId);
      const selected = this._targetCount(this._draftTargets);
      backdrop.querySelector(".dialog-title .count").textContent = this._localize(
        "ui.panel.config.entities.picker.selected",
        `${selected} selected`,
        { number: selected }
      );
    }));
  }

  _removeTarget(kind, id) {
    if (this._targetCount() === 1) {
      this._requestClearCurrentChart();
      return;
    }
    this._targets[kind] = this._targets[kind].filter((value) => value !== id);
    this._pruneHiddenTargets();
    this._saveTargets();
    this._recordChange(null, true);
    this._notice = "";
    this._render();
  }
  _areaName(id) { return this._areas.find((area) => area.area_id === id)?.name || id || this._localize("ui.components.device-picker.no_area", "No area"); }
  _deviceName(id) { const device = this._devices.find((item) => item.id === id); return device?.name_by_user || device?.name || id; }
  _entityName(id) { const state = this._hass.states[id]; const registry = this._entities.find((item) => item.entity_id === id); return registry?.name || state?.attributes?.friendly_name || id; }
  _entityDisplayName(id) {
    const name = this._entityName(id);
    const entity = this._entities.find((item) => item.entity_id === id);
    const device = entity?.device_id
      ? this._devices.find((item) => item.id === entity.device_id)
      : null;
    const areaId = entity?.area_id || device?.area_id;
    const areaName = areaId
      ? this._areas.find((area) => area.area_id === areaId)?.name
      : null;
    if (!areaName || name.toLocaleLowerCase().includes(areaName.toLocaleLowerCase())) {
      return name;
    }
    return `${name} · ${areaName}`;
  }
}
