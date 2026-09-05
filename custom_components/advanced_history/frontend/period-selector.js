import { DATE_PICKER_AUTO_HIDE_STORAGE_KEY } from "./constants.js";

const PANEL_EXPORT_ICON_PATH = "M3 3H11V11H3V3M5 5V9H9V5H5M13 3H21V11H13V3M15 5V9H19V5H15M3 13H11V21H3V13M5 15V19H9V15H5M18 13V16H21V18H18V21H16V18H13V16H16V13H18Z";

export function chartDataDownloads(graphCards = []) {
  return graphCards.flatMap((source, index) => {
    const card = source?.card || source;
    const csv = typeof card?._buildCsvText === "function" ? card._buildCsvText() : null;
    if (!csv) return [];
    const title = source?.title
      || card._config?.card_header
      || (index ? `chart-${index + 1}` : "chart");
    return [{ csv, title }];
  });
}

function safeDownloadTitle(title, fallback) {
  return String(title || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

export function chartDataZip(downloads, modified = new Date()) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const usedNames = new Set();
  let offset = 0;
  const year = Math.max(1980, modified.getFullYear());
  const dosTime = (modified.getHours() << 11)
    | (modified.getMinutes() << 5)
    | Math.floor(modified.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9)
    | ((modified.getMonth() + 1) << 5)
    | modified.getDate();

  downloads.forEach(({ csv, title }, index) => {
    const base = `advanced-history-${safeDownloadTitle(title, `chart-${index + 1}`)}`;
    let name = `${base}.csv`;
    let duplicate = 2;
    while (usedNames.has(name)) name = `${base}-${duplicate++}.csv`;
    usedNames.add(name);
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(`\ufeff${csv}`);
    const checksum = crc32(data);

    const local = zipHeader(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(10, dosTime, true);
    local.view.setUint16(12, dosDate, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, nameBytes.length, true);
    localParts.push(local.bytes, nameBytes, data);

    const central = zipHeader(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(12, dosTime, true);
    central.view.setUint16(14, dosDate, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, nameBytes.length, true);
    central.view.setUint32(42, offset, true);
    centralParts.push(central.bytes, nameBytes);
    offset += local.bytes.length + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = zipHeader(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, downloads.length, true);
  end.view.setUint16(10, downloads.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end.bytes], { type: "application/zip" });
}

export class PeriodSelectorMethods {
  _restoreDashboardLocalComparison(period) {
    if (!period) return "";
    this._comparisonChoice = period.choice ?? period.compare_choice ?? null;
    this._comparisonCount = Math.max(
      1,
      Math.min(10, Math.trunc(Number(period.count ?? period.compare_count)) || 1),
    );
    return period.compare || "";
  }

  _comparisonChoiceFromMode(mode) {
    return mode === "previous"
      ? "previous_period"
      : mode === "yoy" ? "last_year" : null;
  }

  _comparisonModeForChoice(choice) {
    return choice === "last_year" ? "yoy" : choice ? "previous" : "";
  }

  _syncComparisonBannerVisibility() {
    const host = this.shadowRoot?.getElementById("compare-banner");
    if (host) this._renderComparisonBanner(host);
  }

  _setComparisonMenuCheckboxState(item, checked) {
    if (!item) return;
    item._advancedHistoryChecked = Boolean(checked);
    item.querySelector('[slot="icon"]')?.setAttribute(
      "icon",
      item._advancedHistoryChecked ? "mdi:checkbox-outline" : "mdi:checkbox-blank-outline",
    );
    const syncAria = () => {
      item.setAttribute("role", "menuitemcheckbox");
      item.setAttribute("aria-checked", String(item._advancedHistoryChecked));
    };
    syncAria();
    item.updateComplete?.then(syncAria);
  }

  _renderY1ComparisonMenu() {
    const menu = this.shadowRoot?.getElementById("y1-comparison-menu");
    if (!menu) return;
    const collection = this._periodStore;
    const active = collection
      ? Boolean(collection.compare)
      : this._comparisonIsActive();
    const choice = this._comparisonChoice
      || this._comparisonChoiceFromMode(collection?.compare)
      || "previous_period";
    const options = this._comparisonOptions(collection).map(([value, label]) => (
      `<option value="${this._escape(value)}">${this._escape(this._comparisonLabel(value, label))}</option>`
    )).join("");
    const countOptions = Array.from({ length: 10 }, (_, index) => {
      const value = String(index + 1);
      return `<option value="${value}">${value}</option>`;
    }).join("");
    const count = Math.max(
      1,
      Math.min(10, Math.trunc(Number(this._comparisonCount)) || 1),
    );
    const compareDataLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.compare",
      "Compare data",
    );
    const comparisonBannerLabel = this._customLocalize("show_comparison_banner");
    menu.innerHTML = `
      <ha-dropdown-item id="comparison-enabled" class="comparison-menu-check" value="comparison-enabled"><ha-icon slot="icon"></ha-icon>${this._escape(compareDataLabel)}</ha-dropdown-item>
      <ha-dropdown-item id="comparison-show-banner" class="comparison-menu-check" value="comparison-show-banner"><ha-icon slot="icon"></ha-icon>${this._escape(comparisonBannerLabel)}</ha-dropdown-item>
      <div class="comparison-menu-heading">${this._escape(this._customLocalize("comparison_options"))}</div>
      <div class="comparison-menu-options">
        <select id="comparison-period" class="comparison-menu-select comparison-menu-period" aria-label="${this._escape(this._customLocalize("comparison_period"))}" title="${this._escape(this._customLocalize("comparison_period"))}">${options}</select>
        <select id="comparison-count" class="comparison-menu-select comparison-menu-count" aria-label="${this._escape(this._customLocalize("comparison_count"))}" title="${this._escape(this._customLocalize("comparison_count"))}">${countOptions}</select>
      </div>`;
    const comparisonEnabled = menu.querySelector("#comparison-enabled");
    const comparisonBanner = menu.querySelector("#comparison-show-banner");
    const comparisonPeriod = menu.querySelector("#comparison-period");
    const comparisonCount = menu.querySelector("#comparison-count");
    this._setComparisonMenuCheckboxState(comparisonEnabled, active);
    this._setComparisonMenuCheckboxState(comparisonBanner, this._comparisonBannerVisible);
    comparisonPeriod.value = choice;
    comparisonCount.value = String(count);
    if (menu._advancedHistoryComparisonSelect) {
      menu.removeEventListener("wa-select", menu._advancedHistoryComparisonSelect);
    }
    menu._advancedHistoryComparisonSelect = (event) => {
      const item = event.detail?.item;
      if (item !== comparisonEnabled && item !== comparisonBanner) return;
      event.preventDefault();
      const checked = !item._advancedHistoryChecked;
      this._setComparisonMenuCheckboxState(item, checked);
      if (item === comparisonEnabled) {
        this._setY1ComparisonEnabled(checked);
        return;
      }
      this._comparisonBannerVisible = checked;
      this._syncComparisonBannerVisibility();
      this._recordChange(null, true);
    };
    menu.addEventListener("wa-select", menu._advancedHistoryComparisonSelect);
    comparisonPeriod.addEventListener("change", (event) => {
      this._setY1ComparisonChoice(event.currentTarget.value);
    });
    comparisonCount.addEventListener("change", (event) => {
      this._setY1ComparisonCount(event.currentTarget.value);
    });
  }

  _toggleY1ComparisonMenu(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const menu = this.shadowRoot?.getElementById("y1-comparison-menu");
    const button = this.shadowRoot?.getElementById("toggle-y1-comparison");
    if (!menu || !button) return;
    const opening = !menu.open;
    this._closeY1ComparisonMenu();
    if (!opening) return;
    this._renderY1ComparisonMenu();
    menu.anchorElement = button;
    menu.open = true;
    button.setAttribute("aria-expanded", "true");
    menu.addEventListener("wa-hide", () => {
      button.setAttribute("aria-expanded", "false");
    }, { once: true });
  }

  _closeY1ComparisonMenu() {
    const menu = this.shadowRoot?.getElementById("y1-comparison-menu");
    const button = this.shadowRoot?.getElementById("toggle-y1-comparison");
    if (menu) menu.open = false;
    button?.setAttribute("aria-expanded", "false");
  }

  _setY1ComparisonEnabled(enabled) {
    const collection = this._periodStore;
    if (!collection?.setCompare) return;
    const choice = this._comparisonChoice || "previous_period";
    if (enabled) this._comparisonChoice = choice;
    const mode = enabled ? this._comparisonModeForChoice(choice) : "";
    this._beginGraphDataSourceCycle();
    this._beginPeriodInteractionLoading();
    collection.setCompare(mode);
    this._applyComparisonMode?.(mode, true);
    collection.refresh?.();
    this._syncY1ComparisonToggle(Boolean(mode));
    this._commitComparisonChange();
  }

  _commitComparisonChange() {
    if (typeof this._recordComparisonChange === "function") {
      this._recordComparisonChange();
    } else if (typeof this._recordChange === "function") {
      this._recordChange(null, true);
    }
  }

  _setY1ComparisonChoice(choice) {
    if (!choice) return;
    this._comparisonChoice = choice;
    const collection = this._periodStore;
    if (!collection?.compare) {
      this._commitComparisonChange();
      return;
    }
    const mode = this._comparisonModeForChoice(choice);
    this._beginGraphDataSourceCycle();
    this._beginPeriodInteractionLoading();
    collection.setCompare?.(mode);
    this._applyComparisonMode?.(mode, true);
    this._syncComparisonRange?.(choice);
    collection.refresh?.();
    this._commitComparisonChange();
  }

  _setY1ComparisonCount(value) {
    this._comparisonCount = Math.max(
      1,
      Math.min(10, Math.trunc(Number(value)) || 1),
    );
    if (this._periodStore?.compare) {
      this._beginGraphDataSourceCycle();
      this._applyComparisonMode?.(this._periodStore.compare, true);
      this._syncComparisonRange?.();
    }
    this._commitComparisonChange();
  }

  _comparisonRange(start, end, choice, count = 1) {
    const ranges = this._comparisonRanges(start, end, choice, count);
    if (!ranges.length) return null;
    if (choice === "previous_period") {
      const duration = end.getTime() - start.getTime();
      const periods = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));
      return {
        start: new Date(start.getTime() - duration * periods),
        end: new Date(start),
        ranges,
      };
    }
    return {
      start: ranges[0].start,
      end: ranges[ranges.length - 1].end,
      ranges,
    };
  }

  _comparisonRanges(start, end, choice, count = 1) {
    if (!(start instanceof Date) || !(end instanceof Date)) return [];
    const periods = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));
    const duration = end.getTime() - start.getTime();
    if (duration <= 0) return [];
    const periodKind = this._periodKind(start, end);
    const days = choice === "yesterday" ? 1 : choice === "last_week" ? 7 : 0;
    const ranges = [];
    for (let periodsBack = periods; periodsBack >= 1; periodsBack -= 1) {
      let compareStart;
      let compareEnd;
      if (choice === "previous_period") {
        if (periodKind === "month") {
          compareStart = this._shiftComparisonMonth(start, -periodsBack);
          compareEnd = this._shiftComparisonMonth(end, -periodsBack);
        } else if (periodKind === "year") {
          compareStart = this._shiftComparisonYear(start, -periodsBack);
          compareEnd = this._shiftComparisonYear(end, -periodsBack);
        } else {
          compareStart = new Date(start.getTime() - duration * periodsBack);
          compareEnd = new Date(end.getTime() - duration * periodsBack);
        }
      } else if (choice === "last_month") {
        compareStart = this._shiftComparisonMonth(start, -periodsBack);
        compareEnd = this._shiftComparisonMonth(end, -periodsBack);
      } else if (choice === "last_year") {
        compareStart = this._shiftComparisonYear(start, -periodsBack);
        compareEnd = this._shiftComparisonYear(end, -periodsBack);
      } else if (days) {
        compareStart = new Date(start);
        compareEnd = new Date(end);
        compareStart.setDate(compareStart.getDate() - days * periodsBack);
        compareEnd.setDate(compareEnd.getDate() - days * periodsBack);
      } else {
        return [];
      }
      ranges.push({ start: compareStart, end: compareEnd });
    }
    return ranges;
  }

  _shiftComparisonMonth(value, offset) {
    const shifted = new Date(value);
    const targetDay = shifted.getDate();
    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() + offset);
    const lastTargetDay = new Date(
      shifted.getFullYear(),
      shifted.getMonth() + 1,
      0,
    ).getDate();
    shifted.setDate(Math.min(targetDay, lastTargetDay));
    return shifted;
  }

  _shiftComparisonYear(value, offset) {
    const shifted = new Date(value);
    const targetMonth = shifted.getMonth();
    const targetDay = shifted.getDate();
    shifted.setDate(1);
    shifted.setFullYear(shifted.getFullYear() + offset);
    shifted.setMonth(targetMonth);
    const lastTargetDay = new Date(
      shifted.getFullYear(),
      targetMonth + 1,
      0,
    ).getDate();
    shifted.setDate(Math.min(targetDay, lastTargetDay));
    return shifted;
  }

  _periodKind(start, end) {
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

  _comparisonOptions(collection) {
    const periodKind = this._periodKind(collection?.start, collection?.end);
    const previousPeriod = ["previous_period", "compare_previous_period"];
    const previousDay = ["yesterday", "compare_previous_day"];
    const previousWeek = ["last_week", "compare_previous_week"];
    const previousMonth = ["last_month", "compare_previous_month"];
    const previousYear = ["last_year", "compare_previous_year"];
    if (periodKind === "day") {
      return this._panelTimeRange
        ? [previousPeriod, previousDay, previousWeek, previousMonth, previousYear]
        : [previousPeriod, previousWeek, previousMonth, previousYear];
    }
    if (periodKind === "week") return [previousPeriod, previousMonth, previousYear];
    if (periodKind === "month") return [previousPeriod, previousYear];
    if (periodKind === "year") return [previousPeriod];
    return [previousPeriod, previousDay, previousWeek, previousMonth, previousYear];
  }

  _comparisonLabel(value, fallbackKey) {
    if (value === "yesterday") {
      return this._localize(
        "ui.components.date-range-picker.ranges.yesterday",
        this._customLocalize(fallbackKey),
      );
    }
    return this._customLocalize(fallbackKey);
  }

  _comparisonValue(choice, count = 1) {
    const comparisons = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));
    if (comparisons === 1) return choice;
    return Array.from({ length: comparisons }, (_, index) => ({
      period: choice,
      periods_back: index + 1,
    }));
  }

  _comparisonSeriesPeriodReplacements(collection = this._periodStore) {
    if (!collection?.compare) return [];
    const start = collection.start;
    const end = collection.end;
    if (!(start instanceof Date) || !(end instanceof Date)) return [];
    const choice = this._comparisonChoice
      || this._comparisonChoiceFromMode(collection.compare)
      || "previous_period";
    const count = Math.max(
      1,
      Math.min(10, Math.trunc(Number(this._comparisonCount)) || 1),
    );
    const ranges = this._comparisonRanges(start, end, choice, count);
    if (ranges.length !== count) return [];
    const translationKeys = {
      previous_period: "compare_previous_period",
      yesterday: "compare_previous_day",
      last_week: "compare_previous_week",
      last_month: "compare_previous_month",
      last_year: "compare_previous_year",
    };
    const fallbackKey = translationKeys[choice];
    if (!fallbackKey) return [];
    const genericLabel = this._comparisonLabel(choice, fallbackKey);
    const periodKind = this._periodKind(start, end);
    const includeTime = Boolean(this._panelTimeRange);
    return Array.from({ length: count }, (_, index) => {
      const periodsBack = index + 1;
      const range = ranges[count - periodsBack];
      const inclusiveEnd = new Date(Math.max(
        range.start.getTime(),
        range.end.getTime() - 1,
      ));
      return {
        genericLabel,
        periodsBack,
        periodLabel: this._compactComparisonRangeLabel(
          range.start,
          inclusiveEnd,
          periodKind,
          includeTime,
        ),
      };
    });
  }

  _compactComparisonRangeLabel(
    start,
    end,
    periodKind = "other",
    includeTime = false,
    currentDate = new Date(),
  ) {
    const language = this._hass?.locale?.language || this._hass?.language;
    const timeZone = this._resolvedTimeZone?.() || this._hass?.config?.time_zone;
    const zone = timeZone ? { timeZone } : {};
    const yearFormatter = new Intl.DateTimeFormat("en", { year: "numeric", ...zone });
    const yearOf = (value) => yearFormatter.format(value);
    if (!includeTime && periodKind === "year") {
      return new Intl.DateTimeFormat(language, { year: "numeric", ...zone }).format(start);
    }
    if (!includeTime && periodKind === "month") {
      const includeYear = yearOf(start) !== yearOf(currentDate);
      return new Intl.DateTimeFormat(language, {
        month: "short",
        ...(includeYear ? { year: "numeric" } : {}),
        ...zone,
      }).format(start);
    }
    const includeYear = yearOf(start) !== yearOf(currentDate)
      || yearOf(end) !== yearOf(currentDate);
    const formatter = new Intl.DateTimeFormat(language, includeTime
      ? { dateStyle: "medium", timeStyle: "short", ...zone }
      : {
          day: "numeric",
          month: "short",
          ...(includeYear ? { year: "numeric" } : {}),
          ...zone,
        });
    if (!includeTime && periodKind === "day") return formatter.format(start);
    return typeof formatter.formatRange === "function"
      ? formatter.formatRange(start, end)
      : `${formatter.format(start)} – ${formatter.format(end)}`;
  }

  _replaceComparisonSeriesPeriodLabel(value, replacements) {
    let result = String(value || "");
    for (const replacement of replacements || []) {
      const { genericLabel, genericLabels, periodsBack, periodLabel } = replacement;
      for (const label of genericLabels || [genericLabel]) {
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const multiplier = periodsBack > 1 ? `\\s*×\\s*${periodsBack}` : "";
        const suffix = new RegExp(`\\s*\\(${escapedLabel}${multiplier}\\)$`, "iu");
        if (suffix.test(result)) {
          result = result.replace(suffix, ` (${periodLabel})`);
          return result;
        }
      }
    }
    return result;
  }

  _applyComparisonSeriesPeriodLabels(card) {
    const root = card?.shadowRoot;
    if (
      !root
      || typeof document === "undefined"
      || typeof document.createTreeWalker !== "function"
    ) return;
    const replacements = this._comparisonSeriesPeriodReplacements();
    if (!replacements.length) return;
    const walker = document.createTreeWalker(root, 4);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      const next = this._replaceComparisonSeriesPeriodLabel(node.nodeValue, replacements);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  _comparisonRangeLabel(start, end, includeTime = true, periodKind = "other") {
    const language = this._hass?.locale?.language || this._hass?.language;
    const timeZone = this._resolvedTimeZone?.() || this._hass?.config?.time_zone;
    if (!includeTime && periodKind === "day") {
      return new Intl.DateTimeFormat(language, {
        dateStyle: "long",
        ...(timeZone ? { timeZone } : {}),
      }).format(start);
    }
    if (!includeTime && periodKind === "month") {
      return new Intl.DateTimeFormat(language, {
        month: "long",
        year: "numeric",
        ...(timeZone ? { timeZone } : {}),
      }).format(start);
    }
    if (!includeTime && periodKind === "year") {
      return new Intl.DateTimeFormat(language, {
        year: "numeric",
        ...(timeZone ? { timeZone } : {}),
      }).format(start);
    }
    const dateOptions = { dateStyle: "long", ...(timeZone ? { timeZone } : {}) };
    const timeOptions = { timeStyle: "short", ...(timeZone ? { timeZone } : {}) };
    const dateFormatter = new Intl.DateTimeFormat(language, dateOptions);
    const timeFormatter = new Intl.DateTimeFormat(language, timeOptions);
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    if (!includeTime) return startDate === endDate ? startDate : `${startDate} – ${endDate}`;
    const startTime = timeFormatter.format(start);
    const endTime = timeFormatter.format(end);
    return startDate === endDate
      ? `${startDate}, ${startTime} – ${endTime}`
      : `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
  }

  _panelDayPeriod() {
    const start = this._periodStore?.start;
    const end = this._periodStore?.end;
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
    // period. Applying daily hour filters would leave the hidden hours
    // between yesterday's slot and today's slot on the extended axis.
    if (this._sequentialPanelTimeComparisonActive()) return {};
    // A wrapping window is stored as the period itself.
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

  _panelTimeValue(value) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
  }

  _panelTimeDisplayValue(value) {
    return this._panelTimeValue(value).slice(0, 5);
  }

  _lockDashboardCardLayout() {
    if (!this._dashboardCardMode || this._dashboardCardLayoutLock) return false;
    const card = this.shadowRoot?.querySelector?.("ha-card.dashboard-card");
    const height = Math.ceil(card?.getBoundingClientRect?.().height || 0);
    if (!card || height < 1) return false;
    const properties = ["height", "min-height", "max-height"];
    this._dashboardCardLayoutLock = {
      card,
      previous: Object.fromEntries(
        properties.map((property) => [property, card.style.getPropertyValue(property)]),
      ),
    };
    const value = `${height}px`;
    for (const property of properties) card.style.setProperty(property, value);
    return true;
  }

  _releaseDashboardCardLayout() {
    const lock = this._dashboardCardLayoutLock;
    this._dashboardCardLayoutLock = null;
    if (!lock?.card) return;
    for (const [property, value] of Object.entries(lock.previous || {})) {
      if (value) lock.card.style.setProperty(property, value);
      else lock.card.style.removeProperty(property);
    }
  }

  _beginPeriodInteractionLoading() {
    if (this._periodRestoreLoading) return;
    // SGCC temporarily changes the size of its plot and legend while fetching
    // a new period. In a dashboard that transient size is observable by the
    // masonry/sections layout and moves the page under the user's pointer.
    // Preserve the fully-rendered card height for subsequent interactions;
    // a card configuration render releases it so SGCC height changes still
    // take effect normally.
    this._lockDashboardCardLayout();
    this._periodInteractionLoading = true;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    const text = this.shadowRoot?.getElementById("period-loading-text");
    if (text) text.textContent = this._customLocalize("loading_requested_range");
    const compareBanner = this.shadowRoot?.getElementById("compare-banner");
    if (compareBanner) compareBanner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    // Keep the existing chart mounted and visible while SGCC reloads its
    // Energy data. This matches the native card, avoids unnecessary layout
    // work in the panel, and prevents dashboard masonry/grid position jumps.
    if (charts) charts.hidden = false;
    if (this._dashboardCardMode) {
      if (banner) banner.hidden = true;
      return;
    }
    if (banner) banner.hidden = false;
  }

  _finishPeriodInteractionLoading() {
    if (!this._periodInteractionLoading) return;
    this._periodInteractionLoading = false;
    const banner = this.shadowRoot?.getElementById("period-loading-banner");
    if (banner && !this._periodRestoreLoading) banner.hidden = true;
    const charts = this.shadowRoot?.getElementById("charts");
    if (charts && !this._periodRestoreLoading) charts.hidden = false;
  }

  _syncPanelTimeRangeControl() {
    const control = this.shadowRoot?.getElementById("panel-time-range");
    if (!control) return;
    const period = this._panelDayPeriod();
    const restoring = this._periodRestoreLoading && Boolean(this._periodRestoreExpected?.start);
    this.shadowRoot?.getElementById("date-controller")?.classList.toggle(
      "has-time-range",
      Boolean(period),
    );
    control.hidden = !period || restoring;
    if (!period || restoring) return;
    const value = control.querySelector(".panel-time-range-value");
    if (value) {
      value.textContent = `${this._panelTimeDisplayValue(period.start)} – ${this._panelTimeDisplayValue(period.end)}`;
    }
  }

  _periodSelectorParts(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return { primary: "—", secondary: "", kind: "other" };
    }
    const language = this._hass?.locale?.language || this._hass?.language;
    const timeZone = this._resolvedTimeZone?.() || this._hass?.config?.time_zone;
    const zone = timeZone ? { timeZone } : {};
    const kind = this._periodKind(start, end);
    const inclusiveEnd = new Date(Math.max(start.getTime(), end.getTime() - 1));
    const year = new Intl.DateTimeFormat(language, { year: "numeric", ...zone });
    const startYear = year.format(start);
    const endYear = year.format(inclusiveEnd);
    const currentYear = year.format(new Date());
    if (kind === "year") return { primary: startYear, secondary: "", kind };
    if (kind === "month") {
      return {
        primary: new Intl.DateTimeFormat(language, { month: "long", ...zone }).format(start),
        secondary: startYear === currentYear ? "" : startYear,
        kind,
      };
    }
    if (startYear !== endYear) {
      const formatter = new Intl.DateTimeFormat(language, {
        day: "numeric", month: "short", year: "numeric", ...zone,
      });
      return {
        primary: typeof formatter.formatRange === "function"
          ? formatter.formatRange(start, inclusiveEnd)
          : `${formatter.format(start)} – ${formatter.format(inclusiveEnd)}`,
        secondary: "",
        kind,
      };
    }
    const formatter = new Intl.DateTimeFormat(language, {
      day: "numeric", month: "short", ...zone,
    });
    return {
      primary: kind === "day"
        ? formatter.format(start)
        : typeof formatter.formatRange === "function"
          ? formatter.formatRange(start, inclusiveEnd)
          : `${formatter.format(start)} – ${formatter.format(inclusiveEnd)}`,
      secondary: startYear === currentYear ? "" : startYear,
      kind,
    };
  }

  _syncGraphCardsToPeriod(collection = this._periodStore) {
    const start = collection?.start;
    const end = collection?.end;
    if (!(start instanceof Date) || !(end instanceof Date)) return false;
    const group = this._periodSyncGroup();
    if (!group) return false;
    const detail = {
      group,
      mode: "custom",
      offset: 0,
      customStart: start.toISOString(),
      customEnd: end.toISOString(),
      sourceId: this._dashboardCardMode
        ? `advanced-history-${this._dashboardConfig?.snapshot?.id || "dashboard"}`
        : `advanced-history-panel-${this._activePanelTabId || "default"}`,
    };
    if (!this._dashboardCardMode) {
      // Panel graph cards are frequently recreated while switching tabs or
      // changing detail. Call their native SGCC sync handler directly so the
      // selected period cannot be lost before a window listener is attached.
      for (const card of this._graphCards || []) {
        card?._onDatePickerSyncEvent?.({ detail });
      }
    } else if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent("sgc-datepicker-sync", { detail }));
    } else {
      for (const card of this._graphCards || []) {
        card?._onDatePickerSyncEvent?.({ detail });
      }
    }
    return true;
  }

  _periodSyncGroup() {
    if (this._dashboardCardMode) return this._dashboardDatePickerGroup?.() || null;
    const id = String(this._activePanelTabId || "default")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-");
    return `advanced-history-panel-${id}`;
  }

  _createPeriodStore() {
    const owner = this;
    const listeners = new Set();
    const savedStart = this._dashboardPeriodState?.start;
    const savedEnd = this._dashboardPeriodState?.end;
    const today = savedStart ? new Date(savedStart) : new Date();
    if (!savedStart) today.setHours(0, 0, 0, 0);
    const end = savedEnd ? new Date(savedEnd) : new Date(today);
    if (!savedEnd) end.setHours(23, 59, 59, 999);
    let publishPending = false;
    const remember = (store) => {
      owner._dashboardPeriodState = {
        start: new Date(store.start),
        end: new Date(store.end),
        compare: store.compare || "",
      };
    };
    const store = {
      start: today,
      end,
      compare: this._dashboardPeriodState?.compare || "",
      setPeriod(startValue, endValue) {
        this.start = new Date(startValue);
        this.end = new Date(endValue);
        remember(this);
      },
      setCompare(mode) {
        this.compare = mode || "";
        remember(this);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      refresh() {
        if (publishPending) return;
        publishPending = true;
        queueMicrotask(() => {
          publishPending = false;
          const data = {
            start: new Date(store.start),
            end: new Date(store.end),
            compareMode: store.compare,
          };
          for (const listener of listeners) listener(data);
        });
      },
    };
    remember(store);
    return store;
  }

  _comparisonDisplayPeriod(store = this._periodStore) {
    const visiblePeriod = this._panelTimeRange ? this._panelDayPeriod() : null;
    return {
      start: visiblePeriod?.start || store?.start,
      end: visiblePeriod?.end || store?.end,
    };
  }

  _renderComparisonBanner(host, store = this._periodStore) {
    if (!host) return;
    const active = Boolean(store?.compare && this._comparisonBannerVisible);
    host.hidden = !active;
    if (!active) {
      host.replaceChildren();
      return;
    }
    const choice = this._comparisonChoice
      || this._comparisonChoiceFromMode(store.compare)
      || "previous_period";
    const { start: displayStart, end: displayEnd } = this._comparisonDisplayPeriod(store);
    const ranges = this._comparisonRanges(
      displayStart,
      displayEnd,
      choice,
      this._comparisonCount,
    );
    if (!ranges.length) {
      host.hidden = true;
      return;
    }
    const periodKind = this._periodKind(displayStart, displayEnd);
    const includeTime = Boolean(this._panelTimeRange);
    const currentLabel = this._comparisonRangeLabel(
      displayStart,
      displayEnd,
      includeTime,
      periodKind,
    );
    const comparisonLabels = ranges.map((range) => this._comparisonRangeLabel(
      range.start,
      range.end,
      includeTime,
      periodKind,
    ));
    const language = this._hass?.locale?.language || this._hass?.language;
    const listFormatter = new Intl.ListFormat(language, {
      style: "long",
      type: "conjunction",
    });
    const startMarker = "__ADVANCED_HISTORY_START__";
    const endMarker = "__ADVANCED_HISTORY_END__";
    const message = this._localize(
      "ui.panel.lovelace.cards.energy.energy_compare.info",
      `You are comparing the period ${startMarker} with the period ${endMarker}`,
      { start: startMarker, end: endMarker },
    );
    const alert = document.createElement("ha-alert");
    const markerPattern = new RegExp(`(${startMarker}|${endMarker})`, "g");
    for (const part of message.split(markerPattern)) {
      if (!part) continue;
      if (part === startMarker) {
        const strong = document.createElement("b");
        strong.textContent = currentLabel;
        alert.append(strong);
      } else if (part === endMarker) {
        const listParts = comparisonLabels.length > 1
          ? listFormatter.formatToParts(comparisonLabels)
          : [{ type: "element", value: comparisonLabels[0] }];
        for (const listPart of listParts) {
          if (listPart.type === "element") {
            const strong = document.createElement("b");
            strong.textContent = listPart.value;
            alert.append(strong);
          } else {
            alert.append(document.createTextNode(listPart.value));
          }
        }
      } else {
        alert.append(document.createTextNode(part));
      }
    }
    host.replaceChildren(alert);
  }

  _bindPeriodStore(token, host, compareHost, renderControls = true) {
    const store = this._createPeriodStore();
    this._periodStore = store;
    if (this._dashboardPeriodStoreFollower) {
      // A group shares only its date range. Comparison mode, period and count
      // remain local to each card (including an editor preview), so restore
      // them before discarding the pending range that the group replaces.
      const localComparison = this._pendingRollingCompareRestore
        ?? this._pendingPeriodRestore
        // Lovelace can detach and reconnect an already initialized card
        // without applying its snapshot again. In that path there is no
        // pending period, so recover the card-local comparison from its
        // canonical SGCC entity rows instead of inheriting the empty compare
        // state of the newly created local store.
        ?? this._dashboardConfiguredComparisonPeriod?.();
      const localCompare = this._restoreDashboardLocalComparison(localComparison);
      store.setCompare(localCompare);
      this._pendingRollingCompareRestore = null;
      this._pendingPeriodRestore = null;
      this._finishPeriodRestore();
    } else {
      if (this._panelRollingHours && this._pendingRollingCompareRestore) {
        const restore = this._pendingRollingCompareRestore;
        this._pendingRollingCompareRestore = null;
        this._comparisonChoice = restore.choice;
        this._comparisonCount = restore.count;
        store.setCompare(restore.compare);
      }
      if (this._panelRollingHours) {
        this._refreshPanelRollingRange(true);
      } else if (this._pendingPeriodRestore?.start) {
        this._restorePendingPeriod(store, false);
        this._finishPeriodRestore();
      } else if (this._periodResetPending || !this._targetCount()) {
        this._resetPeriodSelection(store);
      }
    }
    this._activateGraphDataSourceTracking();
    if (renderControls) {
      this._renderPeriodSelector(host, store);
      this._renderPanelTimeRangeControl(host);
    }

    const applyMode = (mode = store.compare, force = false) => {
      if (this._periodRenderToken !== token) return;
      const nativeChoice = this._comparisonChoiceFromMode(mode);
      const next = mode
        ? this._comparisonValue(
          this._comparisonChoice || nativeChoice,
          this._comparisonCount,
        )
        : null;
      this._syncY2ComparisonToggle(Boolean(next));
      this._syncY1ComparisonToggle(Boolean(next));
      const nextDetailKey = this._largeRangeDetailRenderKey();
      if (
        !force
        && JSON.stringify(next) === JSON.stringify(this._comparisonState)
        && nextDetailKey === this._largeRangeDetailStateKey
      ) return;
      this._comparisonState = next;
      this._largeRangeDetailStateKey = nextDetailKey;
      this._renderGraphs();
      this._syncGraphCardsToPeriod(store);
      this._renderComparisonBanner(compareHost, store);
    };
    this._applyComparisonMode = applyMode;
    this._periodUnsubscribe = store.subscribe(() => {
      if (this._periodRenderToken !== token) return;
      this._syncPeriodSelector(store);
      applyMode(store.compare);
      this._syncGraphCardsToPeriod(store);
      this._renderComparisonBanner(compareHost, store);
      this._finishPeriodInteractionLoading();
      this._syncPanelTimeRangeControl();
      this._recordChange(null, true);
    });
    applyMode(store.compare, true);
    this._syncGraphCardsToPeriod(store);
    this._renderComparisonBanner(compareHost, store);
    this._recordChange();
  }

  _setPeriodSelectorRange(startValue, endValue) {
    const collection = this._periodStore;
    if (!collection) return;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (
      collection.start?.getTime?.() === start.getTime()
      && collection.end?.getTime?.() === end.getTime()
      && !this._panelTimeRange
      && !this._panelRollingHours
    ) return;
    this._setPanelRollingHours(null);
    this._panelTimeRange = null;
    this._closePanelTimeRangeDialog?.();
    this._updateGraphHourOptionsInPlace?.();
    this._beginGraphDataSourceCycle();
    this._beginPeriodInteractionLoading();
    collection.setPeriod(start, end);
    this._syncPeriodSelector(collection);
    // Forward the range immediately so SGCC can start its graph query before
    // the store publishes its coalesced update.
    this._syncGraphCardsToPeriod(collection);
    collection.refresh?.();
  }

  _shiftPeriodSelectorRange(direction) {
    const collection = this._periodStore;
    if (!collection || ![-1, 1].includes(direction)) return;
    if (this._panelTimeRange && this._panelDayPeriod()) {
      this._shiftPanelTimeRange(direction);
      return;
    }
    const start = new Date(collection.start);
    const end = new Date(collection.end);
    const kind = this._periodKind(start, end);
    if (kind === "month") {
      start.setMonth(start.getMonth() + direction, 1);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (kind === "year") {
      start.setFullYear(start.getFullYear() + direction, 0, 1);
      end.setFullYear(start.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
    } else {
      const duration = end.getTime() - start.getTime() + 1;
      start.setTime(start.getTime() + duration * direction);
      end.setTime(end.getTime() + duration * direction);
    }
    this._setPeriodSelectorRange(start, end);
  }

  _selectCurrentPeriod() {
    const collection = this._periodStore;
    if (!collection) return;
    const kind = this._periodKind(collection.start, collection.end);
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    if (kind === "year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (kind === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (kind === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      const duration = collection.end.getTime() - collection.start.getTime();
      end.setHours(23, 59, 59, 999);
      start = new Date(end.getTime() - duration);
      start.setHours(0, 0, 0, 0);
    }
    this._setPeriodSelectorRange(start, end);
  }

  _selectCurrentOrRollingPeriod() {
    if (this._panelRollingHours || this._panelRollingResumeHours) {
      this._refreshPanelRollingRange();
      return;
    }
    this._selectCurrentPeriod();
  }

  _renderPeriodSelector(host, collection) {
    let controller = host.querySelector(".advanced-history-period-selector");
    if (!controller) {
      const panelMode = !this._dashboardCardMode;
      const dateLabel = this._localize(
        "ui.components.date-range-picker.select_date_range",
        "Select time period",
      );
      const nowLabel = this._localize(
        "ui.panel.lovelace.components.energy_period_selector.now",
        "Now",
      );
      const previous = this._localize(
        "ui.panel.lovelace.components.energy_period_selector.previous",
        "Previous",
      );
      const next = this._localize(
        "ui.panel.lovelace.components.energy_period_selector.next",
        "Next",
      );
      controller = document.createElement("div");
      controller.className = `advanced-history-period-selector${panelMode ? " panel-period-selector" : ""}`;
      controller.innerHTML = panelMode ? `
        <div class="period-selector-content">
          <div class="period-selector-date-control">
            <section class="period-selector-date-picker">
              <ha-date-range-picker class="period-selector-picker" minimal backdrop extended-presets popover-placement="top"></ha-date-range-picker>
            </section>
            <button class="period-selector-label" type="button" title="${this._escape(dateLabel)}" aria-label="${this._escape(dateLabel)}"><span class="period-selector-primary"></span><span class="period-selector-secondary"></span></button>
          </div>
          <section class="period-selector-actions">
            <ha-button class="period-selector-now" appearance="filled" size="s">${this._escape(nowLabel)}</ha-button>
            <ha-icon-button class="period-selector-nav previous" label="${this._escape(previous)}"><ha-icon icon="mdi:chevron-left"></ha-icon></ha-icon-button>
            <ha-icon-button class="period-selector-nav next" label="${this._escape(next)}"><ha-icon icon="mdi:chevron-right"></ha-icon></ha-icon-button>
            <ha-icon-button class="period-selector-menu-button" aria-haspopup="menu" aria-expanded="false"><ha-icon icon="mdi:dots-vertical"></ha-icon></ha-icon-button>
          </section>
        </div>
        <ha-dropdown class="period-selector-menu" placement="top-end" distance="7"></ha-dropdown>` : `
        <ha-date-range-picker class="period-selector-picker" minimal backdrop extended-presets popover-placement="top"></ha-date-range-picker>
        <button class="period-selector-label" type="button" title="${this._escape(dateLabel)}" aria-label="${this._escape(dateLabel)}"><span class="period-selector-primary"></span><span class="period-selector-secondary"></span></button>
        <button class="period-selector-now" type="button">${this._escape(nowLabel)}</button>
        <button class="period-selector-nav previous" type="button" title="${this._escape(previous)}" aria-label="${this._escape(previous)}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="period-selector-nav next" type="button" title="${this._escape(next)}" aria-label="${this._escape(next)}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
      host.prepend(controller);
      const picker = controller.querySelector(".period-selector-picker");
      controller.querySelector(".period-selector-label")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const field = picker.shadowRoot?.getElementById("field");
        if (field) field.click();
        else picker.open?.();
      });
      controller.querySelector(".period-selector-now")?.addEventListener("click", () => {
        this._selectCurrentOrRollingPeriod();
      });
      controller.querySelector(".period-selector-nav.previous")?.addEventListener("click", () => this._shiftPeriodSelectorRange(-1));
      controller.querySelector(".period-selector-nav.next")?.addEventListener("click", () => this._shiftPeriodSelectorRange(1));
      picker.addEventListener("value-changed", (event) => {
        if (picker.__advancedHistorySyncing) return;
        const value = event.detail?.value;
        if (value?.startDate && value?.endDate) {
          this._setPeriodSelectorRange(value.startDate, value.endDate);
        }
      });
      if (panelMode) {
        picker.addEventListener("picker-closed", () => this._hidePeriodSelectorAfterClose());
        this._configurePeriodSelectorMenu(controller);
      }
    }
    this._syncPeriodSelector(collection);
  }

  _configurePeriodSelectorMenu(controller) {
    const button = controller?.querySelector(".period-selector-menu-button");
    const dropdown = controller?.querySelector(".period-selector-menu");
    if (!button || !dropdown) return;
    const compareLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.compare",
      "Compare data",
    );
    const downloadLabel = this._localize(
      "ui.panel.lovelace.components.energy_period_selector.download_data",
      "Download data",
    );
    const menuLabel = this._localize("ui.common.overflow_menu", "Menu");
    button.title = menuLabel;
    button.setAttribute("aria-label", menuLabel);
    dropdown.innerHTML = `
      <ha-dropdown-item data-advanced-history-compare role="menuitemcheckbox"><ha-icon slot="icon"></ha-icon>${this._escape(compareLabel)}</ha-dropdown-item>
      <ha-dropdown-item data-advanced-history-download><ha-icon slot="icon" icon="mdi:download"></ha-icon>${this._escape(downloadLabel)}</ha-dropdown-item>`;
    this._installPeriodSelectorExportActions(dropdown);
    dropdown.querySelector("[data-advanced-history-compare]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.open = false;
      this._setY1ComparisonEnabled(!this._periodStore?.compare);
    });
    dropdown.querySelector("[data-advanced-history-download]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.open = false;
      this._downloadChartData();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.anchorElement = button;
      dropdown.open = !dropdown.open;
      button.setAttribute("aria-expanded", String(dropdown.open));
    });
    dropdown.addEventListener("wa-hide", () => button.setAttribute("aria-expanded", "false"));
  }

  _syncPeriodSelectorMenu(controller = this.shadowRoot?.querySelector(".panel-period-selector")) {
    const dropdown = controller?.querySelector(".period-selector-menu");
    const compare = dropdown?.querySelector("[data-advanced-history-compare]");
    this._setComparisonMenuCheckboxState(compare, Boolean(this._periodStore?.compare));
    this._syncPeriodSelectorAutoHideAction(dropdown);
  }

  _syncPeriodSelector(collection = this._periodStore) {
    const controller = this.shadowRoot?.querySelector(".advanced-history-period-selector");
    if (!controller || !(collection?.start instanceof Date) || !(collection?.end instanceof Date)) return;
    const parts = this._periodSelectorParts(collection.start, collection.end);
    controller.dataset.periodKind = parts.kind;
    const picker = controller.querySelector(".period-selector-picker");
    picker.__advancedHistorySyncing = true;
    picker.startDate = collection.start;
    picker.endDate = collection.end;
    const primary = controller.querySelector(".period-selector-primary");
    const secondary = controller.querySelector(".period-selector-secondary");
    if (primary) primary.textContent = parts.primary;
    if (secondary) secondary.textContent = parts.secondary;
    this._syncPeriodSelectorMenu(controller);

    // ha-date-range-picker can publish value-changed after its Lit update has
    // completed. Keep programmatic store-to-picker updates guarded through the
    // next paint so a remount cannot be mistaken for a user date selection and
    // clear an active rolling range.
    const syncToken = Symbol("period-picker-sync");
    picker.__advancedHistorySyncToken = syncToken;
    const releaseSync = () => {
      if (picker.__advancedHistorySyncToken === syncToken) {
        picker.__advancedHistorySyncing = false;
      }
    };
    Promise.resolve(picker.updateComplete).then(() => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(releaseSync);
      else setTimeout(releaseSync, 0);
    }, releaseSync);
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
    const periodSelector = host.querySelector(".advanced-history-period-selector");
    const actions = periodSelector?.querySelector(".period-selector-actions");
    const nowButton = periodSelector?.querySelector(".period-selector-now");
    if (actions && nowButton) actions.insertBefore(control, nowButton);
    else if (periodSelector && nowButton) periodSelector.insertBefore(control, nowButton);
    else host.append(control);
    this._syncPanelTimeRangeControl();
  }

  _openPanelTimeRangeDialog() {
    const period = this._panelDayPeriod();
    if (!period) return;
    this._closePanelTimeRangeDialog?.();
    this._panelTimeRangeDialogOpen = true;
    this._revealPeriodSelector();
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
        this._panelTimeRangeDialogOpen = false;
        this._hidePeriodSelectorAfterClose();
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
    if (!this._periodStore || !period) return false;
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

  _refreshPanelRollingRange(deferRefresh = false) {
    const hours = this._panelRollingHours || this._panelRollingResumeHours;
    if (!hours || !this.isConnected) return false;
    if (!this._periodStore) {
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
    const applied = this._applyPanelTimeRangePeriod(start, true, true, deferRefresh);
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

  _shiftPanelTimeRange(direction) {
    const period = this._panelDayPeriod();
    if (!this._periodStore || !period || ![-1, 1].includes(direction)) return false;
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

  _applyPanelTimeRangePeriod(
    dayStart,
    forceRefresh = false,
    quiet = false,
    deferRefresh = false,
  ) {
    const collection = this._periodStore;
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
      if (changed) {
        collection.setPeriod(start, end);
        this._syncGraphCardsToPeriod(collection);
      }
      this._updateGraphHourOptionsInPlace?.();
      this._syncPanelTimeRangeControl();
      if (!deferRefresh && (changed || forceRefresh)) collection.refresh?.();
      return true;
    }
    this._beginGraphDataSourceCycle();
    if (changed) {
      this._beginPeriodInteractionLoading();
      collection.setPeriod(start, end);
      this._syncGraphCardsToPeriod(collection);
    }
    // Existing SGCC cards already follow this period store, so keep them
    // mounted and only update the hour-filter configuration. This
    // matches native SGCC navigation and avoids rebuilding the complete chart
    // before every Day/partial-day refresh.
    if (this._graphCards?.length) this._updateGraphHourOptionsInPlace?.();
    else this._renderGraphs();
    this._syncPanelTimeRangeControl();
    if (changed || forceRefresh) collection.refresh?.();
    else this._recordChange(null, true);
    return true;
  }

  _shiftPanelDay(direction) {
    const period = this._panelDayPeriod();
    if (!this._periodStore || !period || ![-1, 1].includes(direction)) return false;
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
      // The period selector would otherwise also move the selected day.
      // Finish the HA action gesture here, then prevent its
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
        if (
          (element.localName === "ha-icon-button"
            || element.classList?.contains?.("period-selector-nav"))
          && directionFromButton(element)
        ) {
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

  _syncPeriodSelectorAutoHideAction(dropdown = null) {
    const item = dropdown?.querySelector?.("[data-advanced-history-auto-hide]")
      || this.shadowRoot
        ?.querySelector(".period-selector-menu")
        ?.querySelector("[data-advanced-history-auto-hide]");
    if (!item) return;
    item.setAttribute("aria-checked", String(Boolean(this._datePickerAutoHide)));
    const icon = item.querySelector("ha-icon");
    if (icon) {
      icon.setAttribute(
        "icon",
        this._datePickerAutoHide ? "mdi:checkbox-outline" : "mdi:checkbox-blank-outline",
      );
    }
  }

  _setPeriodSelectorAutoHide(enabled) {
    this._datePickerAutoHide = Boolean(enabled);
    try {
      localStorage.setItem(
        DATE_PICKER_AUTO_HIDE_STORAGE_KEY,
        String(this._datePickerAutoHide),
      );
    } catch (_) { /* Ignore unavailable local storage. */ }
    if (this._datePickerAutoHideTimer) window.clearTimeout(this._datePickerAutoHideTimer);
    this._datePickerAutoHideTimer = null;
    const host = this.shadowRoot?.getElementById("date-controller");
    host?.classList.toggle("auto-hide", this._datePickerAutoHide);
    host?.classList.remove("revealed");
    this.shadowRoot
      ?.querySelector("main.content")
      ?.classList.toggle("date-picker-auto-hide", this._datePickerAutoHide);
    const zone = this.shadowRoot?.getElementById("date-controller-reveal");
    if (zone) zone.hidden = !this._datePickerAutoHide;
    this._syncPeriodSelectorAutoHideAction();
    this._graphLayoutSchedule?.();
  }

  _revealPeriodSelector() {
    if (!this._datePickerAutoHide) return;
    if (this._datePickerAutoHideTimer) window.clearTimeout(this._datePickerAutoHideTimer);
    this._datePickerAutoHideTimer = null;
    this.shadowRoot?.getElementById("date-controller")?.classList.add("revealed");
  }

  _hidePeriodSelector() {
    if (!this._datePickerAutoHide) return;
    if (this._datePickerAutoHideTimer) window.clearTimeout(this._datePickerAutoHideTimer);
    this._datePickerAutoHideTimer = null;
    this.shadowRoot?.getElementById("date-controller")?.classList.remove("revealed");
  }

  _hidePeriodSelectorAfterClose() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._hidePeriodSelector();
    }));
  }

  _schedulePeriodSelectorHide() {
    if (!this._datePickerAutoHide) return;
    if (this._datePickerAutoHideTimer) window.clearTimeout(this._datePickerAutoHideTimer);
    this._datePickerAutoHideTimer = window.setTimeout(() => {
      this._datePickerAutoHideTimer = null;
      if (this._panelTimeRangeDialogOpen) return;
      const host = this.shadowRoot?.getElementById("date-controller");
      const zone = this.shadowRoot?.getElementById("date-controller-reveal");
      if (
        host?.matches(":hover")
        || host?.matches(":focus-within")
        || zone?.matches(":hover")
        || zone?.matches(":focus")
      ) return;
      host?.classList.remove("revealed");
    }, 300);
  }

  _bindPeriodSelectorAutoHide() {
    const host = this.shadowRoot?.getElementById("date-controller");
    const zone = this.shadowRoot?.getElementById("date-controller-reveal");
    if (!host || !zone) return;
    const reveal = () => this._revealPeriodSelector();
    const hide = () => this._schedulePeriodSelectorHide();
    host.addEventListener("pointerenter", reveal);
    host.addEventListener("pointerleave", hide);
    host.addEventListener("focusin", reveal);
    host.addEventListener("focusout", hide);
    zone.addEventListener("pointerenter", reveal);
    zone.addEventListener("pointerleave", hide);
    zone.addEventListener("focus", reveal);
    zone.addEventListener("blur", hide);
    zone.addEventListener("click", reveal);
  }

  async _renderPeriodController() {
    const host = this.shadowRoot.getElementById("date-controller");
    const compareHost = this.shadowRoot.getElementById("compare-banner");
    if (!host || !compareHost) return;
    const token = Symbol("period-selector-render");
    this._periodRenderToken = token;
    const dateRange = this._localize("ui.components.date-range-picker.select_date_range", "Select time period");
    const loading = this._localize("ui.common.loading", "Loading");
    host.innerHTML = `<div class="target-picker" style="cursor:default"><span class="target-label">${this._escape(dateRange)}</span><span style="padding:3px 4px;color:var(--secondary-text-color)">${this._escape(loading)}…</span></div>`;
    try {
      const renderControls = !this._dashboardCardMode
        || this._dashboardDatePickerVisible?.() !== false;
      if (renderControls) await this._ensureDashboardDatePickerLoaded();
      if (this._periodRenderToken !== token || !host.isConnected) return;
      host.replaceChildren();
      this._bindPeriodStore(token, host, compareHost, renderControls);
    } catch (error) {
      if (this._periodRenderToken !== token || !host.isConnected) return;
      console.error("Advanced History: date selector failed to load", error);
      host.innerHTML = `<div class="error" style="padding:10px">${this._escape(this._customLocalize("period_selector_error"))}</div>`;
    }
  }

  async _loadCardHelpers() {
    if (typeof window.loadCardHelpers === "function") {
      return window.loadCardHelpers();
    }
    if (!this._cardHelpersLoader) {
      this._cardHelpersLoader = (async () => {
        await customElements.whenDefined("partial-panel-resolver");
        const resolver = document.createElement("partial-panel-resolver");
        resolver.hass = this._hass;
        const panel = {
          component_name: "lovelace",
          url_path: "advanced-history-lovelace-loader",
        };
        let routes;
        if (typeof resolver._getRoutes === "function") {
          routes = resolver._getRoutes({ [panel.url_path]: panel });
        } else if (typeof resolver.getRoutes === "function") {
          // Compatibility with Home Assistant versions that exposed the
          // resolver's route builder publicly and accepted a panel array.
          routes = resolver.getRoutes([panel]);
        }
        const route = routes?.routes?.[panel.url_path];
        if (typeof route?.load !== "function") {
          throw new Error("Home Assistant Lovelace loader is unavailable");
        }
        await route.load();
        if (typeof window.loadCardHelpers !== "function") {
          throw new Error("Home Assistant card helpers are unavailable");
        }
      })().catch((error) => {
        this._cardHelpersLoader = null;
        throw error;
      });
    }
    await this._cardHelpersLoader;
    return window.loadCardHelpers();
  }

  async _ensureDashboardDatePickerLoaded() {
    if (customElements.get("ha-date-range-picker")) return;
    const helpers = await this._loadCardHelpers();
    if (!customElements.get("hui-energy-date-selection-card")) {
      // Import the module only. The temporary element is never connected or
      // given hass, so it cannot create or subscribe to an Energy collection.
      helpers.createCardElement({ type: "energy-date-selection" });
    }
    await this._waitForCustomElement("hui-energy-date-selection-card");
    await this._waitForCustomElement("ha-date-range-picker");
  }

  async _waitForCustomElement(tag, timeout = 10000) {
    if (customElements.get(tag)) return;
    let timeoutId;
    try {
      await Promise.race([
        customElements.whenDefined(tag),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error(`Home Assistant card ${tag} did not load`));
          }, timeout);
        }),
      ]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  _installPeriodSelectorExportActions(selector) {
    const dropdown = selector?.localName === "ha-dropdown"
      ? selector
      : selector?.shadowRoot?.querySelector("ha-dropdown");
    if (!dropdown) return;

    if (this._dashboardCardMode && selector?.localName !== "ha-dropdown") {
      const trigger = dropdown.anchorElement
        || dropdown.querySelector('[slot="trigger"]')
        || [...(selector.shadowRoot?.querySelectorAll("ha-icon-button,button") || [])]
          .find((element) => {
            const icon = element.getAttribute?.("icon")
              || element.querySelector?.("ha-icon")?.getAttribute?.("icon");
            return icon === "mdi:dots-vertical" || icon === "mdi:more-vert";
          });
      if (trigger) {
        trigger.hidden = true;
        trigger.style.display = "none";
      }
      dropdown.open = false;
      dropdown.hidden = true;
      dropdown.setAttribute("aria-hidden", "true");
      return;
    }

    if (!dropdown.querySelector("[data-advanced-history-panel-export]")) {
      const label = this._customLocalize("add_current_panel_to_dashboard");
      const item = document.createElement("ha-dropdown-item");
      item.dataset.advancedHistoryPanelExport = "";
      const icon = document.createElement("ha-svg-icon");
      icon.slot = "icon";
      icon.path = PANEL_EXPORT_ICON_PATH;
      item.append(icon, document.createTextNode(label));
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropdown.open = false;
        void this._addCurrentPanelToDashboard(item);
      });
      dropdown.append(item);
    }

    if (!dropdown.querySelector("[data-advanced-history-native-export]")) {
      const item = document.createElement("ha-dropdown-item");
      item.dataset.advancedHistoryNativeExport = "";
      const icon = document.createElement("ha-svg-icon");
      icon.slot = "icon";
      icon.path = PANEL_EXPORT_ICON_PATH;
      item.append(
        icon,
        document.createTextNode(this._customLocalize("add_current_chart_to_dashboard")),
      );
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropdown.open = false;
        void this._addCurrentPanelAsNativeCard(item);
      });
      dropdown.append(item);
    }

    if (!dropdown.querySelector("[data-advanced-history-auto-hide]")) {
      const item = document.createElement("ha-dropdown-item");
      item.dataset.advancedHistoryAutoHide = "";
      item.setAttribute("role", "menuitemcheckbox");
      const icon = document.createElement("ha-icon");
      icon.slot = "icon";
      item.append(icon, document.createTextNode(this._customLocalize("auto_hide_date_picker")));
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropdown.open = false;
        this._setPeriodSelectorAutoHide(!this._datePickerAutoHide);
      });
      dropdown.append(item);
    }
    this._syncPeriodSelectorAutoHideAction(dropdown);
  }

  _downloadChartData(graphCards = this._graphCards) {
    const downloads = chartDataDownloads(graphCards || []);
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
    const multiple = downloads.length > 1;
    const first = downloads[0];
    const blob = multiple
      ? chartDataZip(downloads, now)
      : new Blob(["\ufeff", first.csv], { type: "text/csv;charset=utf-8" });
    const safeTitle = safeDownloadTitle(first.title, "chart");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = multiple
      ? `advanced-history-group-${timestamp}.zip`
      : `advanced-history-${safeTitle}-${timestamp}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  _resetPeriodSelection(collection = this._periodStore, forceRefresh = false) {
    this._pendingPeriodRestore = null;
    this._finishPeriodRestore();
    this._finishPeriodInteractionLoading();
    this._closePanelTimeRangeDialog?.();
    this._setPanelRollingHours(null);
    this._pendingRollingCompareRestore = null;
    this._panelTimeRange = null;
    this._comparisonState = null;
    this._comparisonChoice = null;
    this._comparisonCount = 1;
    this._largeRangeFineDetail = false;
    this._largeRangeDetailStateKey = null;
    this._largeRangeDetailDismissedKey = null;
    const compareHost = this.shadowRoot?.getElementById("compare-banner");
    if (compareHost) compareHost.hidden = true;
    this._syncY1ComparisonToggle(false);
    this._closeY1ComparisonMenu();
    if (!collection) {
      this._periodResetPending = true;
      return false;
    }

    // Keep the reset pending while the chart is empty so a newly added target
    // starts on Today instead of restoring the previous empty-panel range.
    this._periodResetPending = !this._targetCount();
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
