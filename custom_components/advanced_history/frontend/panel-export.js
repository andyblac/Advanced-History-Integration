import {
  ADVANCED_HISTORY_CARD_SCHEMA,
  ADVANCED_HISTORY_CARD_TYPE,
  CARD_TAG,
  DASHBOARD_SNAPSHOT_SGCC_KEYS,
  DASHBOARD_SNAPSHOT_SOURCE_KEYS,
  DASHBOARD_STORED_SGCC_OMIT_KEYS,
} from "./constants.js";

const BRIDGE_TAG = "ha-panel-history";
const SUGGEST_DIALOG_TAG = "hui-dialog-suggest-card";
const WIDE_PREVIEW_MARKER = Symbol("advanced-history-wide-dashboard-preview");
const DIALOG_TITLE_MARKER = Symbol("advanced-history-dashboard-dialog-title");
const DESELECTED_OPTIONS_MARKER = Symbol("advanced-history-deselected-export-options");
const EXPORT_WARNING_MARKER = Symbol("advanced-history-dashboard-export-warning");
const CREATE_VIEW_MARKER = Symbol("advanced-history-create-dashboard-view");
const WIDE_PREVIEW_PATCH = "__advancedHistoryWidePreviewPatched";
const SELECT_VIEW_PATCH = "__advancedHistoryCreateViewPatched";
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

function viewPath(title) {
  const slug = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "view";
  return /^\d+$/.test(slug) ? `view-${slug}` : slug;
}

export function dashboardConfigWithNewView(config, title, layout = "sections") {
  const next = clone(config);
  const existingPaths = new Set((next.views || []).map((view) => view?.path).filter(Boolean));
  const basePath = viewPath(title);
  let path = basePath;
  let suffix = 2;
  while (existingPaths.has(path)) path = `${basePath}-${suffix++}`;
  const view = { title: String(title || "").trim(), path };
  if (layout === "sections") view.type = "sections";
  else if (layout !== "masonry") view.type = layout;
  if (layout === "sections") view.sections = [];
  else view.cards = [];
  next.views = [...(next.views || []), view];
  return { config: next, viewIndex: next.views.length - 1 };
}

function compactPanelSettings(config = {}) {
  const keys = [
    "card_module_url",
    "large_range_automatic_detail",
    "large_range_detail_threshold_days",
  ];
  const settings = Object.fromEntries(keys.flatMap((key) => (
    config[key] === undefined ? [] : [[key, clone(config[key])]]
  )));
  if (settings.large_range_automatic_detail !== false) {
    delete settings.large_range_automatic_detail;
  }
  if (
    !Number(settings.large_range_detail_threshold_days)
    || Number(settings.large_range_detail_threshold_days) === 31
  ) {
    delete settings.large_range_detail_threshold_days;
  }
  return settings;
}

function dashboardSnapshot(snapshot) {
  const next = clone(snapshot);
  delete next.schema;
  delete next.name;
  delete next.saved_at;
  delete next.targets;
  delete next.hidden_targets;
  delete next.y2_targets;
  delete next.hidden_y2_targets;
  for (const key of DASHBOARD_SNAPSHOT_SOURCE_KEYS) delete next[key];
  next.chart = clone(next.chart || {});
  delete next.chart.defaults_mode;
  for (const key of DASHBOARD_SNAPSHOT_SGCC_KEYS) delete next.chart[key];
  return next;
}

function typedCardOptions(value, variant) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value.numeric || value.state ? value[variant] || {} : value;
}

