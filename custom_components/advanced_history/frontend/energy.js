export class EnergyMethods {
  _energyCompareChoiceFromNative(mode) {
    return mode === "previous"
      ? "previous_period"
      : mode === "yoy" ? "last_year" : null;
  }

  _nativeEnergyCompareMode(choice) {
    return choice === "last_year" ? "yoy" : choice ? "previous" : "";
  }

  _energyCompareRange(start, end, choice, count = 1) {
    if (!(start instanceof Date) || !(end instanceof Date)) return null;
    if (choice === "previous_period") {
      const duration = end.getTime() - start.getTime();
      if (duration <= 0) return null;
      const periods = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));
      return {
        start: new Date(start.getTime() - duration * periods),
        end: new Date(start),
      };
    }
    if (choice === "last_month") {
      const compareStart = new Date(start);
      const dayOfMonth = compareStart.getDate();
      compareStart.setDate(1);
      compareStart.setMonth(compareStart.getMonth() - 1);
      const lastTargetDay = new Date(
        compareStart.getFullYear(),
        compareStart.getMonth() + 1,
        0,
      ).getDate();
      compareStart.setDate(Math.min(dayOfMonth, lastTargetDay));
      const offset = start.getTime() - compareStart.getTime();
      return { start: compareStart, end: new Date(end.getTime() - offset) };
    }
    const days = choice === "yesterday" ? 1 : choice === "last_week" ? 7 : 0;
    if (!days) return null;
    const compareStart = new Date(start);
    const compareEnd = new Date(end);
    compareStart.setDate(compareStart.getDate() - days);
    compareEnd.setDate(compareEnd.getDate() - days);
    return { start: compareStart, end: compareEnd };
  }

  _energyPeriodKind(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) return "other";
    const duration = end.getTime() - start.getTime();
    const day = 24 * 60 * 60 * 1000;
    if (duration > 0 && duration <= 25 * 60 * 60 * 1000) return "day";
    if (duration >= 6.5 * day && duration <= 7.5 * day) return "week";
    const nextMonth = new Date(start);
    nextMonth.setMonth(start.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    if (
      start.getDate() === 1
      && start.getHours() === 0
      && end.getTime() >= nextMonth.getTime() - 60_000
      && end.getTime() <= nextMonth.getTime()
    ) return "month";
    const nextYear = new Date(start);
    nextYear.setFullYear(start.getFullYear() + 1, 0, 1);
    nextYear.setHours(0, 0, 0, 0);
    if (
      start.getMonth() === 0
      && start.getDate() === 1
      && start.getHours() === 0
      && end.getTime() >= nextYear.getTime() - 60_000
      && end.getTime() <= nextYear.getTime()
    ) return "year";
    return "other";
  }

  _energyCompareOptions(collection) {
    const periodKind = this._energyPeriodKind(collection?.start, collection?.end);
    const previousPeriod = ["previous_period", "compare_previous_period"];
    const previousDay = ["yesterday", "compare_previous_day"];
    const previousWeek = ["last_week", "compare_previous_week"];
    const previousMonth = ["last_month", "compare_previous_month"];
    const previousYear = ["last_year", "compare_previous_year"];
    if (periodKind === "day") {
      return this._panelTimeRange
        ? [previousPeriod, previousDay, previousWeek, previousYear]
        : [previousPeriod, previousWeek, previousYear];
    }
    if (periodKind === "week") return [previousPeriod, previousMonth, previousYear];
    if (periodKind === "month") return [previousPeriod, previousYear];
    if (periodKind === "year") return [previousPeriod];
    return [previousPeriod, previousDay, previousWeek, previousMonth, previousYear];
  }

  _energyComparePeriodKindChanged(start, end) {
    const nextKind = this._energyPeriodKind(start, end);
    const previousKind = this._energyComparePeriodKind;
    this._energyComparePeriodKind = nextKind;
    return previousKind != null && previousKind !== nextKind;
  }

  _energyCompareLabel(value, fallbackKey) {
    if (value === "yesterday") {
      return this._localize(
        "ui.components.date-range-picker.ranges.yesterday",
        this._customLocalize(fallbackKey),
      );
    }
    return this._customLocalize(fallbackKey);
  }

  _energyCompareValue(choice, count = 1) {
    const comparisons = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));
    if (comparisons === 1) return choice;
    return Array.from({ length: comparisons }, (_, index) => ({
      period: choice,
      periods_back: index + 1,
    }));
  }

  _energyCompareMode(dataMode, collectionMode) {
    return collectionMode ? (dataMode || collectionMode) : "";
  }

  _energyCompareRangeLabel(start, end) {
    const language = this._hass?.locale?.language || this._hass?.language;
    const timeZone = this._resolvedTimeZone?.() || this._hass?.config?.time_zone;
    const dateOptions = { dateStyle: "long", ...(timeZone ? { timeZone } : {}) };
    const timeOptions = { timeStyle: "short", ...(timeZone ? { timeZone } : {}) };
    const dateFormatter = new Intl.DateTimeFormat(language, dateOptions);
    const timeFormatter = new Intl.DateTimeFormat(language, timeOptions);
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    const startTime = timeFormatter.format(start);
    const endTime = timeFormatter.format(end);
    return startDate === endDate
      ? `${startDate}, ${startTime} – ${endTime}`
      : `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
  }

  _renderEnergyCompareRangeBanner(compareCard, wrapper) {
    const range = compareCard?.__advancedHistoryCompareRange;
    const alert = compareCard?.shadowRoot?.querySelector("ha-alert");
    if (!this._panelTimeRange || !range || !alert || !wrapper) return;
    const startMarker = "__ADVANCED_HISTORY_START__";
    const endMarker = "__ADVANCED_HISTORY_END__";
    const message = this._localize(
      "ui.panel.lovelace.cards.energy.energy_compare.info",
      `You are comparing the period ${startMarker} with the period ${endMarker}`,
      { start: startMarker, end: endMarker },
    );
    const labels = {
      [startMarker]: this._energyCompareRangeLabel(range.start, range.end),
      [endMarker]: this._energyCompareRangeLabel(range.compareStart, range.compareEnd),
    };
    const markerPattern = new RegExp(`(${startMarker}|${endMarker})`, "g");
    const content = document.createDocumentFragment();
    for (const part of message.split(markerPattern)) {
      if (!part) continue;
      if (labels[part]) {
        const strong = document.createElement("b");
        strong.textContent = labels[part];
        content.append(strong);
      } else {
        content.append(document.createTextNode(part));
      }
    }
    content.append(document.createTextNode(" "));
    content.append(wrapper);
    alert.replaceChildren(content);
  }

  _syncEnergyCompareControl(compareCard, collection, applyMode) {
    if (!compareCard?.isConnected || !collection?.compare) return;
    const options = this._energyCompareOptions(collection);
    let choice = this._energyCompareChoice
      || this._energyCompareChoiceFromNative(collection.compare)
      || "previous_period";
    if (!options.some(([value]) => value === choice)) {
      choice = "previous_period";
      this._energyCompareChoice = choice;
      applyMode(collection.compare, true);
    }
    this._energyCompareChoice = choice;
    const syncRange = (rangeChoice = this._energyCompareChoice || choice) => {
      const visiblePeriod = this._panelDayPeriod();
      const rangeStart = this._panelTimeRange && visiblePeriod
        ? visiblePeriod.start
        : collection.start;
      const rangeEnd = this._panelTimeRange && visiblePeriod
        ? visiblePeriod.end
        : collection.end;
      const customRange = this._energyCompareRange(
        rangeStart,
        rangeEnd,
        rangeChoice,
        this._energyCompareCount,
      );
      if (!customRange) return;
      compareCard._start = rangeStart;
      compareCard._end = rangeEnd;
      compareCard._startCompare = customRange.start;
      compareCard._endCompare = customRange.end;
      compareCard.__advancedHistoryCompareRange = {
        start: rangeStart,
        end: rangeEnd,
        compareStart: customRange.start,
        compareEnd: customRange.end,
      };
      compareCard.requestUpdate?.();
    };
    syncRange(choice);

    const install = async () => {
      await compareCard.updateComplete;
      if (!compareCard.isConnected) return;
      const root = compareCard.shadowRoot;
      let wrapper = root?.querySelector(".advanced-history-compare-control");
      let select = wrapper?.querySelector(".advanced-history-compare-select");
      let countSelect = wrapper?.querySelector(".advanced-history-compare-count");
      if (!wrapper) {
        const replaceTarget = root?.querySelector("button.link, .advanced-history-compare-label");
        if (!replaceTarget) return;
        wrapper = document.createElement("span");
        wrapper.className = "advanced-history-compare-control";
        wrapper.style.cssText = "display:inline-flex;align-items:center;gap:5px;";
        select = document.createElement("select");
        select.className = "advanced-history-compare-select";
        select.setAttribute("aria-label", this._customLocalize("comparison_period"));
        select.style.cssText = "font:inherit;line-height:1.4;color:inherit;background:var(--card-background-color,transparent);border:1px solid var(--divider-color,currentColor);border-radius:14px;padding:2px 7px;cursor:pointer;outline:none;";
        select.addEventListener("change", () => {
          this._energyCompareChoice = select.value;
          const nativeMode = this._nativeEnergyCompareMode(select.value);
          this._beginGraphDataSourceCycle();
          collection.setCompare?.(nativeMode);
          applyMode(nativeMode, true);
          syncRange(select.value);
          collection.refresh?.();
        });
        countSelect = document.createElement("select");
        countSelect.className = "advanced-history-compare-count";
        countSelect.setAttribute("aria-label", this._customLocalize("comparison_count"));
        countSelect.title = this._customLocalize("comparison_count");
        countSelect.style.cssText = "font:inherit;line-height:1.4;color:inherit;background:var(--card-background-color,transparent);border:1px solid var(--divider-color,currentColor);border-radius:14px;padding:2px 5px;cursor:pointer;outline:none;";
        for (let value = 1; value <= 10; value += 1) {
          const option = document.createElement("option");
          option.value = String(value);
          option.textContent = String(value);
          countSelect.append(option);
        }
        countSelect.addEventListener("change", () => {
          this._energyCompareCount = Number(countSelect.value) || 1;
          this._beginGraphDataSourceCycle();
          applyMode(collection.compare, true);
          syncRange();
          this._recordChange(null, true);
        });
        wrapper.append(select);
        wrapper.append(countSelect);
        replaceTarget.replaceWith(wrapper);
      }
      select.hidden = options.length === 1;
      const optionValues = Array.from(select.options, (option) => option.value);
      const nextOptionValues = options.map(([value]) => value);
      if (optionValues.join("\u001f") !== nextOptionValues.join("\u001f")) {
        select.replaceChildren();
        for (const [value, label] of options) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = this._energyCompareLabel(value, label);
          select.append(option);
        }
      }
      select.value = choice;
      countSelect.value = String(this._energyCompareCount || 1);
      this._renderEnergyCompareRangeBanner(compareCard, wrapper);
    };
    queueMicrotask(install);
  }

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
    // Sequential comparison needs the selected slot to be the card's actual
    // Energy window. Applying daily hour filters would leave the hidden hours
    // between yesterday's slot and today's slot on the extended axis.
    if (this._sequentialPanelTimeComparisonActive()) return {};
    // A wrapping window is stored as the Energy collection period itself.
    // Applying the daily hour filters as well would require a point to be
    // both after the start hour and before the end hour, hiding everything.
    if (range.end <= range.start) return {};
    return {
      graph_start_hour: range.start / 60,
      graph_end_hour: range.end / 60,
    };
  }

  _sequentialPanelTimeComparisonActive(compare = this._effectiveCompare?.()) {
    if (!this._panelTimeRange || compare == null || compare === false) return false;
    const isSequential = (value) => {
      if (value === true || value === "previous_period") return true;
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      return (value.period ?? "previous_period") === "previous_period"
        && (value.layout == null || value.layout === "sequential");
    };
    return (Array.isArray(compare) ? compare : [compare]).some(isSequential);
  }

  _syncPanelComparisonRange(compare, collection = this._energyCollection) {
    if (!collection || !this._panelTimeRange || this._periodRestoreLoading) return false;
    const period = this._panelDayPeriod();
    if (!period) return false;
    const { start: startMinutes, end: endMinutes } = this._panelTimeRange;
    if (endMinutes <= startMinutes) return false;
    const start = new Date(period.dayStart);
    const end = new Date(period.dayStart);
    if (this._sequentialPanelTimeComparisonActive(compare)) {
      start.setMinutes(startMinutes, 0, 0);
      end.setMinutes(endMinutes, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }
    const changed = collection.start?.getTime?.() !== start.getTime()
      || collection.end?.getTime?.() !== end.getTime();
    if (!changed) return false;
    this._beginEnergyInteractionLoading();
    collection.setPeriod(start, end);
    collection.refresh?.();
    return true;
  }

  _panelComparisonPayloadCurrent(data, compare, collection = this._energyCollection) {
    if (!this._sequentialPanelTimeComparisonActive(compare)) return true;
    const actualStart = data?.start instanceof Date ? data.start : new Date(data?.start);
    const actualEnd = data?.end instanceof Date ? data.end : new Date(data?.end);
    const expectedStart = collection?.start instanceof Date
      ? collection.start
      : new Date(collection?.start);
    const expectedEnd = collection?.end instanceof Date
      ? collection.end
      : new Date(collection?.end);
    return [actualStart, actualEnd, expectedStart, expectedEnd]
      .every((value) => Number.isFinite(value.getTime()))
      && Math.abs(actualStart.getTime() - expectedStart.getTime()) < 60_000
      && Math.abs(actualEnd.getTime() - expectedEnd.getTime()) < 60_000;
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
    const range = this._panelTimeRange;
    if (
      range
      && range.end > range.start
      && this._sequentialPanelTimeComparisonActive()
    ) {
      const rangeStart = new Date(dayStart);
      rangeStart.setMinutes(range.start, 0, 0);
      const rangeEnd = new Date(dayStart);
      rangeEnd.setMinutes(range.end, 0, 0);
      if (
        Math.abs(start.getTime() - rangeStart.getTime()) < 60_000
        && Math.abs(end.getTime() - rangeEnd.getTime()) < 60_000
      ) return false;
    }
    if (range && range.end <= range.start) {
      const rangeStart = new Date(dayStart);
      rangeStart.setMinutes(range.start, 0, 0);
      const rangeEnd = new Date(dayStart);
      rangeEnd.setMinutes(range.end, 0, 0);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      if (
        Math.abs(start.getTime() - rangeStart.getTime()) < 60_000
        && Math.abs(end.getTime() - rangeEnd.getTime()) < 60_000
      ) return false;
    }
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
      compareHost.hidden = !this._targetCount()
        || !this._energyCollection?.compare
        || Boolean(compareCard.hidden);
    }
  }

  _resetNativeEnergyCompareUI() {
    const controller = this.shadowRoot
      ?.getElementById("date-controller")
      ?.querySelector(".energy-date-controller");
    const selector = controller?.shadowRoot?.querySelector("hui-energy-period-selector");
    if (selector) {
      selector._compare = false;
      selector.requestUpdate?.();
    }
    const compareCard = this.shadowRoot
      ?.getElementById("compare-banner")
      ?.querySelector("hui-energy-compare-card");
    if (compareCard) {
      compareCard._startCompare = undefined;
      compareCard._endCompare = undefined;
      compareCard._compareMode = "";
      compareCard.hidden = true;
      compareCard.requestUpdate?.();
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
    const presets = [1, 2, 4, 8, 12, 24];
    picker.innerHTML = `<div class="time-range-presets" role="group" aria-label="${this._escape(title)}">
        ${presets.map((hours) => `<button type="button" data-hours="${hours}" aria-pressed="false">${hours}H</button>`).join("")}
      </div>
      <div class="time-range-fields">
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
    const original = {
      range: this._panelTimeRange ? { ...this._panelTimeRange } : null,
      rollingHours: this._panelRollingHours,
      dayStart: new Date(period.dayStart),
    };
    let presetRange = null;
    let accepted = false;
    let previewFrame = 0;
    const parseMinutes = (value) => {
      const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value || "");
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const formatMinutes = (value) => {
      const minutes = ((value % 1440) + 1440) % 1440;
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
    };
    const syncPresetSelection = () => {
      const start = parseMinutes(startInput.value);
      const end = parseMinutes(endInput.value);
      const duration = start == null || end == null
        ? null
        : start === 0 && end === 1439
          ? 1440
          : start === end
            ? 1440
            : ((end - start) + 1440) % 1440;
      for (const button of picker.querySelectorAll(".time-range-presets button")) {
        const selected = duration === Number(button.dataset.hours) * 60;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
    };
    const preview = () => {
      const presetDayStart = presetRange
        && startInput.value === presetRange.startValue
        && endInput.value === presetRange.endValue
        ? presetRange.dayStart
        : null;
      this._panelTimeRangePreview = true;
      this._setPanelTimeRange(
        startInput.value,
        endInput.value,
        presetDayStart,
        null,
      );
    };
    const schedulePreview = () => {
      syncPresetSelection();
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        preview();
      });
    };
    for (const button of picker.querySelectorAll(".time-range-presets button")) {
      button.addEventListener("click", () => {
        const hours = Number(button.dataset.hours);
        const end = new Date();
        end.setSeconds(0, 0);
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        const startValue = formatMinutes(start.getHours() * 60 + start.getMinutes());
        const endValue = formatMinutes(end.getHours() * 60 + end.getMinutes());
        startInput.value = startValue;
        endInput.value = endValue;
        presetRange = { startValue, endValue, dayStart: start };
        schedulePreview();
      });
    }
    startInput.addEventListener("value-changed", schedulePreview);
    endInput.addEventListener("value-changed", schedulePreview);
    startInput.addEventListener("change", schedulePreview);
    endInput.addEventListener("change", schedulePreview);
    syncPresetSelection();
    let removed = false;
    let restored = false;
    const restore = () => {
      if (accepted || restored) return;
      restored = true;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      this._panelTimeRangePreview = true;
      this._setPanelRollingHours(original.rollingHours);
      this._panelTimeRange = original.range ? { ...original.range } : null;
      this._applyPanelTimeRangePeriod(original.dayStart, true);
      this._panelTimeRangePreview = false;
    };
    const remove = () => {
      if (removed) return;
      restore();
      removed = true;
      picker.remove();
      if (this._closePanelTimeRangeDialog === close) {
        this._closePanelTimeRangeDialog = undefined;
      }
    };
    const close = () => {
      restore();
      picker.open = false;
      setTimeout(remove, 350);
    };
    this._closePanelTimeRangeDialog = close;
    picker.addEventListener(narrow ? "closed" : "wa-after-hide", remove);
    picker.querySelector('ha-button[data-action="reset"]').addEventListener("click", () => {
      presetRange = null;
      startInput.value = "00:00:00";
      endInput.value = "23:59:00";
      schedulePreview();
    });
    picker.querySelector('ha-button[data-action="cancel"]').addEventListener("click", close);
    picker.querySelector('ha-button[data-action="apply"]').addEventListener("click", () => {
      const presetDayStart = presetRange
        && startInput.value === presetRange.startValue
        && endInput.value === presetRange.endValue
        ? presetRange.dayStart
        : null;
      const rollingHours = presetDayStart ? Number(
        picker.querySelector(".time-range-presets button.selected")?.dataset.hours
      ) : null;
      accepted = this._setPanelTimeRange(
        startInput.value,
        endInput.value,
        presetDayStart,
        rollingHours,
      );
      this._panelTimeRangePreview = false;
      if (accepted) {
        this._recordChange(null, true);
        close();
      }
    });
    this.shadowRoot.append(picker);
    requestAnimationFrame(() => {
      if (picker.isConnected) picker.open = true;
    });
  }

  _setPanelTimeRange(startValue, endValue, dayStart = null, rollingHours = null) {
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
    const rolling = [1, 2, 4, 8, 12, 24].includes(Number(rollingHours))
      ? Number(rollingHours)
      : null;
    const rollingChanged = this._panelRollingHours !== rolling;
    this._setPanelRollingHours(rolling);
    if (!changed && !rollingChanged && !(dayStart instanceof Date)) return true;
    if (changed) this._panelTimeRange = next;
    return this._applyPanelTimeRangePeriod(
      dayStart instanceof Date ? dayStart : period.dayStart,
      Boolean(rolling),
    );
  }

  _setPanelRollingHours(hours) {
    if (this._panelRollingTimer) window.clearTimeout(this._panelRollingTimer);
    this._panelRollingTimer = null;
    this._panelRollingHours = [1, 2, 4, 8, 12, 24].includes(Number(hours))
      ? Number(hours)
      : null;
    this._panelRollingResumeHours = this._panelRollingHours;
    if (!this._panelRollingHours || !this.isConnected) return;
    const delay = 60_000 - (Date.now() % 60_000) + 250;
    this._panelRollingTimer = window.setTimeout(() => {
      this._panelRollingTimer = null;
      this._refreshPanelRollingRange();
    }, delay);
  }

  _refreshPanelRollingRange() {
    const hours = this._panelRollingHours || this._panelRollingResumeHours;
    if (!hours || !this.isConnected) return false;
    if (!this._energyCollection) {
      if (this._panelRollingTimer) window.clearTimeout(this._panelRollingTimer);
      this._panelRollingTimer = window.setTimeout(() => {
        this._panelRollingTimer = null;
        this._refreshPanelRollingRange();
      }, 250);
      return false;
    }
    const end = new Date();
    end.setSeconds(0, 0);
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    this._panelTimeRange = {
      start: start.getHours() * 60 + start.getMinutes(),
      end: end.getHours() * 60 + end.getMinutes(),
    };
    const applied = this._applyPanelTimeRangePeriod(start, true, true);
    this._setPanelRollingHours(hours);
    return applied;
  }

  _pausePanelRollingRange() {
    const hours = this._panelRollingHours || this._panelRollingResumeHours;
    if (!hours) return;
    if (this._panelRollingTimer) window.clearTimeout(this._panelRollingTimer);
    this._panelRollingTimer = null;
    this._panelRollingHours = null;
    this._panelRollingResumeHours = hours;
  }

  _resetPanelTimeRangeOutsideDayView() {
    if (!this._panelTimeRange || this._panelDayPeriod()) return false;
    this._setPanelRollingHours(null);
    this._closePanelTimeRangeDialog?.();
    this._panelTimeRange = null;
    this._syncPanelTimeRangeControl();
    return true;
  }

  _shiftPanelTimeRange(direction) {
    const period = this._panelDayPeriod();
    if (!this._energyCollection || !period || ![-1, 1].includes(direction)) return false;
    if (!this._panelTimeRange) return this._shiftPanelDay(direction);
    this._pausePanelRollingRange();
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
    const dayStart = new Date(period.dayStart);
    dayStart.setDate(dayStart.getDate() + dayShift);
    return this._applyPanelTimeRangePeriod(dayStart);
  }

  _applyPanelTimeRangePeriod(dayStart, forceRefresh = false, quiet = false) {
    const collection = this._energyCollection;
    if (!collection || !(dayStart instanceof Date)) return false;
    const start = new Date(dayStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    const range = this._panelTimeRange;
    if (range && range.end <= range.start) {
      start.setMinutes(range.start, 0, 0);
      end.setMinutes(range.end, 0, 0);
      end.setDate(end.getDate() + 1);
    } else if (range && this._sequentialPanelTimeComparisonActive()) {
      start.setMinutes(range.start, 0, 0);
      end.setMinutes(range.end, 0, 0);
    } else {
      end.setHours(23, 59, 59, 999);
    }
    const changed = collection.start?.getTime?.() !== start.getTime()
      || collection.end?.getTime?.() !== end.getTime();
    if (quiet) {
      if (changed) collection.setPeriod(start, end);
      this._updateGraphHourOptionsInPlace?.();
      this._syncPanelTimeRangeControl();
      if (changed || forceRefresh) collection.refresh?.();
      return true;
    }
    this._beginGraphDataSourceCycle();
    if (changed) {
      this._beginEnergyInteractionLoading();
      collection.setPeriod(start, end);
    }
    // Mount the cards against the final period before a changed collection
    // publishes its fresh payload.
    this._renderGraphs();
    this._syncPanelTimeRangeControl();
    if (changed || forceRefresh) collection.refresh?.();
    else this._recordChange(null, true);
    return true;
  }

  _shiftPanelDay(direction) {
    const period = this._panelDayPeriod();
    if (!this._energyCollection || !period || ![-1, 1].includes(direction)) return false;
    const start = new Date(period.dayStart);
    this._setPanelRollingHours(null);
    start.setDate(start.getDate() + direction);
    this._closePanelTimeRangeDialog?.();
    return this._applyPanelTimeRangePeriod(start);
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
          || !this._targetCount()
          || !this._energyCollection?.compare
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
    if (this._panelRollingHours && this._pendingRollingCompareRestore) {
      const restore = this._pendingRollingCompareRestore;
      this._pendingRollingCompareRestore = null;
      this._energyCompareChoice = restore.choice;
      this._energyCompareCount = restore.count;
      if (collection.compare !== restore.compare) {
        collection.setCompare?.(restore.compare);
      }
    }
    // The Energy collection is shared between tabs. Move it to this panel's
    // current rolling window before reading or normalizing its cached period;
    // otherwise the native picker initializes from the panel we just left.
    const rollingPeriodApplied = this._panelRollingHours
      ? this._refreshPanelRollingRange()
      : false;
    // Older partial-day builds stored the selected hours directly in HA's
    // shared Energy collection. Convert that cached selection back to a
    // native full-day period before mounting the replacement graph cards.
    // The visible hours are now card filters, not an Energy date range.
    const normalizedEnergyDay = this._panelRollingHours
      ? false
      : this._normalizeEnergyDayPeriod(collection, false);
    this._activateGraphDataSourceTracking();
    this._renderPanelTimeRangeControl(host);

    const restoringPeriod = Boolean(
      this._periodRestoreLoading && this._periodRestoreExpected?.start
    );
    // Loading a rolling bookmark into an empty panel must supersede the
    // panel's deferred "reset to Today" action. Fixed-period bookmarks do
    // this through the period-restore branch below; rolling bookmarks restore
    // against the current clock and therefore do not enter that branch.
    if (this._panelRollingHours && this._targetCount()) {
      this._energyResetPending = false;
    }
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
        || !this._targetCount()
        || !collection.compare
        || Boolean(compareCard.hidden);
      const effectiveMode = this._periodRestoreLoading ? collection.compare : mode;
      if (!effectiveMode) this._energyCompareChoice = null;
      const nativeChoice = effectiveMode === "previous"
        ? "previous_period"
        : effectiveMode === "yoy" ? "last_year" : null;
      const next = effectiveMode
        ? this._energyCompareValue(
          this._energyCompareChoice || nativeChoice,
          this._energyCompareCount,
        )
        : null;
      const nextDetailKey = this._largeRangeDetailRenderKey();
      if (this._periodRestoreLoading) {
        this._energyCompare = next;
        this._largeRangeDetailStateKey = nextDetailKey;
        return;
      }
      const comparisonRangeChanged = this._syncPanelComparisonRange(next, collection);
      if (
        !force
        && !comparisonRangeChanged
        && JSON.stringify(next) === JSON.stringify(this._energyCompare)
        && nextDetailKey === this._largeRangeDetailStateKey
      ) return;
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
      if (
        !this._periodRestoreLoading
        && !this._panelComparisonPayloadCurrent(data, this._energyCompare, collection)
      ) {
        this._beginEnergyInteractionLoading();
        if (!this._syncPanelComparisonRange(this._energyCompare, collection)) {
          collection.refresh?.();
        }
        return;
      }
      const timeRangeReset = this._resetPanelTimeRangeOutsideDayView();
      const periodKindChanged = this._energyComparePeriodKindChanged(
        collection.start,
        collection.end,
      );
      const resetComparePeriod = Boolean(
        periodKindChanged
        && !periodRestored
        && !this._periodRestoreLoading
        && (data?.compareMode || collection.compare),
      );
      let compareMode = this._energyCompareMode(data?.compareMode, collection.compare);
      if (resetComparePeriod) {
        this._energyCompareChoice = "previous_period";
        compareMode = "previous";
        if (collection.compare !== compareMode) {
          collection.setCompare?.(compareMode);
          collection.refresh?.();
        }
      }
      // The mode is usually unchanged while restoring a bookmark, but the
      // old graph cards were deliberately removed by _beginPeriodRestore().
      // Force their recreation once the requested Energy data is confirmed.
      applyMode(compareMode, periodRestored || timeRangeReset || resetComparePeriod);
      this._syncEnergyCompareControl(compareCard, collection, applyMode);
      if (periodRestored) {
        compareHost.hidden = Boolean(compareCard.hidden);
        this._renderLargeRangeDetailBanner();
      }
      this._finishEnergyInteractionLoading(compareHost, compareCard);
      // The collection update is authoritative for picker changes that can
      // finish after the click fallback, including clearing Compare.
      this._syncPanelTimeRangeControl();
      if (data?.start && !this._periodRestoreLoading && !this._panelTimeRangePreview) {
        this._recordChange(null, !periodRestored);
      }
    });
    if ((normalizedEnergyDay || rollingPeriodApplied) && !restoringPeriod) {
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
    const nowActionLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.now",
      "Now"
    );
    const energyActionLabels = new Set([
      ...navigationActionLabels,
      nowActionLabel,
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
        if (
          directEnergyAction === nowActionLabel
          && (this._panelRollingHours || this._panelRollingResumeHours)
        ) {
          // HA's native Now action selects the current full period. A rolling
          // preset instead means "the last N hours ending now", so retain the
          // preset and move both ends of its window to the current clock.
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          this._refreshPanelRollingRange();
          return;
        }
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

  _resetEnergySelection(collection = this._energyCollection, forceRefresh = false) {
    this._pendingPeriodRestore = null;
    this._finishPeriodRestore();
    this._finishEnergyInteractionLoading();
    this._closePanelTimeRangeDialog?.();
    this._setPanelRollingHours(null);
    this._pendingRollingCompareRestore = null;
    this._panelTimeRange = null;
    this._energyCompare = null;
    this._energyCompareChoice = null;
    this._energyCompareCount = 1;
    this._largeRangeFineDetail = false;
    this._largeRangeDetailStateKey = null;
    this._largeRangeDetailDismissedKey = null;
    const compareHost = this.shadowRoot?.getElementById("compare-banner");
    if (compareHost) compareHost.hidden = true;
    this._resetNativeEnergyCompareUI();

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
    if (periodChanged || compareChanged || forceRefresh) collection.refresh?.();
    return periodChanged || compareChanged;
  }

}
