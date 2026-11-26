import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultsFromEditor,
  editorConfig,
  ensureCardLoaded,
} from "../custom_components/advanced_history/frontend/config-flow-defaults.js";
import { CARD_TAG } from "../custom_components/advanced_history/frontend/constants.js";

function mockCustomElements(t, registry) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "customElements");
  globalThis.customElements = registry;
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "customElements", previous);
    else delete globalThis.customElements;
  });
}

let sequence = 0;
function cardModule() {
  const source = `// statistics-graph-chart-card ${++sequence}\ncustomElements.define(${JSON.stringify(CARD_TAG)}, class {});`;
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

test("More Info loads the registered versioned SGCC resource before fallbacks", async (t) => {
  const registered = new Map();
  mockCustomElements(t, {
    get: (tag) => registered.get(tag),
    define: (tag, value) => registered.set(tag, value),
  });
  const calls = [];
  const url = cardModule();
  await ensureCardLoaded({
    callWS: async (message) => {
      calls.push(message);
      return [{ url: "/unrelated.js" }, { url }];
    },
  });
  assert.deepEqual(calls, [{ type: "lovelace/resources" }]);
  assert.ok(registered.has(CARD_TAG));
});

test("explicit SGCC module URLs take precedence over dashboard discovery", async (t) => {
  const registered = new Map();
  mockCustomElements(t, {
    get: (tag) => registered.get(tag),
    define: (tag, value) => registered.set(tag, value),
  });
  await ensureCardLoaded({
    callWS: async () => assert.fail("Explicit module URLs must skip discovery"),
  }, cardModule());
  assert.ok(registered.has(CARD_TAG));
});

test("already loaded SGCC is reused without resource discovery", async (t) => {
  mockCustomElements(t, { get: () => class {} });
  await ensureCardLoaded({
    callWS: async () => assert.fail("Already loaded cards must skip discovery"),
  });
});

test("More Info defaults retain minute intervals through the visual editor", () => {
  const defaults = {
    interval_options: ["15m", "30m", "1H", "24H"],
    default_interval: "30m",
  };
  const config = editorConfig({}, defaults, "more-info", "numeric");
  const saved = defaultsFromEditor(config, "more-info", "numeric");
  assert.deepEqual(saved.interval_options, defaults.interval_options);
  assert.equal(saved.default_interval, "30m");
});
