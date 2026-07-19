export class EnergyMethods {
  async _renderEnergyController() {
    const host = this.shadowRoot.getElementById("date-controller");
    const compareHost = this.shadowRoot.getElementById("compare-banner");
    if (!host || !compareHost) return;
    const token = Symbol("energy-picker-render");
    this._energyRenderToken = token;
    const dateRange = this._localize("ui.components.date-range-picker.select_date_range", "Select time period");
    const loading = this._localize("ui.common.loading", "Loading");
    host.innerHTML = `<div class="target-picker" style="cursor:default"><span class="target-label">${this._escape(dateRange)}</span><span style="padding:3px 4px;color:var(--secondary-text-color)">${this._escape(loading)}…</span></div>`;
    try {
      if (typeof window.loadCardHelpers !== "function") throw new Error("Home Assistant card helpers are unavailable");
      const helpers = await window.loadCardHelpers();
      if (this._energyRenderToken !== token || !host.isConnected) return;
      const controller = helpers.createCardElement({
        type: "energy-date-selection",
        vertical_opening_direction: "up",
        opening_direction: "center",
      });
      controller.hass = this._hass;
      host.replaceChildren(controller);
      this._cards.push(controller);
      this._makeEnergySelectorFixed(controller, token);

      const compareCard = helpers.createCardElement({ type: "energy-compare" });
      compareCard.hass = this._hass;
      compareHost.replaceChildren(compareCard);
      compareHost.hidden = true;
      this._cards.push(compareCard);
      compareCard.addEventListener("card-visibility-changed", () => { compareHost.hidden = Boolean(compareCard.hidden); });
      await this._bindEnergyCollection(token, host, compareHost, compareCard);
    } catch (error) {
      if (this._energyRenderToken !== token || !host.isConnected) return;
      console.error("Advanced History: Energy date selector failed to load", error);
      host.innerHTML = `<div class="error" style="padding:10px">${this._escape(this._customLocalize("energy_selector_error"))}</div>`;
    }
  }

  async _makeEnergySelectorFixed(controller, token) {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (this._energyRenderToken !== token || !controller.isConnected) return;
      await controller.updateComplete;
      const selector = controller.shadowRoot?.querySelector("hui-energy-period-selector");
      if (selector) {
        selector.fixed = true;
        selector.verticalOpeningDirection = "up";
        selector.openingDirection = "center";
        selector.requestUpdate?.();
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  async _bindEnergyCollection(token, host, compareHost, compareCard) {
    const connectionKey = this._hass.panelUrl ? `_energy_${this._hass.panelUrl}` : "_energy";
    let collection;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (this._energyRenderToken !== token || !compareCard.isConnected) return;
      collection = this._hass.connection?.[connectionKey];
      if (collection) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (!collection || typeof collection.subscribe !== "function") {
      console.warn("Advanced History: Energy collection was not found; comparison cannot be synchronized");
      return;
    }
    this._energyCollection = collection;

    if (this._energyResetPending || !this._targetCount()) {
      this._resetEnergySelection(collection);
    } else {
      this._restorePendingPeriod(collection);
    }

    const applyMode = (mode = collection.compare) => {
      if (this._energyRenderToken !== token) return;
      compareHost.hidden = Boolean(compareCard.hidden);
      const next = mode === "previous" ? "previous_period" : mode === "yoy" ? "last_year" : null;
      if (next === this._energyCompare) return;
      this._energyCompare = next;
      this._renderGraphs();
    };
    applyMode();
    this._energyUnsubscribe = collection.subscribe((data) => {
      applyMode(data?.compareMode);
      this._completePeriodRestoreFromData(data, collection);
      if (data?.start) this._recordChange();
    });
    this._recordChange();
    const syncAfterInteraction = () => {
      queueMicrotask(() => applyMode(collection.compare));
      setTimeout(() => applyMode(collection.compare), 150);
    };
    host.addEventListener("click", syncAfterInteraction);
    compareHost.addEventListener("click", syncAfterInteraction);
  }

  _resetEnergySelection(collection = this._energyCollection) {
    this._pendingPeriodRestore = null;
    this._finishPeriodRestore();
    this._energyCompare = null;
    const compareHost = this.shadowRoot?.getElementById("compare-banner");
    if (compareHost) compareHost.hidden = true;

    if (!collection) {
      this._energyResetPending = true;
      return false;
    }

    this._energyResetPending = false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const periodChanged = collection.start?.getTime?.() !== start.getTime()
      || collection.end?.getTime?.() !== end.getTime();
    const compareChanged = Boolean(collection.compare);
    if (periodChanged) collection.setPeriod(start, end);
    if (compareChanged) collection.setCompare?.("");
    if (periodChanged || compareChanged) collection.refresh?.();
    return periodChanged || compareChanged;
  }

}
