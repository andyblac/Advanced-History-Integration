import { CARD_TAG } from "./constants.js";

const DIALOG_TAG = "advanced-history-card-editor-dialog";
const VISUAL_EDITOR_STYLE_KEY = "__advancedHistoryVisualEditorStyleSheet";
let activeDialogHost = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export async function openCardEditorDialog({
  hass,
  container,
  initialConfig,
  title,
  note = "",
  labels,
  ensureLoaded,
  onSave,
  onReset,
  resetDisabled = false,
  leadingAction,
  allowCode = true,
  visualEditorStyles = "",
  editorVariants = null,
  initialVariantKey = null,
  shouldSyncVariantKey = null,
}) {
  if (activeDialogHost?.isConnected) return null;
  const dialogHost = document.createElement(DIALOG_TAG);
  activeDialogHost = dialogHost;
  (container?.shadowRoot || container || document.body).append(dialogHost);
  const root = dialogHost.attachShadow({ mode: "open" });
  const strings = {
    loading: "Loading",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    reset: "Reset",
    confirmResetTitle: "Reset graph settings?",
    confirmReset: "This removes the saved settings and restores the defaults.",
    showCode: "Show code editor",
    showVisual: "Show visual editor",
    mappingError: "Card configuration must be a YAML mapping.",
    loadError: "Graph editor could not be loaded.",
    saveError: "Graph settings could not be saved.",
    ...labels,
  };
  const toggleMarkup = allowCode
    ? `<button type="button" class="mode-toggle" data-action="toggle-editor" aria-label="${escapeHtml(strings.showCode)}" title="${escapeHtml(strings.showCode)}"><ha-icon icon="mdi:code-tags"></ha-icon><span>${escapeHtml(strings.showCode)}</span></button>`
    : "";
  const resetMarkup = onReset
    ? `<button data-action="reset">${escapeHtml(strings.reset)}</button>`
    : "";
  const headerActionMarkup = leadingAction
    ? `<button class="header-action" data-action="leading">${escapeHtml(leadingAction.label)}</button>`
    : "";
  const variants = Array.isArray(editorVariants)
    ? editorVariants.filter((variant) => variant?.key && variant?.initialConfig)
    : [];
  const variantMarkup = variants.length > 1
    ? `<nav class="editor-variants" aria-label="${escapeHtml(title)}">${variants.map((variant, index) => `
        <button type="button" class="editor-variant${index === 0 ? " active" : ""}" data-editor-variant="${escapeHtml(variant.key)}">${escapeHtml(variant.label)}</button>
      `).join("")}</nav>`
    : "";
  root.innerHTML = `
    <style>
      :host { display:contents; color:var(--primary-text-color); }
      * { box-sizing:border-box; }
      dialog { width:min(1040px,calc(100vw - 40px)); height:min(820px,92vh); max-width:none; max-height:none; margin:auto; padding:0; overflow:hidden; border:0; border-radius:12px; color:var(--primary-text-color); background:var(--card-background-color); box-shadow:0 12px 36px rgba(0,0,0,.4); }
      dialog::backdrop { background:rgba(0,0,0,.56); }
      dialog.confirm { width:min(440px,calc(100vw - 40px)); height:fit-content !important; min-height:0; max-height:calc(100vh - 32px); }
      dialog.confirm section { height:auto; min-height:0; flex:none; }
      dialog.confirm .confirm-content { padding:24px; color:var(--primary-text-color); line-height:1.5; }
      section { width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; }
      header { min-height:64px; padding:0 24px 0 12px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--divider-color); }
      h2 { margin:0; font-size:20px; font-weight:500; }
      .editor-variants { display:flex; align-self:stretch; align-items:flex-end; gap:4px; margin-left:8px; }
      .editor-variant { min-width:0; height:48px; padding:0 14px; border-radius:0; border-bottom:3px solid transparent; color:var(--secondary-text-color); }
      .editor-variant.active { color:var(--primary-color); border-bottom-color:var(--primary-color); }
      .header-action { margin-left:auto; }
      .mode-toggle { min-width:40px; border-radius:20px; display:flex; align-items:center; gap:8px; }
      .mode-toggle ha-icon { width:20px; height:20px; }
      .dialog-close { min-width:40px; width:40px; height:40px; padding:8px; display:grid; place-items:center; border-radius:50%; color:var(--primary-text-color); }
      .dialog-close:hover { color:var(--primary-text-color); background:var(--secondary-background-color); }
      .dialog-close ha-icon { width:22px; height:22px; }
      .note { margin:14px 18px 8px; padding:10px 12px; border-radius:8px; color:var(--secondary-text-color); background:var(--secondary-background-color); line-height:1.4; }
      .note:empty { display:none; }
      .host { flex:1; min-height:0; overflow:auto; padding:8px 18px 18px; }
      .host > * { display:block; width:100%; }
      .host ha-yaml-editor { min-height:480px; }
      .loading, .error { padding:32px 16px; color:var(--secondary-text-color); text-align:center; }
      .error, .status { color:var(--error-color); }
      footer { min-height:64px; padding:10px 18px; display:flex; align-items:center; justify-content:flex-end; gap:8px; border-top:1px solid var(--divider-color); }
      .status { margin-right:auto; font-size:13px; }
      button { min-width:84px; height:40px; padding:0 14px; border:0; border-radius:8px; cursor:pointer; color:var(--primary-color); background:transparent; font:inherit; font-weight:500; }
      button.primary { color:var(--text-primary-color,white); background:var(--primary-color); }
      button:disabled { opacity:.5; cursor:default; }
      @media (max-width:600px) {
        dialog { width:100vw; height:100vh; border-radius:0; }
        dialog.confirm { width:min(440px,calc(100vw - 32px)); height:fit-content !important; min-height:0; max-height:calc(100vh - 32px); border-radius:12px; }
        header { padding:0 14px 0 12px; }
        .mode-toggle { padding:0 10px; }
        .mode-toggle span { display:none; }
      }
    </style>
    <dialog aria-label="${escapeHtml(title)}">
      <section>
        <header><button class="dialog-close" data-action="close-editor" title="${escapeHtml(strings.close)}" aria-label="${escapeHtml(strings.close)}"><ha-icon icon="mdi:close"></ha-icon></button><h2>${escapeHtml(title)}</h2>${variantMarkup}${headerActionMarkup}</header>
        <div class="note">${escapeHtml(note)}</div>
        <div class="host"><div class="loading">${escapeHtml(strings.loading)}…</div></div>
        <footer>${toggleMarkup}${resetMarkup}<span class="status"></span><button data-action="cancel">${escapeHtml(strings.cancel)}</button><button class="primary" data-action="save">${escapeHtml(strings.save)}</button></footer>
      </section>
    </dialog>
    <dialog class="confirm" aria-label="${escapeHtml(strings.confirmResetTitle)}">
      <section>
        <header><button class="dialog-close" data-action="close-reset" title="${escapeHtml(strings.close)}" aria-label="${escapeHtml(strings.close)}"><ha-icon icon="mdi:close"></ha-icon></button><h2>${escapeHtml(strings.confirmResetTitle)}</h2></header>
        <div class="confirm-content">${escapeHtml(strings.confirmReset)}</div>
        <footer><ha-button appearance="plain" data-action="cancel-reset">${escapeHtml(strings.cancel)}</ha-button><ha-button variant="danger" data-action="confirm-reset">${escapeHtml(strings.reset)}</ha-button></footer>
      </section>
    </dialog>`;

  const modal = root.querySelector("dialog");
  const confirmModal = root.querySelector("dialog.confirm");
  const editorHost = root.querySelector(".host");
  const status = root.querySelector(".status");
  const save = root.querySelector('[data-action="save"]');
  const reset = root.querySelector('[data-action="reset"]');
  const toggle = root.querySelector('[data-action="toggle-editor"]');
  let activeVariantKey = variants.some((variant) => variant.key === initialVariantKey)
    ? initialVariantKey
    : variants[0]?.key || null;
  const variantDrafts = new Map(variants.map((variant) => [
    variant.key,
    structuredClone(variant.initialConfig),
  ]));
  const variantDirtyKeys = new Map(variants.map((variant) => [variant.key, new Set()]));
  let draft = activeVariantKey
    ? structuredClone(variantDrafts.get(activeVariantKey))
    : structuredClone(initialConfig || {});
  let mode = "visual";
  let renderToken = 0;

  const close = () => {
    if (modal.open) modal.close();
    dialogHost.remove();
    if (activeDialogHost === dialogHost) activeDialogHost = null;
  };
  const showError = (error, fallback = strings.loadError) => {
    console.error("Advanced History: card editor failed", error);
    status.textContent = error?.message || fallback;
  };
  const updateToggle = () => {
    if (!toggle) return;
    const code = mode === "code";
    const label = code ? strings.showVisual : strings.showCode;
    toggle.querySelector("ha-icon").icon = code ? "mdi:tune" : "mdi:code-tags";
    toggle.querySelector("span").textContent = label;
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  };

  const activeVariant = () => variants.find((variant) => variant.key === activeVariantKey);
  const currentVisualEditorStyles = () => activeVariant()?.visualEditorStyles
    ?? visualEditorStyles;
  const updateVariantTabs = () => {
    for (const button of root.querySelectorAll("[data-editor-variant]")) {
      button.classList.toggle("active", button.dataset.editorVariant === activeVariantKey);
    }
  };
  const updateDraft = (nextDraft, trackChanges = true) => {
    const next = structuredClone(nextDraft || {});
    const changedKeys = [];
    if (activeVariantKey && trackChanges) {
      const dirty = variantDirtyKeys.get(activeVariantKey);
      const keys = new Set([...Object.keys(draft || {}), ...Object.keys(next)]);
      for (const key of keys) {
        if (JSON.stringify(draft?.[key]) !== JSON.stringify(next[key])) {
          dirty.add(key);
          changedKeys.push(key);
        }
      }
    }
    draft = next;
    if (activeVariantKey) {
      variantDrafts.set(activeVariantKey, structuredClone(next));
      if (trackChanges && changedKeys.length && typeof shouldSyncVariantKey === "function") {
        for (const [variantKey, variantDraft] of variantDrafts) {
          if (variantKey === activeVariantKey) continue;
          const synced = structuredClone(variantDraft);
          for (const key of changedKeys) {
            if (!shouldSyncVariantKey(key, activeVariantKey, variantKey)) continue;
            if (Object.prototype.hasOwnProperty.call(next, key)) {
              synced[key] = structuredClone(next[key]);
            } else {
              delete synced[key];
            }
          }
          variantDrafts.set(variantKey, synced);
        }
      }
    }
  };

  const applyVisualEditorStyles = (editor) => {
    const styles = currentVisualEditorStyles();
    if (!styles || !editor.shadowRoot) return;
    const root = editor.shadowRoot;
    if (editor[VISUAL_EDITOR_STYLE_KEY]) return;
    if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in root) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(styles);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      editor[VISUAL_EDITOR_STYLE_KEY] = sheet;
      return;
    }
    const style = document.createElement("style");
    style.textContent = styles;
    root.append(style);
    editor[VISUAL_EDITOR_STYLE_KEY] = style;
  };

  const renderVisual = async () => {
    const token = ++renderToken;
    mode = "visual";
    status.textContent = "";
    save.disabled = false;
    if (toggle) toggle.disabled = false;
    updateToggle();
    editorHost.innerHTML = `<div class="loading">${escapeHtml(strings.loading)}…</div>`;
    try {
      await ensureLoaded?.();
      const cardClass = customElements.get(CARD_TAG);
      let editor = typeof cardClass?.getConfigElement === "function"
        ? await cardClass.getConfigElement()
        : null;
      if (!editor) {
        await customElements.whenDefined("statistics-graph-chart-card-editor");
        editor = document.createElement("statistics-graph-chart-card-editor");
      }
      if (token !== renderToken || !dialogHost.isConnected) return;
      let configSyncQueued = false;
      let syncingConfig = false;
      editor.addEventListener("config-changed", (event) => {
        if (syncingConfig || !event.detail?.config) return;
        updateDraft(event.detail.config);
        if (configSyncQueued) return;
        configSyncQueued = true;
        queueMicrotask(() => {
          configSyncQueued = false;
          if (token !== renderToken || !editor.isConnected || mode !== "visual") return;
          // The normal Lovelace card dialog feeds emitted configuration back
          // into the editor. Some dependent controls (for example State Row)
          // do not refresh until setConfig receives that updated configuration.
          syncingConfig = true;
          try {
            editor.setConfig(draft);
            editor.requestUpdate?.();
          } finally {
            syncingConfig = false;
          }
          applyVisualEditorStyles(editor);
        });
      });
      editor.hass = hass;
      editor.setConfig(draft);
      editorHost.replaceChildren(editor);
      applyVisualEditorStyles(editor);
      Promise.resolve(editor.updateComplete)
        .then(() => {
          if (token === renderToken && editor.isConnected) applyVisualEditorStyles(editor);
        })
        .catch(() => undefined);
    } catch (error) {
      if (token !== renderToken) return;
      editorHost.innerHTML = `<div class="error">${escapeHtml(error?.message || strings.loadError)}</div>`;
      save.disabled = true;
      showError(error);
    }
  };

  const renderCode = async () => {
    ++renderToken;
    mode = "code";
    status.textContent = "";
    save.disabled = false;
    toggle.disabled = false;
    updateToggle();
    editorHost.innerHTML = `<div class="loading">${escapeHtml(strings.loading)}…</div>`;
    try {
      if (!customElements.get("ha-yaml-editor")) {
        await Promise.race([
          customElements.whenDefined("ha-yaml-editor"),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error(strings.loadError)), 3000)),
        ]);
      }
      if (!dialogHost.isConnected || mode !== "code") return;
      const editor = document.createElement("ha-yaml-editor");
      editor.hass = hass;
      editor.inDialog = true;
      editor.setValue(draft);
      editor.addEventListener("value-changed", (event) => {
        const value = event.detail?.value;
        const valid = event.detail?.isValid !== false
          && Boolean(value)
          && typeof value === "object"
          && !Array.isArray(value);
        status.textContent = valid ? "" : event.detail?.errorMsg || strings.mappingError;
        save.disabled = !valid;
        toggle.disabled = !valid;
        if (valid) updateDraft(value);
      });
      editor.addEventListener("editor-save", () => { if (!save.disabled) save.click(); });
      editorHost.replaceChildren(editor);
    } catch (error) {
      editorHost.innerHTML = `<div class="error">${escapeHtml(error?.message || strings.loadError)}</div>`;
      save.disabled = true;
      showError(error);
    }
  };

  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  root.querySelector('[data-action="cancel"]').addEventListener("click", close);
  root.querySelector('[data-action="close-editor"]').addEventListener("click", close);
  toggle?.addEventListener("click", () => {
    if (mode === "visual") renderCode();
    else renderVisual();
  });
  for (const button of root.querySelectorAll("[data-editor-variant]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.editorVariant;
      if (!key || key === activeVariantKey || !variantDrafts.has(key)) return;
      activeVariantKey = key;
      draft = structuredClone(variantDrafts.get(key));
      updateVariantTabs();
      if (mode === "code") renderCode();
      else renderVisual();
    });
  }
  if (reset) {
    reset.disabled = resetDisabled;
    reset.addEventListener("click", () => confirmModal.showModal());
    const cancelReset = () => confirmModal.close();
    confirmModal.addEventListener("cancel", (event) => {
      event.preventDefault();
      cancelReset();
    });
    confirmModal.addEventListener("click", (event) => {
      if (event.target === confirmModal) cancelReset();
    });
    root.querySelector('[data-action="cancel-reset"]').addEventListener("click", cancelReset);
    root.querySelector('[data-action="close-reset"]').addEventListener("click", cancelReset);
    root.querySelector('[data-action="confirm-reset"]').addEventListener("click", async () => {
      confirmModal.close();
      reset.disabled = true;
      save.disabled = true;
      status.textContent = "";
      try {
        await onReset();
        close();
      } catch (error) {
        showError(error, strings.saveError);
        reset.disabled = false;
        save.disabled = false;
      }
    });
  }
  root.querySelector('[data-action="leading"]')?.addEventListener("click", () => {
    close();
    leadingAction.onClick();
  });
  save.addEventListener("click", async () => {
    save.disabled = true;
    if (reset) reset.disabled = true;
    status.textContent = "";
    try {
      const variantState = variants.length
        ? {
          drafts: Object.fromEntries([...variantDrafts].map(([key, value]) => [
            key,
            structuredClone(value),
          ])),
          dirtyKeys: Object.fromEntries([...variantDirtyKeys].map(([key, value]) => [
            key,
            [...value],
          ])),
        }
        : null;
      await onSave(structuredClone(draft), variantState);
      close();
    } catch (error) {
      showError(error, strings.saveError);
      save.disabled = false;
      if (reset) reset.disabled = resetDisabled;
    }
  });

  updateVariantTabs();
  modal.showModal();
  await renderVisual();
  return dialogHost;
}
