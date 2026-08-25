import { CARD_TAG } from "./constants.js";

const BRIDGE_TAG = "ha-panel-history";
const SUGGEST_DIALOG_TAG = "hui-dialog-suggest-card";
const WIDE_PREVIEW_MARKER = Symbol("advanced-history-wide-dashboard-preview");
const DESELECTED_OPTIONS_MARKER = Symbol("advanced-history-deselected-export-options");
const WIDE_PREVIEW_PATCH = "__advancedHistoryWidePreviewPatched";
const OMITTED_RUNTIME_KEYS = new Set([
  "energy_date_sync",
  "energy_collection_key",
  "grid_options",
  "layout_options",
  "view_layout",
  "visibility",
  "graph_start_hour",
  "graph_end_hour",
]);

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function exportGroup() {
  const token = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `advanced-history-export-${token}`;
}

function defaultDatePickerMode(start, end, rollingHours) {
  if (Number.isFinite(rollingHours) && Math.abs(rollingHours - 24) < 0.1) {
    return "last_24h";
  }
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "last_24h";
  }

  const hours = (endDate.getTime() - startDate.getTime()) / 3_600_000;
  const nextMonth = new Date(startDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextYear = new Date(startDate);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  if (
    startDate.getMonth() === 0
    && startDate.getDate() === 1
    && Math.abs(endDate.getTime() - nextYear.getTime()) < 7_200_000
  ) return "year";
  if (
    startDate.getDate() === 1
    && Math.abs(endDate.getTime() - nextMonth.getTime()) < 7_200_000
  ) return "month";
  if (hours >= 6 * 24 && hours <= 8 * 24) return "week";
  if (hours <= 26) return "day";
  return "last_24h";
}

export function dashboardCardSnapshots(cards, period = {}) {
  const group = exportGroup();
  const mode = defaultDatePickerMode(
    period.start,
    period.end,
    period.rollingHours,
  );
  return (cards || []).map((card) => {
    const source = card?.__advancedHistoryConfig || card?._config;
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const config = clone(source);
    for (const key of OMITTED_RUNTIME_KEYS) delete config[key];
    if (config.chart_mode === "state_timeline") delete config.height;
    config.type = `custom:${CARD_TAG}`;
    config.show_date_picker = true;
    config.show_interval_picker = false;
    config.date_picker_group = group;
    config.date_picker_nav_position = "right";
    config.date_picker_default_mode = Array.isArray(config.date_picker_modes)
      && !config.date_picker_modes.includes(mode)
      ? config.date_picker_modes[0] || mode
      : mode;
    return config;
  }).filter(Boolean);
}

function yamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value);
  if (text && /^[A-Za-z0-9_./:+-]+$/.test(text) && !/^(true|false|null|yes|no|on|off)$/i.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function yamlLines(value, indent = 0) {
  const padding = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return [`${padding}[]`];
    return value.flatMap((item) => {
      if (item && typeof item === "object") {
        const lines = yamlLines(item, indent + 2);
        return [`${padding}-${lines[0].slice(indent + 1)}`, ...lines.slice(1)];
      }
      return [`${padding}- ${yamlScalar(item)}`];
    });
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return [`${padding}{}`];
    return entries.flatMap(([key, item]) => {
      if (item && typeof item === "object") {
        return [`${padding}${key}:`, ...yamlLines(item, indent + 2)];
      }
      return [`${padding}${key}: ${yamlScalar(item)}`];
    });
  }
  return [`${padding}${yamlScalar(value)}`];
}

function fallbackConfig(cards) {
  return cards.length === 1 ? cards[0] : { type: "vertical-stack", cards };
}

function entityId(row) {
  return typeof row === "string" ? row : row?.entity || row?.statistic_id;
}

function deselectedEntityIds(cards) {
  return [...new Set(cards.flatMap((card) => (
    card.entities || []
  ).filter((row) => row && typeof row === "object" && row.enabled === false)
    .map(entityId)
    .filter(Boolean)))];
}

export function dashboardCardsWithHiddenEntitiesOnLoad(cards) {
  return cards.map((card) => ({
    ...clone(card),
    entities: (card.entities || []).map((row) => {
      if (!row || typeof row !== "object" || row.enabled !== false) return clone(row);
      return {
        ...clone(row),
        enabled: true,
        auto_hide: true,
      };
    }),
  }));
}

function exportEntityIds(cards) {
  return [...new Set(cards.flatMap((card) => (
    card.entities || []
  ).map(entityId).filter(Boolean)))];
}

function deselectedOptions(cards, labels) {
  const deselected = deselectedEntityIds(cards);
  if (!deselected.length) return null;
  return {
    hiddenOnLoadCards: dashboardCardsWithHiddenEntitiesOnLoad(cards),
    disabledCards: clone(cards),
    entities: exportEntityIds(cards),
    label: labels.hideEntitiesOnLoad,
    note: labels.hideEntitiesOnLoadNote,
  };
}