function dashboardGraphConfig(config, panelConfig = {}) {
  const variant = config.chart_mode === "state_timeline" ? "state" : "numeric";
  const defaults = clone(typedCardOptions(panelConfig.card_options, variant));
  const templates = ["entities", "numeric_entities", "state_entities"]
    .flatMap((key) => {
      const value = defaults[key];
      delete defaults[key];
      return Array.isArray(value) ? value : value ? [value] : [];
    })
    .filter((value) => (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && value.entity == null
      && value.statistic_id == null
    ));
  const next = { ...defaults, ...clone(config) };
  if (Array.isArray(next.entities)) {
    const configuredEntities = panelConfig.entity_options || {};
    next.entities = next.entities.map((raw) => {
      const row = typeof raw === "string" ? { entity: raw } : clone(raw);
      const entity = row?.entity || row?.statistic_id;
      if (!entity) return raw;
      const key = row.attribute ? `${entity}::${row.attribute}` : entity;
      return Object.assign(
        {},
        ...templates.map(clone),
        clone(configuredEntities[entity] || {}),
        clone(configuredEntities[key] || {}),
        row,
      );
    });
  }
  for (const key of DASHBOARD_STORED_SGCC_OMIT_KEYS) delete next[key];
  if (next.card_background_color === "transparent") delete next.card_background_color;
  return next;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function dashboardDatePickerGroup(panelName = "") {
  const configuredName = String(panelName || "").trim();
  return configuredName || `advanced-history-${uuid()}`;
}

export function advancedHistoryDashboardCard(
  snapshot,
  panelConfig = {},
  title = "",
  entities = [],
  graphConfigs = [],
  panelName = "",
) {
  if (!snapshot?.targets || !snapshot?.chart) return null;
  const datePickerGroup = dashboardDatePickerGroup(panelName);
  const settings = compactPanelSettings(panelConfig);
  const normalizedTitle = String(title || "").trim();
  const sgccConfigs = graphConfigs
    .filter((config) => config && typeof config === "object" && !Array.isArray(config))
    .map((config) => dashboardGraphConfig(config, panelConfig));
  const config = {
    type: ADVANCED_HISTORY_CARD_TYPE,
    schema: ADVANCED_HISTORY_CARD_SCHEMA,
    show_date_picker: true,
    date_picker_group: datePickerGroup,
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    sgcc_configs: sgccConfigs,
    snapshot: dashboardSnapshot(snapshot),
    ...(Object.keys(settings).length ? { settings } : {}),
  };
  return config;
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
    const exportAggregates = card?.__advancedHistoryRunningTotalExportAggregates || {};
    for (const row of config.entities || []) {
      if (!row || typeof row !== "object" || row.attribute != null) continue;
      const original = exportAggregates[entityId(row)];
      if (!original) continue;
      if (original.defined) row.aggregate_func = clone(original.value);
      else delete row.aggregate_func;
    }
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

function exportedSgccConfigs(card) {
  return card?.type === ADVANCED_HISTORY_CARD_TYPE
    ? card.sgcc_configs || []
    : [card];
}

function exportedEntityRows(cards) {
  return cards.flatMap((card) => (
    exportedSgccConfigs(card).flatMap((config) => config?.entities || [])
  ));
}

function deselectedEntityIds(cards) {
  return [...new Set(exportedEntityRows(cards)
    .filter((row) => row && typeof row === "object" && row.enabled === false)
    .map(entityId)
    .filter(Boolean))];
}

export function dashboardCardsWithHiddenEntitiesOnLoad(cards) {
  return cards.map((card) => {
    const next = clone(card);
    for (const config of exportedSgccConfigs(next)) {
      config.entities = (config.entities || []).map((row) => {
        if (!row || typeof row !== "object" || row.enabled !== false) return clone(row);
        return { ...clone(row), enabled: true, auto_hide: true };
      });
    }
    return next;
  });
}

export function dashboardCardEntityIds(cards) {
  return [...new Set(exportedEntityRows(cards).map(entityId).filter(Boolean))];
}

function deselectedOptions(cards, labels) {
  const deselected = deselectedEntityIds(cards);
  if (!deselected.length) return null;
  return {
    hiddenOnLoadCards: dashboardCardsWithHiddenEntitiesOnLoad(cards),
    disabledCards: clone(cards),
    entities: dashboardCardEntityIds(cards),
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
      .export-warning { margin:16px 16px 0; padding:12px; display:flex; align-items:flex-start; gap:10px; border-left:4px solid var(--warning-color,#ffa600); border-radius:6px; background:var(--secondary-background-color); line-height:1.4; }
      .export-warning ha-icon { flex:0 0 20px; width:20px; height:20px; color:var(--warning-color,#ffa600); --mdc-icon-size:20px; }
      textarea { display:block; width:calc(100% - 32px); min-height:360px; margin:16px; padding:12px; resize:vertical; color:var(--primary-text-color); background:var(--secondary-background-color); border:1px solid var(--divider-color); border-radius:6px; font:13px/1.45 monospace; }
      button { min-height:40px; padding:0 16px; border:0; border-radius:8px; color:var(--primary-color); background:transparent; cursor:pointer; font:inherit; font-weight:500; }
      button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
      .status { margin-right:auto; color:var(--secondary-text-color); }
    </style>
    <dialog aria-label="${escapeHtml(labels.fallbackTitle)}">
      <header><h2>${escapeHtml(labels.fallbackTitle)}</h2></header>
      ${labels.exportWarning ? `<div class="export-warning" role="note"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${escapeHtml(labels.exportWarning)}</span></div>` : ""}
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
  const updated = prototype.updated;
  prototype[WIDE_PREVIEW_PATCH] = true;
  prototype.updated = function updateAdvancedHistoryDashboardPreview(changedProperties) {
    updated?.call(this, changedProperties);
    const title = this._params?.[DIALOG_TITLE_MARKER];
    const dialog = title && this.shadowRoot?.querySelector("ha-dialog");
    if (dialog) dialog.headerTitle = title;
  };
  prototype.showDialog = function showAdvancedHistoryDashboardPreview(params) {
    const result = showDialog.call(this, params);
    const choices = params?.[DESELECTED_OPTIONS_MARKER];
    const exportWarning = params?.[EXPORT_WARNING_MARKER];
    if (!params?.[WIDE_PREVIEW_MARKER] && !choices && !exportWarning) return result;
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
        .advanced-history-export-warning {
          width:100%; margin:0 auto 12px; padding:12px; box-sizing:border-box;
          display:flex; align-items:flex-start; gap:10px; line-height:1.4;
          border-left:4px solid var(--warning-color,#ffa600); border-radius:6px;
          background:var(--secondary-background-color);
        }
        .advanced-history-export-warning ha-icon {
          flex:0 0 20px; width:20px; height:20px;
          color:var(--warning-color,#ffa600); --mdc-icon-size:20px;
        }
      `;
        this.shadowRoot.append(style);
      }
      this.shadowRoot.querySelector(".advanced-history-export-warning")?.remove();
      this.shadowRoot.querySelector(".advanced-history-deselected-choice")?.remove();
      const preview = this.shadowRoot.querySelector(".element-preview");
      if (exportWarning && preview) {
        const warning = document.createElement("div");
        warning.className = "advanced-history-export-warning";
        warning.setAttribute("role", "note");
        const icon = document.createElement("ha-icon");
        icon.setAttribute("icon", "mdi:alert-outline");
        const message = document.createElement("span");
        message.textContent = exportWarning;
        warning.append(icon, message);
        preview.parentElement?.before(warning);
      }
      if (choices) {
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

function showCreateDashboardView(dialog, hass) {
  const params = dialog?._params;
  const createView = params?.[CREATE_VIEW_MARKER];
  const config = dialog?._config;
  if (typeof createView !== "function" || !config) return;

  const host = document.createElement("advanced-history-create-dashboard-view");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const addView = hass.localize("ui.panel.lovelace.editor.edit_view.add") || "Add view";
  const titleLabel = hass.localize("ui.panel.lovelace.editor.card.generic.title") || "Title";
  const layoutLabel = hass.localize("ui.panel.lovelace.editor.edit_view.type") || "Layout";
  const sectionsLabel = hass.localize("ui.panel.lovelace.editor.edit_view.types.sections") || "Sections (default)";
  const masonryLabel = hass.localize("ui.panel.lovelace.editor.edit_view.types.masonry") || "Masonry";
  const cancel = hass.localize("ui.common.cancel") || "Cancel";
  const create = hass.localize("ui.common.create") || "Create";
  root.innerHTML = `
    <style>
      :host { color:var(--primary-text-color); }
      dialog { width:min(460px,calc(100vw - 32px)); padding:0; border:0; border-radius:12px; color:inherit; background:var(--card-background-color); }
      dialog::backdrop { background:rgba(0,0,0,.56); }
      header, footer { min-height:64px; padding:12px 20px; box-sizing:border-box; display:flex; align-items:center; gap:12px; }
      header { border-bottom:1px solid var(--divider-color); }
      footer { justify-content:flex-end; border-top:1px solid var(--divider-color); }
      h2 { margin:0; font-size:20px; font-weight:500; }
      main { padding:20px; display:grid; gap:18px; }
      label, label span { display:block; }
      label span { margin-bottom:7px; color:var(--secondary-text-color); font-size:13px; }
      input, select { width:100%; min-height:48px; padding:0 12px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:6px; color:var(--primary-text-color); background:var(--secondary-background-color); font:inherit; }
      input:focus, select:focus { border-color:var(--primary-color); outline:1px solid var(--primary-color); }
      button { min-height:40px; padding:0 16px; border:0; border-radius:8px; color:var(--primary-color); background:transparent; cursor:pointer; font:inherit; font-weight:500; }
      button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
      button.primary:disabled { opacity:.45; cursor:default; }
    </style>
    <dialog aria-label="${escapeHtml(addView)}">
      <header><h2>${escapeHtml(addView)}</h2></header>
      <main>
        <label><span>${escapeHtml(titleLabel)}</span><input name="title" autocomplete="off" autofocus></label>
        <label><span>${escapeHtml(layoutLabel)}</span><select name="layout"><option value="sections">${escapeHtml(sectionsLabel)}</option><option value="masonry">${escapeHtml(masonryLabel)}</option></select></label>
      </main>
      <footer><button data-cancel>${escapeHtml(cancel)}</button><button class="primary" data-create disabled>${escapeHtml(create)}</button></footer>
    </dialog>`;
  const createDialog = root.querySelector("dialog");
  const input = root.querySelector("input[name=title]");
  const createButton = root.querySelector("[data-create]");
  const close = () => {
    createDialog.close();
    host.remove();
  };
  input.addEventListener("input", () => {
    createButton.disabled = !input.value.trim();
  });
  root.querySelector("[data-cancel]").addEventListener("click", close);
  createButton.addEventListener("click", () => {
    const result = dashboardConfigWithNewView(
      config,
      input.value,
      root.querySelector("select[name=layout]").value,
    );
    createView(dialog._urlPath ?? null, result.config, result.viewIndex);
    dialog.closeDialog?.();
    close();
  });
  createDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  createDialog.showModal();
  input.focus();
}

function installNativeCreateView() {
  const dialogClass = customElements.get("hui-dialog-select-view");
  const prototype = dialogClass?.prototype;
  if (!prototype || prototype[SELECT_VIEW_PATCH]) return;
  const updated = prototype.updated;
  prototype[SELECT_VIEW_PATCH] = true;
  prototype.updated = function updateAdvancedHistoryViewChooser(changedProperties) {
    updated?.call(this, changedProperties);
    Promise.resolve(this.updateComplete).then(() => {
      if (!this._params?.[CREATE_VIEW_MARKER] || !this.shadowRoot) return;
      const footer = this.shadowRoot.querySelector("ha-dialog-footer");
      if (!footer || footer.querySelector("[data-advanced-history-create-view]")) return;
      const button = document.createElement("ha-button");
      button.dataset.advancedHistoryCreateView = "";
      button.slot = "secondaryAction";
      button.appearance = "plain";
      button.textContent = this.hass.localize("ui.panel.lovelace.editor.edit_view.add") || "Add view";
      button.addEventListener("click", () => showCreateDashboardView(this, this.hass));
      footer.prepend(button);
    }).catch(() => undefined);
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
    bridge._getEntityIds = () => dashboardCardEntityIds(cards);
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
            installNativeCreateView();
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
        detail.dialogParams[DIALOG_TITLE_MARKER] = labels.dialogTitle;
        if (choices) detail.dialogParams[DESELECTED_OPTIONS_MARKER] = choices;
        if (labels.exportWarning) {
          detail.dialogParams[EXPORT_WARNING_MARKER] = labels.exportWarning;
        }
        installWideNativePreview();
        queueMicrotask(cleanup);
      } else if (detail?.dialogTag === "hui-dialog-select-view") {
        detail.dialogParams[CREATE_VIEW_MARKER] = (urlPath, config, viewIndex) => {
          detail.dialogParams.viewSelectedCallback(urlPath, config, viewIndex);
        };
        installNativeCreateView();
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
