import { installConfigFlowDefaultsEditor } from "./config-flow-defaults.js";

const INSTALL_KEY = "__advancedHistoryShowMoreRedirectInstalled";
const PANEL_PATH = "/advanced-history";
const PANEL_KEY = "advanced-history";

function rewriteShowMoreLink(event) {
  const path = event.composedPath?.() || [];
  const historyView = path.find(
    (node) => node instanceof HTMLElement && node.localName === "ha-more-info-history"
  );
  if (!historyView) return;

  const panelConfig = historyView.hass?.panels?.[PANEL_KEY]?.config;
  if (!panelConfig?.redirect_show_more) return;

  const link = path.find(
    (node) => node instanceof HTMLAnchorElement && node.hasAttribute("href")
  );
  if (!link) return;

  let nativeUrl;
  try {
    nativeUrl = new URL(link.href, window.location.origin);
  } catch (_) {
    return;
  }
  if (nativeUrl.pathname !== "/history") return;

  const entityId = historyView.entityId || nativeUrl.searchParams.get("entity_id");
  if (!entityId) return;

  const target = new URL(PANEL_PATH, window.location.origin);
  target.searchParams.set("entity_id", entityId);
  link.href = `${target.pathname}${target.search}`;
}

if (!window[INSTALL_KEY]) {
  window[INSTALL_KEY] = true;
  // Rewriting the real anchor preserves Home Assistant's normal navigation,
  // including dialog closure, modifier keys, new tabs, and browser history.
  document.addEventListener("click", rewriteShowMoreLink, true);
  document.addEventListener("auxclick", rewriteShowMoreLink, true);
  document.addEventListener("contextmenu", rewriteShowMoreLink, true);
}

installConfigFlowDefaultsEditor();