function showYamlFallback(container, cards, labels) {
  const host = document.createElement("advanced-history-dashboard-yaml");
  (container?.shadowRoot || container || document.body).append(host);
  const root = host.attachShadow({ mode: "open" });
  const choices = deselectedOptions(cards, labels);
  const yamlFor = (value) => yamlLines(fallbackConfig(value)).join("\n");
  root.innerHTML = `
    <style>
      :host { display:contents; color:var(--primary-text-color); }
      dialog { width:min(760px,calc(100vw - 32px)); max-height:90vh; padding:0; border:0; border-radius:12px; color:inherit; background:var(--card-background-color); }
      dialog::backdrop { background:rgba(0,0,0,.56); }
      header, footer { min-height:64px; padding:12px 20px; display:flex; align-items:center; gap:12px; }
      header { border-bottom:1px solid var(--divider-color); }
      footer { justify-content:flex-end; border-top:1px solid var(--divider-color); }
      h2 { margin:0; font-size:20px; font-weight:500; }
      .deselected-choice { margin:16px 16px 0; padding:12px; display:flex; align-items:flex-start; gap:10px; border-radius:8px; background:var(--secondary-background-color); cursor:pointer; }
      .deselected-choice input { width:20px; height:20px; margin:1px 0 0; accent-color:var(--primary-color); }
      .deselected-choice strong, .deselected-choice small { display:block; }
      .deselected-choice small { margin-top:3px; color:var(--secondary-text-color); line-height:1.35; }
      textarea { display:block; width:calc(100% - 32px); min-height:360px; margin:16px; padding:12px; resize:vertical; color:var(--primary-text-color); background:var(--secondary-background-color); border:1px solid var(--divider-color); border-radius:6px; font:13px/1.45 monospace; }
      button { min-height:40px; padding:0 16px; border:0; border-radius:8px; color:var(--primary-color); background:transparent; cursor:pointer; font:inherit; font-weight:500; }
      button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
      .status { margin-right:auto; color:var(--secondary-text-color); }
    </style>
    <dialog aria-label="${escapeHtml(labels.fallbackTitle)}">
      <header><h2>${escapeHtml(labels.fallbackTitle)}</h2></header>
      ${choices ? `<label class="deselected-choice"><input type="checkbox"><span><strong>${escapeHtml(choices.label)}</strong><small>${escapeHtml(choices.note)}</small></span></label>` : ""}
      <textarea readonly></textarea>
      <footer><span class="status"></span><button data-close>${escapeHtml(labels.close)}</button><button class="primary" data-copy>${escapeHtml(labels.copyYaml)}</button></footer>
    </dialog>`;
  const dialog = root.querySelector("dialog");
  const textarea = root.querySelector("textarea");
  let yaml = yamlFor(cards);
  textarea.value = yaml;
  root.querySelector(".deselected-choice input")?.addEventListener("change", (event) => {
    yaml = yamlFor(event.currentTarget.checked ? choices.hiddenOnLoadCards : choices.disabledCards);
    textarea.value = yaml;
  });
  const close = () => {
    dialog.close();
    host.remove();
  };
  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      root.querySelector(".status").textContent = labels.copied;
    } catch (_) {
      textarea.focus();
      textarea.select();
      root.querySelector(".status").textContent = labels.copyFailed;
    }
  });
  dialog.addEventListener("cancel", close);
  dialog.showModal();
}

function nativeHistorySuggestMethod() {
  return customElements.get(BRIDGE_TAG)?.prototype?._suggestCard;
}

