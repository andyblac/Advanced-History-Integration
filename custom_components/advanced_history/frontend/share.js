import { SHARE_QUERY_PARAM } from "./constants.js";

const SHARE_SCHEMA = 1;
const MAX_SHARE_PARAMETER_LENGTH = 250000;
const MAX_SHARE_DATA_LENGTH = 2000000;

export class ShareMethods {
  _bytesToBase64Url(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  _base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async _gunzip(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot decompress shared charts");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  _shareableSnapshot() {
    const snapshot = this._captureSnapshot();
    delete snapshot.id;
    delete snapshot.name;
    delete snapshot.saved_at;
    delete snapshot.source_bookmark_id;
    return snapshot;
  }

  _encodeSharedSnapshot(snapshot) {
    const json = JSON.stringify({ version: SHARE_SCHEMA, snapshot });
    const bytes = new TextEncoder().encode(json);
    if (bytes.length > MAX_SHARE_DATA_LENGTH) throw new Error("Shared chart is too large");
    const encoded = `j.${this._bytesToBase64Url(bytes)}`;
    if (encoded.length > MAX_SHARE_PARAMETER_LENGTH) throw new Error("Shared chart link is too large");
    return encoded;
  }

  _validateSharedSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (!value.targets || typeof value.targets !== "object") return null;
    if (!value.chart || typeof value.chart !== "object" || Array.isArray(value.chart)) return null;

    const targets = this._normalizeTargets(value.targets);
    for (const values of Object.values(targets)) {
      if (!values.every((item) => typeof item === "string" && item.length <= 255)) return null;
    }
    const hiddenTargets = this._normalizeTargets(value.hidden_targets || {});
    for (const values of Object.values(hiddenTargets)) {
      if (!values.every((item) => typeof item === "string" && item.length <= 255)) return null;
    }

    const snapshot = this._clone(value);
    snapshot.schema = 1;
    snapshot.targets = targets;
    snapshot.hidden_targets = hiddenTargets;
    snapshot.source_bookmark_id = null;
    snapshot.id = this._newSnapshotId();
    snapshot.name = this._snapshotLabel(snapshot);
    snapshot.saved_at = new Date().toISOString();
    return snapshot;
  }

  async _decodeSharedSnapshot(value) {
    if (!value || value.length > MAX_SHARE_PARAMETER_LENGTH) return null;
    const separator = value.indexOf(".");
    if (separator <= 0) return null;
    const encoding = value.slice(0, separator);
    let bytes = this._base64UrlToBytes(value.slice(separator + 1));
    if (encoding === "g") bytes = await this._gunzip(bytes);
    else if (encoding !== "j") return null;
    if (bytes.length > MAX_SHARE_DATA_LENGTH) return null;
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload?.version !== SHARE_SCHEMA) return null;
    return this._validateSharedSnapshot(payload.snapshot);
  }

  async _sharedSnapshotFromUrl(params) {
    const encoded = params.get(SHARE_QUERY_PARAM);
    if (!encoded) return null;
    try {
      return await this._decodeSharedSnapshot(encoded);
    } catch (error) {
      console.warn("Advanced History: shared chart could not be loaded", error);
      return null;
    }
  }

  _replaceSharedUrlWithTargets() {
    const url = new URL(location.href);
    url.searchParams.delete(SHARE_QUERY_PARAM);
    ["area_id", "device_id", "entity_id"].forEach((key) => {
      url.searchParams.delete(key);
      this._targets[key].forEach((value) => url.searchParams.append(key, value));
    });
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async _writeShareLink(value) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* Fall back to the legacy copy command below. */ }

    const input = document.createElement("textarea");
    input.value = value;
    input.readOnly = true;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }

  async _copyShareLink(button) {
    if (!this._targetCount()) return;
    const icon = button?.querySelector("ha-icon");
    const originalLabel = button?.textContent;
    if (button) button.disabled = true;
    try {
      // Keep encoding synchronous so browsers retain the button's user activation
      // when the clipboard API is called, particularly Safari and HA's iOS WebView.
      const encoded = this._encodeSharedSnapshot(this._shareableSnapshot());
      const url = new URL(location.href);
      ["area_id", "device_id", "entity_id"].forEach((key) => url.searchParams.delete(key));
      url.searchParams.set(SHARE_QUERY_PARAM, encoded);
      const copied = await this._writeShareLink(url.href);
      if (!copied) throw new Error("Clipboard write failed");
      if (icon) icon.setAttribute("icon", "mdi:check");
      if (button) {
        button.title = this._customLocalize("share_link_copied");
        if (!icon) button.textContent = this._customLocalize("share_link_copied");
      }
    } catch (error) {
      console.error("Advanced History: unable to copy share link", error);
      if (icon) icon.setAttribute("icon", "mdi:alert-circle-outline");
      if (button) {
        button.title = this._customLocalize("share_link_error");
        if (!icon) button.textContent = this._customLocalize("share_link_error");
      }
    } finally {
      if (button) button.disabled = false;
      window.setTimeout(() => {
        if (!button?.isConnected) return;
        icon?.setAttribute("icon", "mdi:share-variant-outline");
        button.title = this._customLocalize("copy_share_link");
        if (!icon && originalLabel != null) button.textContent = originalLabel;
      }, 2500);
    }
  }
}
