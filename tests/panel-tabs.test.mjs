import assert from "node:assert/strict";
import test from "node:test";

import { PanelTabsMethods } from "../custom_components/advanced_history/frontend/panel-tabs.js";

function scrollFixture({ scrollLeft, clientWidth = 300, scrollWidth = 800 }) {
  const starts = [0, 180, 360, 540, 720];
  const tabs = {
    scrollLeft,
    clientWidth,
    scrollWidth,
    getBoundingClientRect: () => ({ left: 50 }),
    querySelectorAll: () => starts.map((left) => ({
      getBoundingClientRect: () => ({
        left: 50 + left - scrollLeft,
        width: 180,
      }),
    })),
    scrollTo(options) {
      this.lastScroll = options;
    },
  };
  return tabs;
}

test("panel tab arrows scroll to tab snap points in both directions", () => {
  const context = Object.create(PanelTabsMethods.prototype);
  const tabs = scrollFixture({ scrollLeft: 180 });

  context._scrollPanelTabs(tabs, 1);
  assert.deepEqual(tabs.lastScroll, { left: 360, behavior: "smooth" });

  tabs.scrollLeft = 540;
  context._scrollPanelTabs(tabs, -1);
  assert.deepEqual(tabs.lastScroll, { left: 360, behavior: "smooth" });
});

test("panel tab arrows clamp scrolling to the available range", () => {
  const context = Object.create(PanelTabsMethods.prototype);
  const tabs = scrollFixture({ scrollLeft: 500 });

  context._scrollPanelTabs(tabs, 1);
  assert.deepEqual(tabs.lastScroll, { left: 500, behavior: "smooth" });

  tabs.scrollLeft = 0;
  context._scrollPanelTabs(tabs, -1);
  assert.deepEqual(tabs.lastScroll, { left: 0, behavior: "smooth" });
});