function installWideNativePreview() {
  const dialogClass = customElements.get(SUGGEST_DIALOG_TAG);
  const prototype = dialogClass?.prototype;
  if (!prototype || prototype[WIDE_PREVIEW_PATCH]) return;
  const showDialog = prototype.showDialog;
  if (typeof showDialog !== "function") return;
  prototype[WIDE_PREVIEW_PATCH] = true;
  prototype.showDialog = function showAdvancedHistoryDashboardPreview(params) {
    const result = showDialog.call(this, params);
    const choices = params?.[DESELECTED_OPTIONS_MARKER];
    if (!params?.[WIDE_PREVIEW_MARKER] && !choices) return result;
    Promise.resolve(this.updateComplete).then(() => {
      if (!this.shadowRoot) return;
      const dialog = this.shadowRoot.querySelector("ha-dialog");
      if (dialog) dialog.width = "large";
      if (!this.shadowRoot.querySelector("[data-advanced-history-wide-preview]")) {
        const style = document.createElement("style");
        style.dataset.advancedHistoryWidePreview = "";
        style.textContent = `
        .element-preview { width:100%; }
        .element-preview > hui-card,
        .element-preview > hui-section {
          width:100% !important;
          max-width:none !important;
        }
        .advanced-history-deselected-choice {
          width:100%; margin:0 auto 12px; padding:12px; box-sizing:border-box;
          display:flex; align-items:flex-start; gap:10px; border-radius:8px;
          background:var(--secondary-background-color); cursor:pointer;
        }
        .advanced-history-deselected-choice input {
          width:20px; height:20px; margin:1px 0 0; flex:0 0 20px;
          accent-color:var(--primary-color);
        }
        .advanced-history-deselected-choice strong,
        .advanced-history-deselected-choice small { display:block; }
        .advanced-history-deselected-choice small {
          margin-top:3px; color:var(--secondary-text-color); line-height:1.35;
        }
      `;
        this.shadowRoot.append(style);
      }
      this.shadowRoot.querySelector(".advanced-history-deselected-choice")?.remove();
      if (choices) {
        const preview = this.shadowRoot.querySelector(".element-preview");
        if (preview) {
          const choice = document.createElement("label");
          choice.className = "advanced-history-deselected-choice";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = false;
          const content = document.createElement("span");
          const title = document.createElement("strong");
          title.textContent = choices.label;
          const note = document.createElement("small");
          note.textContent = choices.note;
          content.append(title, note);
          choice.append(checkbox, content);
          preview.parentElement?.before(choice);
          checkbox.addEventListener("change", async () => {
            const selectedCards = checkbox.checked
              ? choices.hiddenOnLoadCards
              : choices.disabledCards;
            // SGCC intentionally retains legend visibility for the lifetime
            // of a card. Unmount the native preview first so auto_hide is
            // applied as a fresh load and hidden legend rows render dimmed.
            this._cardConfig = undefined;
            this._sectionConfig = undefined;
            this.requestUpdate?.();
            await this.updateComplete;
            this._cardConfig = clone(selectedCards);
            this._sectionConfig = { type: "grid", cards: clone(selectedCards) };
            if (this._params) {
              this._params.entities = clone(choices.entities);
            }
            this.requestUpdate?.();
            await this.updateComplete;
            this.shadowRoot?.querySelector("ha-yaml-editor")?.setValue?.(
              selectedCards,
            );
          });
        }
      }
    }).catch(() => undefined);
    return result;
  };
}

export async function addCardsToDashboard({ hass, container, cards, labels, ensureNativeHistory }) {
  if (!cards.length) return false;
  try {
    await ensureNativeHistory?.();
    const suggestCard = nativeHistorySuggestMethod();
    if (typeof suggestCard !== "function") throw new Error("Native dashboard flow is unavailable");

    // Home Assistant's History panel owns the public Add-to-dashboard entry
    // point. Invoke that current frontend path with a connected bridge, then
    // replace its proposed history card at the native preview-dialog boundary.
    // Dashboard discovery, view selection, permissions and saving remain
    // entirely owned by Home Assistant.
    const bridge = document.createElement("div");
    bridge.hidden = true;
    bridge.hass = hass;
    bridge._getEntityIds = () => exportEntityIds(cards);
    bridge._mungedStateHistory = {};
    bridge._startDate = new Date(Date.now() - 3_600_000);
    bridge._endDate = new Date();
    const cleanup = () => bridge.remove();
    let fallbackShown = false;
    const fallback = () => {
      if (fallbackShown) return;
      fallbackShown = true;
      cleanup();
      showYamlFallback(container, cards, labels);
    };
    bridge.addEventListener("show-dialog", (event) => {
      const detail = event.detail;
      if (typeof detail?.dialogImport === "function") {
        const nativeImport = detail.dialogImport;
        detail.dialogImport = async () => {
          try {
            const result = await nativeImport();
            installWideNativePreview();
            return result;
          } catch (error) {
            fallback();
            throw error;
          }
        };
      }
      if (detail?.dialogTag === SUGGEST_DIALOG_TAG) {
        const choices = deselectedOptions(cards, labels);
        const initialCards = cards;
        detail.dialogParams.cardConfig = clone(initialCards);
        detail.dialogParams.sectionConfig = { type: "grid", cards: clone(initialCards) };
        detail.dialogParams.entities = bridge._getEntityIds();
        detail.dialogParams[WIDE_PREVIEW_MARKER] = true;
        if (choices) detail.dialogParams[DESELECTED_OPTIONS_MARKER] = choices;
        installWideNativePreview();
        queueMicrotask(cleanup);
      } else if (detail?.dialogTag === "dialog-box") {
        // The native flow uses an alert instead of YAML when all storage
        // dashboards are generated or contain no editable views.
        event.stopPropagation();
        fallback();
      }
    });
    (container?.shadowRoot || container || document.body).append(bridge);
    suggestCard.call(bridge);
    window.setTimeout(() => {
      if (bridge.isConnected) cleanup();
    }, 10 * 60 * 1000);
    return true;
  } catch (error) {
    console.warn("Advanced History: native Add to dashboard flow unavailable", error);
    showYamlFallback(container, cards, labels);
    return false;
  }
}
