export class TargetPickerMethods {
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

  async _renderNativeTargetPicker() {
    const host = this.shadowRoot.getElementById("target-picker-host");
    if (!host) return;
    try {
      await this._loadNativeHistoryPicker();
      if (!host.isConnected) return;
      const picker = document.createElement("ha-target-picker");
      picker.hass = this._targetPickerHass();
      picker.value = structuredClone(this._targets);
      picker.narrow = this._narrow;
      picker.setAttribute("add-on-top", "");
      picker.setAttribute("compact", "");
      picker.addEventListener("value-changed", (event) => this._nativeTargetsChanged(event));
      picker.addEventListener("click", (event) => this._nativeTargetChipClicked(event));
      host.replaceChildren(picker);
      this._nativeTargetPicker = picker;
      await picker.updateComplete;
      this._syncNativeTargetVisibility();
    } catch (error) {
      console.error("Advanced History: native target picker could not be loaded", error);
      if (host.isConnected) {
        const message = this._customLocalize("native_picker_error", { error: error.message || error });
        host.innerHTML = `<div class="native-picker-status">${this._escape(message)}</div>`;
      }
    }
  }

  _nativeTargetsChanged(event) {
    const nextTargets = this._normalizeTargets(event.detail?.value || {});
    if (this._targetCount(this._targets) && !this._targetCount(nextTargets)) {
      this._archiveCurrentChart();
      this._activeSnapshot = null;
    }
    this._targets = nextTargets;
    this._pruneHiddenTargets();
    if (!this._targetCount()) this._resetEnergySelection();
    if (this._nativeTargetPicker) {
      this._nativeTargetPicker.value = structuredClone(this._targets);
      this._nativeTargetPicker.requestUpdate?.();
    }
    this._saveTargets();
    this._recordChange();
    this._notice = "";
    const removeAll = this.shadowRoot.getElementById("remove-all");
    if (removeAll) removeAll.hidden = !this._targetCount();
    this._syncNativeTargetVisibility();
    this.shadowRoot.querySelector(".notice")?.remove();
    this._renderGraphs();
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

  _nativeTargetChipClicked(event) {
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
    if (!this._targets[kind]) return;
    this._toggleTargetVisibility(kind, chip.itemId);
  }

  _syncNativeTargetVisibility() {
    const picker = this._nativeTargetPicker;
    if (!picker) return;
    const apply = () => {
      if (picker !== this._nativeTargetPicker || !picker.shadowRoot) return;
      picker.shadowRoot.querySelectorAll("ha-target-picker-value-chip").forEach((chip) => {
        const kind = `${chip.type}_id`;
        const hidden = Boolean(this._hiddenTargets[kind]?.includes(chip.itemId));
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
      });
    };
    if (picker.updateComplete?.then) picker.updateComplete.then(apply);
    else queueMicrotask(apply);
  }

  _toggleTargetVisibility(kind, id) {
    if (!this._targets[kind]?.includes(id)) return;
    const hidden = new Set(this._hiddenTargets[kind] || []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    this._hiddenTargets[kind] = [...hidden];
    this._recordChange();
    this._syncNativeTargetVisibility();
    this._renderGraphs();
  }

  _pruneHiddenTargets() {
    const hidden = this._normalizeTargets(this._hiddenTargets || {});
    for (const kind of ["area_id", "device_id", "entity_id"]) {
      hidden[kind] = hidden[kind].filter((id) => this._targets[kind].includes(id));
    }
    this._hiddenTargets = hidden;
  }

  _targetCount(targets = this._targets) { return targets.area_id.length + targets.device_id.length + targets.entity_id.length; }

  _resolvedEntityIds() {
    const hidden = this._normalizeTargets(this._hiddenTargets || {});
    const ids = new Set(this._targets.entity_id);
    const enabled = new Set(
      this._targets.entity_id.filter((id) => !hidden.entity_id.includes(id))
    );
    const selectedDevices = new Set(this._targets.device_id);
    const selectedAreas = new Set(this._targets.area_id);
    const enabledDevices = new Set(
      this._targets.device_id.filter((id) => !hidden.device_id.includes(id))
    );
    const enabledAreas = new Set(
      this._targets.area_id.filter((id) => !hidden.area_id.includes(id))
    );
    const deviceById = new Map(this._devices.map((device) => [device.id, device]));
    for (const entity of this._entities) {
      if (entity.disabled_by || (!this.config.include_hidden && entity.hidden_by)) continue;
      const device = entity.device_id ? deviceById.get(entity.device_id) : null;
      const areaId = entity.area_id || device?.area_id;
      if (selectedDevices.has(entity.device_id) || selectedAreas.has(areaId)) ids.add(entity.entity_id);
      if (enabledDevices.has(entity.device_id) || enabledAreas.has(areaId)) enabled.add(entity.entity_id);
    }
    const available = [...ids].filter((id) => this._hass.states[id]);
    this._enabledResolvedEntityIds = enabled;
    if (available.length > this.maxEntities) {
      this._notice = this._customLocalize("entity_limit", { count: available.length, max: this.maxEntities });
      return available.slice(0, this.maxEntities);
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
    const targetTypes = {
      area_id: this._localize("ui.components.target-picker.type.areas", "Areas"),
      device_id: this._localize("ui.components.target-picker.type.devices", "Devices"),
      entity_id: this._localize("ui.components.target-picker.type.entities", "Entities"),
    };
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="${this._escape(addTarget)}">
      <header class="dialog-title"><h2>${this._escape(addTarget)}</h2><span class="count">${this._escape(this._localize("ui.panel.config.entities.picker.selected", `${this._targetCount(this._draftTargets)} selected`, { number: this._targetCount(this._draftTargets) }))}</span></header>
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
    backdrop.querySelector('[data-action="apply"]').addEventListener("click", () => { const nextTargets = this._normalizeTargets(this._draftTargets); if (this._targetCount(this._targets) && !this._targetCount(nextTargets)) { this._archiveCurrentChart(); this._activeSnapshot = null; } this._targets = nextTargets; this._pruneHiddenTargets(); if (!this._targetCount()) this._resetEnergySelection(); this._saveTargets(); this._recordChange(); this._notice = ""; backdrop.remove(); this._render(); });
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

  _removeTarget(kind, id) { if (this._targetCount() === 1) { this._archiveCurrentChart(); this._activeSnapshot = null; } this._targets[kind] = this._targets[kind].filter((value) => value !== id); this._pruneHiddenTargets(); if (!this._targetCount()) this._resetEnergySelection(); this._saveTargets(); this._recordChange(); this._notice = ""; this._render(); }
  _areaName(id) { return this._areas.find((area) => area.area_id === id)?.name || id || this._localize("ui.components.device-picker.no_area", "No area"); }
  _deviceName(id) { const device = this._devices.find((item) => item.id === id); return device?.name_by_user || device?.name || id; }
  _entityName(id) { const state = this._hass.states[id]; const registry = this._entities.find((item) => item.entity_id === id); return registry?.name || state?.attributes?.friendly_name || id; }
}
