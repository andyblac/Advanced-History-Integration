export class EnergyMethods {
  _panelDayPeriod() {
    const start = this._energyCollection?.start;
    const end = this._energyCollection?.end;
    if (!(start instanceof Date) || !(end instanceof Date)) return null;
    const duration = end.getTime() - start.getTime();
    // A Day view can cross midnight after its time window is shifted. Allow
    // up to 25 hours so a full local day also survives a DST transition.
    if (duration <= 0 || duration > 25 * 60 * 60 * 1000) return null;
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);
    const range = this._panelTimeRange;
    const visibleStart = new Date(dayStart);
    const visibleEnd = new Date(dayStart);
    if (range) {
      visibleStart.setMinutes(range.start, 0, 0);
      visibleEnd.setMinutes(range.end, 0, 0);
      if (visibleEnd <= visibleStart) visibleEnd.setDate(visibleEnd.getDate() + 1);
    } else {
      visibleEnd.setHours(23, 59, 0, 0);
    }
    return {
      start: visibleStart,
      end: visibleEnd,
      collectionStart: start,
      collectionEnd: end,
      dayStart,
      dayEnd,
    };
  }

  _panelGraphHourOptions() {
    const period = this._panelDayPeriod();
    const range = this._panelTimeRange;
    if (!period || !range) return {};
    return {
      graph_start_hour: range.start / 60,
      graph_end_hour: range.end / 60,
    };
  }

  _normalizeEnergyDayPeriod(collection = this._energyCollection, refresh = true) {
    const start = collection?.start instanceof Date
      ? collection.start
      : collection?.start ? new Date(collection.start) : null;
    const end = collection?.end instanceof Date
      ? collection.end
      : collection?.end ? new Date(collection.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    const duration = end.getTime() - start.getTime();
    if (duration <= 0 || duration > 25 * 60 * 60 * 1000) return false;
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);
    const alreadyFullDay = start.getTime() === dayStart.getTime()
      && Math.abs(end.getTime() - dayEnd.getTime()) < 60_000;
    if (alreadyFullDay) return false;
    this._panelTimeRange = {
      start: start.getHours() * 60 + start.getMinutes(),
      end: end.getHours() * 60 + end.getMinutes(),
    };
    collection.setPeriod(dayStart, dayEnd);
    if (refresh) collection.refresh?.();
    return true;
  }

  _panelTimeValue(value) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
  }

  _panelTimeDisplayValue(value) {
    return this._panelTimeValue(value).slice(0, 5);
  }

  _energySelectionKey(collection = this._energyCollection) {
    const time = (value) => value instanceof Date ? value.getTime() : new Date(value).getTime();
    return `${time(collection?.start)}|${time(collection?.end)}|${collection?.compare || ""}`;
  }

  _beginEnergyInteractionLoading() {
    if (this._periodRestoreLoading) return;
    this._energyInteractionLoading = true;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    const text = this.shadowRoot?.getElementById("period-loading-text");
    if (text) text.textContent = this._customLocalize("loading_requested_range");
    if (banner) banner.hidden = false;
    const compareBanner = this.shadowRoot?.getElementById("compare-banner");
    if (compareBanner) compareBanner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    if (charts) charts.hidden = true;
  }

  _finishEnergyInteractionLoading(compareHost, compareCard) {
    if (!this._energyInteractionLoading) return;
    this._energyInteractionLoading = false;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    if (banner && !this._periodRestoreLoading) banner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    if (charts && !this._periodRestoreLoading) charts.hidden = false;
    if (compareHost && compareCard && !this._periodRestoreLoading) {
      compareHost.hidden = Boolean(compareCard.hidden);
    }
  }

  _syncPanelTimeRangeControl() {
    const control = this.shadowRoot?.getElementById("panel-time-range");
    if (!control) return;
    const period = this._panelDayPeriod();
    const restoring = this._periodRestoreLoading && Boolean(this._periodRestoreExpected?.start);
    control.hidden = !period || restoring;
    if (!period || restoring) return;
    const value = control.querySelector(".panel-time-range-value");
    if (value) {
      value.textContent = `${this._panelTimeDisplayValue(period.start)} – ${this._panelTimeDisplayValue(period.end)}`;
    }
  }

  _renderPanelTimeRangeControl(host) {
    host.querySelector("#panel-time-range")?.remove();
    const control = document.createElement("button");
    control.type = "button";
    control.id = "panel-time-range";
    control.className = "panel-time-range";
    control.title = this._localize("ui.components.date-range-picker.select_date_range", "Time range");
    control.innerHTML = `
      <ha-icon icon="mdi:clock-outline"></ha-icon>
      <span class="panel-time-range-value"></span>`;
    control.addEventListener("click", (event) => {
      event.stopPropagation();
      this._openPanelTimeRangeDialog();
    });
    host.append(control);
    this._syncPanelTimeRangeControl();
  }

  _openPanelTimeRangeDialog() {
    const period = this._panelDayPeriod();
    if (!period) return;
    this._closePanelTimeRangeDialog?.();
    const cancel = this._localize("ui.common.cancel", "Cancel");
    const select = this._localize("ui.common.select", "Select");
    const reset = this._localize("ui.common.reset", "Reset");
    const title = this._localize("ui.components.date-range-picker.select_date_range", "Time range");
    const startLabel = this._localize("ui.components.calendar.event.start", "Start");
    const endLabel = this._localize("ui.components.calendar.event.end", "End");
    const narrow = window.matchMedia("(max-width: 870px)").matches
      || window.matchMedia("(max-height: 500px)").matches;
    const picker = document.createElement(narrow ? "ha-bottom-sheet" : "wa-popover");
    picker.className = narrow ? "time-range-sheet" : "time-range-popover";
    picker.innerHTML = `<div class="time-range-fields">
        <label><span>${this._escape(startLabel)}</span><ha-time-input data-time="start"></ha-time-input></label>
        <span class="time-range-separator" aria-hidden="true">–</span>
        <label><span>${this._escape(endLabel)}</span><ha-time-input data-time="end"></ha-time-input></label>
      </div>
      <footer class="time-range-actions">
        <ha-button appearance="plain" data-action="reset">${this._escape(reset)}</ha-button>
        <span class="time-range-primary-actions">
          <ha-button appearance="plain" data-action="cancel">${this._escape(cancel)}</ha-button>
          <ha-button data-action="apply">${this._escape(select)}</ha-button>
        </span>
      </footer>`;
    picker.setAttribute("aria-label", title);
    if (narrow) {
      picker.flexContent = true;
    } else {
      picker.setAttribute("for", "panel-time-range");
      picker.withoutArrow = true;
      picker.placement = "top";
      picker.distance = 8;
      picker.trapFocus = true;
    }
    const startInput = picker.querySelector('ha-time-input[data-time="start"]');
    const endInput = picker.querySelector('ha-time-input[data-time="end"]');
    for (const input of [startInput, endInput]) {
      input.locale = this._hass.locale;
      input.enableSecond = false;
      input.placeholderLabels = false;
    }
    startInput.value = this._panelTimeValue(period.start);
    endInput.value = this._panelTimeValue(period.end);
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      picker.remove();
      if (this._closePanelTimeRangeDialog === close) {
        this._closePanelTimeRangeDialog = undefined;
      }
    };
    const close = () => {
      picker.open = false;
      setTimeout(remove, 350);
    };
    this._closePanelTimeRangeDialog = close;
    picker.addEventListener(narrow ? "closed" : "wa-after-hide", remove);
    picker.querySelector('ha-button[data-action="reset"]').addEventListener("click", () => {
      if (this._setPanelTimeRange("00:00:00", "23:59:00")) close();
    });
    picker.querySelector('ha-button[data-action="cancel"]').addEventListener("click", close);
    picker.querySelector('ha-button[data-action="apply"]').addEventListener("click", () => {
      if (this._setPanelTimeRange(startInput.value, endInput.value)) close();
    });
    this.shadowRoot.append(picker);
    requestAnimationFrame(() => {
      if (picker.isConnected) picker.open = true;
    });
  }

  _setPanelTimeRange(startValue, endValue) {
    const period = this._panelDayPeriod();
    if (!this._energyCollection || !period) return false;
    const parse = (value) => {
      const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value || "");
      return match ? [Number(match[1]), Number(match[2])] : null;
    };
    const startParts = parse(startValue);
    const endParts = parse(endValue);
    if (!startParts || !endParts) {
      this._syncPanelTimeRangeControl();
      return false;
    }
    const start = startParts[0] * 60 + startParts[1];
    const end = endParts[0] * 60 + endParts[1];
    const next = start === 0 && end === 1439 ? null : { start, end };
    const changed = JSON.stringify(this._panelTimeRange) !== JSON.stringify(next);
    if (!changed) return true;
    this._beginGraphDataSourceCycle();
    this._panelTimeRange = next;
    this._renderGraphs();
    this._syncPanelTimeRangeControl();
    this._recordChange(null, true);
    return true;
  }

  _resetPanelTimeRangeOutsideDayView() {
    if (!this._panelTimeRange || this._panelDayPeriod()) return false;
    this._closePanelTimeRangeDialog?.();
    this._panelTimeRange = null;
    this._syncPanelTimeRangeControl();
    return true;
  }

  _shiftPanelTimeRange(direction) {
    const period = this._panelDayPeriod();
    if (!this._energyCollection || !period || ![-1, 1].includes(direction)) return false;
    if (!this._panelTimeRange) return this._shiftPanelDay(direction);
    const { start, end } = this._panelTimeRange;
    const duration = (end - start + 1440) % 1440;
    if (!duration) return false;
    const wrap = (minutes) => (minutes % 1440 + 1440) % 1440;
    const shiftedStart = start + direction * duration;
    const shiftedEnd = end + direction * duration;
    const dayShift = Math.floor(shiftedStart / 1440);
    this._closePanelTimeRangeDialog?.();
    this._panelTimeRange = {
      start: wrap(shiftedStart),
      end: wrap(shiftedEnd),
    };
    if (dayShift) return this._shiftPanelDay(dayShift);
    this._beginGraphDataSourceCycle();
    this._renderGraphs();
    this._syncPanelTimeRangeControl();
    this._recordChange(null, true);
    return true;
  }

  _shiftPanelDay(direction) {
    const collection = this._energyCollection;
    const period = this._panelDayPeriod();
    if (!collection || !period || ![-1, 1].includes(direction)) return false;
    const start = new Date(period.dayStart);
    const end = new Date(period.dayEnd);
    start.setDate(start.getDate() + direction);
    end.setDate(end.getDate() + direction);
    this._closePanelTimeRangeDialog?.();
    this._beginGraphDataSourceCycle();
    this._beginEnergyInteractionLoading();
    collection.setPeriod(start, end);
    collection.refresh?.();
    return true;
  }

  _bindPanelTimeNavigation(host) {
    if (!customElements.get("action-handler")) {
      if (!host.__advancedHistoryTimeNavigationPending) {
        host.__advancedHistoryTimeNavigationPending = true;
        customElements.whenDefined("action-handler").then(() => {
          host.__advancedHistoryTimeNavigationPending = false;
          if (host.isConnected) this._bindPanelTimeNavigation(host);
        });
      }
      return;
    }
    const previousLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.previous",
      "Previous"
    );
    const nextLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.next",
      "Next"
    );
    const directionFromButton = (button) => {
      const label = button?.label || button?.getAttribute?.("aria-label");
      return label === previousLabel ? -1 : label === nextLabel ? 1 : 0;
    };
    const handleAction = (event) => {
      const button = event.currentTarget;
      const direction = directionFromButton(button);
      if (!direction || !this._panelDayPeriod()) return;
      event.stopPropagation();
      if (event.detail?.action === "tap") {
        this._shiftPanelTimeRange(direction);
        return;
      }
      if (event.detail?.action !== "hold") return;
      this._shiftPanelDay(direction);
    };
    let actionHandler = document.body.querySelector("action-handler");
    if (!actionHandler) {
      actionHandler = document.createElement("action-handler");
      document.body.append(actionHandler);
    }
    if (typeof actionHandler.bind !== "function") return;
    const prepareButton = (button) => {
      if (!directionFromButton(button) || button.__advancedHistoryTimeNavigation) return false;
      button.__advancedHistoryTimeNavigation = true;
      actionHandler.bind(button, { hasHold: true });
      button.addEventListener("action", handleAction);
      // The Energy selector owns these buttons and would otherwise also move
      // the selected day. Finish the HA action gesture here, then prevent its
      // ordinary click handler from seeing the same event.
      button.addEventListener("click", (event) => {
        if (!this._panelDayPeriod()) return;
        event.preventDefault();
        button.actionHandler?.end?.(event);
        event.stopPropagation();
        event.stopImmediatePropagation();
      }, true);
      return true;
    };
    for (const observer of host.__advancedHistoryTimeNavigationObservers || []) {
      observer.disconnect();
    }
    const observers = [];
    host.__advancedHistoryTimeNavigationObservers = observers;
    const observedRoots = new WeakSet();
    let prepareRenderedButtons;
    const observeRenderedRoot = (root) => {
      if (!root || observedRoots.has(root)) return;
      observedRoots.add(root);
      const observer = new MutationObserver(() => prepareRenderedButtons(root));
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
    };
    prepareRenderedButtons = (root) => {
      observeRenderedRoot(root);
      let found = 0;
      for (const element of root?.querySelectorAll?.("*") || []) {
        if (element.localName === "ha-icon-button" && directionFromButton(element)) {
          found += 1;
          prepareButton(element);
        }
        if (element.shadowRoot) {
          found += prepareRenderedButtons(element.shadowRoot);
        }
      }
      return found;
    };
    // Lit normally creates each shadow root synchronously, while filling it on
    // a later render. Keep the observers for subsequent replacements and also
    // rescan briefly so a shadow root attached after this call is discovered.
    let discoveryAttempts = 0;
    const discoverRenderedRoots = () => {
      if (!host.isConnected || discoveryAttempts >= 60) return;
      discoveryAttempts += 1;
      prepareRenderedButtons(host);
      requestAnimationFrame(discoverRenderedRoots);
    };
    discoverRenderedRoots();
  }

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
      controller.classList.add("energy-date-controller");
      controller.hass = this._hass;
      host.replaceChildren(controller);
      this._cards.push(controller);
      this._replaceEnergyDownloadAction(controller);
      this._makeEnergySelectorFixed(controller, token);

      const compareCard = helpers.createCardElement({ type: "energy-compare" });
      const syncCompareVisibility = () => {
        compareHost.hidden = this._periodRestoreLoading
          || this._energyInteractionLoading
          || Boolean(compareCard.hidden);
      };
      // The native card can synchronously replay cached Energy data as soon as
      // it connects. Listen before connecting it so its first visibility event
      // cannot be missed during a hard-refresh restore.
      compareCard.addEventListener("card-visibility-changed", syncCompareVisibility);
      compareCard.hass = this._hass;
      compareHost.replaceChildren(compareCard);
      compareHost.hidden = true;
      this._cards.push(compareCard);
      syncCompareVisibility();
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
        await selector.updateComplete;
        const attachDatePickerListener = () => {
          const datePicker = selector.shadowRoot?.querySelector("ha-date-range-picker");
          if (!datePicker || datePicker.__advancedHistoryDetailListener) return;
          datePicker.__advancedHistoryDetailListener = true;
          datePicker.addEventListener("value-changed", () => {
            const hadPanelTimeRange = Boolean(this._panelTimeRange);
            if (hadPanelTimeRange) {
              this._setPanelTimeRange("00:00:00", "23:59:00");
            } else {
              this._beginGraphDataSourceCycle();
            }
            this._beginEnergyInteractionLoading();
            requestAnimationFrame(() => {
              const nextDetailKey = this._largeRangeDetailRenderKey();
              if (nextDetailKey !== this._largeRangeDetailStateKey) {
                this._largeRangeDetailStateKey = nextDetailKey;
                this._renderGraphs();
              }
            });
          });
        };
        attachDatePickerListener();
        if (selector.shadowRoot && !selector.__advancedHistoryDetailObserver) {
          selector.__advancedHistoryDetailObserver = new MutationObserver(
            attachDatePickerListener,
          );
          selector.__advancedHistoryDetailObserver.observe(
            selector.shadowRoot,
            { childList: true, subtree: true },
          );
        }
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  _replaceEnergyDownloadAction(controller) {
    const downloadLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.download_data",
      "Download data"
    );
    const normalizedLabel = downloadLabel.trim().replace(/\s+/g, " ");
    controller.addEventListener("click", (event) => {
      const item = event.composedPath().find((node) => node?.localName === "ha-dropdown-item");
      const itemLabel = item?.textContent?.trim().replace(/\s+/g, " ");
      if (itemLabel !== normalizedLabel) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const dropdown = item.closest?.("ha-dropdown");
      if (dropdown) dropdown.open = false;
      this._downloadChartData();
    }, true);
  }

  _downloadChartData() {
    const downloads = this._graphCards.flatMap((card, index) => {
      const csv = typeof card._buildCsvText === "function" ? card._buildCsvText() : null;
      if (!csv) return [];
      const title = card._config?.card_header || (index ? `chart-${index + 1}` : "chart");
      return [{ csv, title }];
    });
    if (!downloads.length) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: this._localize("ui.components.data-table.no-data", "No data") },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    const now = new Date();
    const part = (value) => String(value).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}`;
    downloads.forEach(({ csv, title }, index) => {
      const safeTitle = String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `chart-${index + 1}`;
      const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `advanced-history-${safeTitle}-${timestamp}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
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
    // Older partial-day builds stored the selected hours directly in HA's
    // shared Energy collection. Convert that cached selection back to a
    // native full-day period before mounting the replacement graph cards.
    // The visible hours are now card filters, not an Energy date range.
    const normalizedEnergyDay = this._normalizeEnergyDayPeriod(collection, false);
    this._activateGraphDataSourceTracking();
    this._renderPanelTimeRangeControl(host);

    const restoringPeriod = Boolean(
      this._periodRestoreLoading && this._periodRestoreExpected?.start
    );
    // Energy subscriptions immediately replay their cached payload. During a
    // saved-range restore that replay may already match the requested period,
    // but it is not the result of the refresh below. Do not complete the
    // restore (or reveal the old graph) until a post-refresh payload arrives.
    let restoreRefreshStarted = !restoringPeriod;
    if (restoringPeriod) {
      // setPeriod() changes only the collection's selected dates. Mount the
      // graph against those dates before refreshing so its Energy subscriber
      // is present for the authoritative restored-range result.
      // A saved-range restore must also take precedence over an empty-chart
      // reset left pending before the bookmark was loaded.
      this._energyResetPending = false;
      this._restorePendingPeriod(collection, false);
    } else if (this._energyResetPending || !this._targetCount()) {
      this._resetEnergySelection(collection);
    } else {
      this._restorePendingPeriod(collection);
    }

    const applyMode = (mode = collection.compare, force = false) => {
      if (this._energyRenderToken !== token) return;
      compareHost.hidden = this._periodRestoreLoading
        || this._energyInteractionLoading
        || Boolean(compareCard.hidden);
      const effectiveMode = this._periodRestoreLoading ? collection.compare : mode;
      const dayPeriod = this._panelDayPeriod();
      const next = effectiveMode === "previous"
        ? (dayPeriod ? "yesterday" : "previous_period")
        : effectiveMode === "yoy" ? "last_year" : null;
      const nextDetailKey = this._largeRangeDetailRenderKey();
      if (this._periodRestoreLoading) {
        this._energyCompare = next;
        this._largeRangeDetailStateKey = nextDetailKey;
        return;
      }
      if (!force && next === this._energyCompare && nextDetailKey === this._largeRangeDetailStateKey) return;
      this._energyCompare = next;
      this._largeRangeDetailStateKey = nextDetailKey;
      this._renderGraphs();
    };
    applyMode();
    if (normalizedEnergyDay && !restoringPeriod) {
      this._renderGraphs();
    }
    if (restoringPeriod) {
      this._renderGraphs();
      const charts = this.shadowRoot?.getElementById("charts");
      if (charts) charts.hidden = true;
    }
    this._energyUnsubscribe = collection.subscribe((data) => {
      const periodRestored = restoreRefreshStarted
        ? this._completePeriodRestoreFromData(data, collection)
        : false;
      const timeRangeReset = this._resetPanelTimeRangeOutsideDayView();
      // The mode is usually unchanged while restoring a bookmark, but the
      // old graph cards were deliberately removed by _beginPeriodRestore().
      // Force their recreation once the requested Energy data is confirmed.
      applyMode(data?.compareMode, periodRestored || timeRangeReset);
      if (periodRestored) {
        compareHost.hidden = Boolean(compareCard.hidden);
        this._renderLargeRangeDetailBanner();
      }
      this._finishEnergyInteractionLoading(compareHost, compareCard);
      // The collection update is authoritative for picker changes that can
      // finish after the click fallback, including clearing Compare.
      this._syncPanelTimeRangeControl();
      if (data?.start && !this._periodRestoreLoading) {
        this._recordChange(null, true);
      }
    });
    if (normalizedEnergyDay && !restoringPeriod) {
      collection.refresh?.();
    }
    if (restoringPeriod) {
      // Give newly connected graph cards one render cycle to subscribe before
      // the restored EnergyData is published.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (this._energyRenderToken !== token || !compareCard.isConnected) return;
      restoreRefreshStarted = true;
      collection.refresh?.();
    } else {
      this._recordChange();
    }
    const syncAfterInteraction = () => {
      queueMicrotask(() => {
        applyMode(collection.compare);
        this._syncPanelTimeRangeControl();
        this._recordChange(null, true);
      });
      setTimeout(() => {
        applyMode(collection.compare);
        this._syncPanelTimeRangeControl();
        this._recordChange(null, true);
      }, 150);
    };
    this._bindPanelTimeNavigation(host);
    const beginDataSourceCycle = () => this._beginGraphDataSourceCycle();
    const navigationActionLabels = new Set([
      this._localize(
        "ui.panel.lovelace.components.energy_period_selector.previous",
        "Previous"
      ),
      this._localize(
        "ui.panel.lovelace.components.energy_period_selector.next",
        "Next"
      ),
    ]);
    const energyActionLabels = new Set([
      ...navigationActionLabels,
      this._localize(
        "ui.panel.lovelace.components.energy_period_selector.now",
        "Now"
      ),
      this._localize(
        "ui.panel.lovelace.components.energy_period_selector.compare",
        "Compare data"
      ),
    ]);
    const beginChangedSelectionCycle = (event) => {
      let directEnergyAction = null;
      event.composedPath().some((node) => {
        const label = node?.label || node?.getAttribute?.("aria-label");
        if (label && energyActionLabels.has(label)) {
          directEnergyAction = label;
          return true;
        }
        if (!["ha-button", "ha-dropdown-item"].includes(node?.localName)) return false;
        const text = node.textContent?.trim();
        if (!energyActionLabels.has(text)) return false;
        directEnergyAction = text;
        return true;
      });
      if (directEnergyAction) {
        // In Day view these arrows are intercepted by
        // _bindPanelTimeNavigation(): tap moves the visible hour window and
        // hold calls _shiftPanelDay(), which starts its own Energy loading
        // cycle. Starting one here for the tap would never be completed,
        // because changing graph hours does not publish Energy collection
        // data.
        if (
          this._panelDayPeriod()
          && navigationActionLabels.has(directEnergyAction)
        ) return;
        this._beginEnergyInteractionLoading();
        return;
      }
      const previous = this._energySelectionKey(collection);
      queueMicrotask(() => {
        if (this._energySelectionKey(collection) !== previous) {
          this._beginEnergyInteractionLoading();
        }
      });
    };
    host.addEventListener("click", beginDataSourceCycle, true);
    compareHost.addEventListener("click", beginDataSourceCycle, true);
    host.addEventListener("click", beginChangedSelectionCycle, true);
    compareHost.addEventListener("click", beginChangedSelectionCycle, true);
    host.addEventListener("click", syncAfterInteraction);
    compareHost.addEventListener("click", syncAfterInteraction);
  }

  _resetEnergySelection(collection = this._energyCollection) {
    this._pendingPeriodRestore = null;
    this._finishPeriodRestore();
    this._finishEnergyInteractionLoading();
    this._energyCompare = null;
    this._largeRangeFineDetail = false;
    this._largeRangeDetailStateKey = null;
    this._largeRangeDetailDismissedKey = null;
    const compareHost = this.shadowRoot?.getElementById("compare-banner");
    if (compareHost) compareHost.hidden = true;

    if (!collection) {
      this._energyResetPending = true;
      return false;
    }

    // Keep the reset pending while the chart is empty. Home Assistant may
    // remount its Energy collection after the targets are cleared and expose
    // the previously cached period again. Reapply Today on that remount, then
    // clear the flag when the first new target is added.
    this._energyResetPending = !this._targetCount();
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
