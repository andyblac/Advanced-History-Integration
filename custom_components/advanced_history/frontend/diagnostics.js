import { CARD_TAG } from "./constants.js";
import { automaticEntityOptions } from "./entity-defaults.js";

const REDACTED_OPTION_KEYS = /^(?:annotations|state_map)$|(?:^|_)(?:area|device|user|entry)_id$|(?:friendly_)?name$|(?:card_)?header$|title$|label$|text$|url$/i;

export class DiagnosticsMethods {
  _collectDiagnosticEntityIds(value, ids) {
    if (typeof value === "string") {
      if (/^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(value)) ids.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this._collectDiagnosticEntityIds(item, ids));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (/^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(key)) ids.add(key);
      this._collectDiagnosticEntityIds(item, ids);
    }
  }

  _diagnosticEntityAliases(...configs) {
    const entityIds = new Set(this._resolvedEntityIds());
    configs.forEach((config) => this._collectDiagnosticEntityIds(config, entityIds));
    return new Map([...entityIds].map((entityId, index) => [entityId, `entity_${index + 1}`]));
  }

  _sanitizeDiagnosticValue(value, aliases, key = "") {
    if (REDACTED_OPTION_KEYS.test(key)) return undefined;
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") {
      let sanitized = value;
      for (const [entityId, alias] of aliases) sanitized = sanitized.replaceAll(entityId, alias);
      return sanitized;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => this._sanitizeDiagnosticValue(item, aliases))
        .filter((item) => item !== undefined);
    }
    if (typeof value !== "object") return String(value);

    const sanitized = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const safeKey = aliases.get(rawKey) || rawKey;
      const safeValue = this._sanitizeDiagnosticValue(rawValue, aliases, rawKey);
      if (safeValue !== undefined) sanitized[safeKey] = safeValue;
    }
    return sanitized;
  }

  _statisticsCardVersion() {
    const cardClass = customElements.get(CARD_TAG);
    const registration = (window.customCards || []).find((item) => {
      const type = String(item?.type || "").replace(/^custom:/, "");
      return type === CARD_TAG;
    });
    return registration?.version || cardClass?.version || cardClass?.VERSION || "unknown";
  }

  _buildDiagnosticsReport() {
    const resolvedEntities = new Set(this._resolvedEntityIds());
    const explicitEntities = new Set(this._targets.entity_id);
    const snapshot = this._captureSnapshot();
    const rawCardOptions = snapshot.chart?.card_options || this._effectiveCardOptionsConfig();
    const allEntityOptions = snapshot.chart?.entity_options || this._effectiveEntityOptionsConfig();
    const currentEntityOptions = Object.fromEntries(
      [...resolvedEntities]
        .filter((entityId) => allEntityOptions?.[entityId] !== undefined)
        .map((entityId) => [entityId, allEntityOptions[entityId]])
    );
    const aliases = this._diagnosticEntityAliases(rawCardOptions, currentEntityOptions);
    const cardOptions = this._sanitizeDiagnosticValue(
      rawCardOptions, aliases
    );
    const entityOptions = this._sanitizeDiagnosticValue(
      currentEntityOptions, aliases
    );
    const entities = [...resolvedEntities].map((entityId) => {
      const alias = aliases.get(entityId);
      const state = this._hass?.states?.[entityId];
      const attributes = state?.attributes || {};
      return {
        alias,
        domain: entityId.split(".", 1)[0],
        available: Boolean(state),
        selected_explicitly: explicitEntities.has(entityId),
        included_in_chart: resolvedEntities.has(entityId),
        numeric: this._isNumeric(entityId),
        device_class: attributes.device_class || null,
        state_class: attributes.state_class || null,
        unit_of_measurement: attributes.unit_of_measurement || null,
        automatic_options: automaticEntityOptions(
          state,
          this._isNumeric(entityId) ? "timeline" : "state_timeline"
        ),
      };
    });
    const viewport = window.visualViewport;

    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      software: {
        advanced_history: this.config.integration_version || "unknown",
        home_assistant: this._hass?.config?.version || "unknown",
        statistics_graph_chart_card: {
          loaded: Boolean(customElements.get(CARD_TAG)),
          version: this._statisticsCardVersion(),
        },
      },
      environment: {
        language: this._hass?.locale?.language || this._hass?.language || navigator.language,
        time_zone_preference: this._hass?.locale?.time_zone || null,
        resolved_time_zone: this._resolvedTimeZone(),
        browser_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        user_agent: navigator.userAgent,
        viewport: {
          width: Math.round(viewport?.width || window.innerWidth || 0),
          height: Math.round(viewport?.height || window.innerHeight || 0),
          device_pixel_ratio: window.devicePixelRatio || 1,
        },
      },
      selection: {
        targets: {
          areas: this._targets.area_id.length,
          devices: this._targets.device_id.length,
          explicit_entities: this._targets.entity_id.length,
          resolved_entities: resolvedEntities.size,
        },
        hidden_targets: {
          areas: this._hiddenTargets.area_id.length,
          devices: this._hiddenTargets.device_id.length,
          entities: this._hiddenTargets.entity_id.length,
        },
        period: snapshot.period ? {
          start: snapshot.period.start || null,
          end: snapshot.period.end || null,
          compare: snapshot.period.compare || null,
        } : null,
      },
      chart: {
        default_hours: snapshot.chart?.default_hours ?? this._effectiveDefaultHours(),
        graph_height: snapshot.chart?.graph_height ?? this._effectiveGraphHeight(),
        compare: this._sanitizeDiagnosticValue(snapshot.chart?.compare ?? this._effectiveCompare(), aliases),
        large_range_detail: (() => {
          const profile = this._largeRangeDetailProfile();
          return {
            enabled: this.config.large_range_automatic_detail !== false,
            threshold_days: Math.max(7, Number(this.config.large_range_detail_threshold_days) || 31),
            mode: !profile ? null : profile.automatic ? "automatic" : "fine",
            fine_detail: Boolean(profile && !profile.automatic),
            group_by: profile ? (profile.automatic ? "auto" : profile.groupBy) : null,
          };
        })(),
        data_sources: (this._graphCards || []).map((card) => ({
          chart_mode: card.__advancedHistoryChartMode || null,
          source: card.__advancedHistorySourceTracker?.source || "pending",
        })),
        card_options: cardOptions,
        entity_options: entityOptions,
      },
      entities,
      privacy: {
        history_values_included: false,
        entity_ids_replaced_with_aliases: true,
        names_and_registry_ids_included: false,
        bookmarks_included: false,
      },
    };
  }

  _copyDiagnostics(text, button) {
    const copied = this._customLocalize("diagnostics_copied");
    const failed = this._customLocalize("diagnostics_copy_error");
    const original = button.textContent;
    const update = (label) => {
      button.textContent = label;
      window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1800);
    };
    const fallback = () => {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const success = document.execCommand("copy");
      input.remove();
      update(success ? copied : failed);
    };
    if (!navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(text).then(() => update(copied)).catch(fallback);
  }

  _openDiagnostics() {
    const existing = this.shadowRoot.querySelector(".diagnostics-backdrop");
    if (existing) return;
    const title = this._customLocalize("diagnostics");
    const note = this._customLocalize("diagnostics_note");
    const copy = this._customLocalize("copy_diagnostics");
    const close = this._localize("ui.common.close", "Close");
    const report = JSON.stringify(this._buildDiagnosticsReport(), null, 2);
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop diagnostics-backdrop";
    backdrop.innerHTML = `<section class="dialog diagnostics-dialog" role="dialog" aria-modal="true" aria-label="${this._escape(title)}">
      <header class="dialog-title"><h2>${this._escape(title)}</h2></header>
      <div class="diagnostics-note">${this._escape(note)}</div>
      <pre class="diagnostics-preview" tabindex="0">${this._escape(report)}</pre>
      <footer class="dialog-actions"><button data-action="close">${this._escape(close)}</button><button class="primary" data-action="copy">${this._escape(copy)}</button></footer>
    </section>`;
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('[data-action="close"]').addEventListener("click", () => backdrop.remove());
    backdrop.querySelector('[data-action="copy"]').addEventListener("click", (event) => {
      this._copyDiagnostics(report, event.currentTarget);
    });
    this.shadowRoot.append(backdrop);
  }
}
