<p align="center">
  <img src="custom_components/advanced_history/brand/icon@2x.png" width="160" alt="Advanced History icon">
</p>

<h1 align="center">Advanced History</h1>

<p align="center">
  A Home Assistant-style History panel with more powerful, configurable graphs.
</p>

<p align="center">
  <img alt="Home Assistant custom integration" src="https://img.shields.io/badge/Home%20Assistant-Custom%20Integration-18BCF2?logo=home-assistant&logoColor=white">
  <img alt="HACS custom repository" src="https://img.shields.io/badge/HACS-Custom%20Repository-41BDF5">
  <img alt="Version" src="https://img.shields.io/github/v/release/andyblac/Advanced-History-Integration?include_prereleases">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-green">
</p>

> [!NOTE]
> Advanced History is currently in pre-release development. Configuration and behavior may change before version 1.0.0.

## What is Advanced History?

Advanced History provides a dedicated Home Assistant sidebar panel that keeps the familiar History-page workflow while using [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card) for graph rendering. It can also optionally replace the native History graph inside entity More Info dialogs.

It includes native target selection, Energy-style date navigation and comparisons, visual graph editing, reusable bookmarks, chart history, Undo/Redo, and independent defaults for the sidebar and More Info graphs.

## Why was it created?

Home Assistant's built-in History page is quick and convenient, but its graph customization is intentionally limited. Statistics Graph Chart Card offers much more control, but normally needs a dashboard card to be configured in advance.

Advanced History brings those two ideas together: select targets as you would in History, then explore them with the more capable graph card without building a separate dashboard for every combination.

## Highlights

- Select multiple areas, devices, or entities with Home Assistant's native target picker.
- Display numeric history and state timelines.
- Navigate dates and compare periods with native Energy controls.
- Edit the current chart through the Statistics Graph Chart Card visual editor.
- Define integration-wide Card Defaults through YAML or the visual editor.
- Save complete charts as user-scoped bookmarks synchronized across devices.
- Restore recently cleared charts and use Undo/Redo for incremental changes.
- Optionally open entity-dialog **Show more** links in Advanced History.
- Optionally replace native entity More Info History graphs with independently configured Statistics Graph Chart Card graphs.
- Match Home Assistant's numeric, state, axis, grid, theme, and timezone behavior in More Info dialogs.

## Requirements

- Home Assistant with support for custom integrations.
- [HACS](https://www.hacs.xyz/) is recommended.
- [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card) is a separate required dependency.

If the graph card is missing, Advanced History displays an **Install using HACS** link and a **Retry** button.

## Installation

### HACS

1. Install [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card) through HACS.
2. Open **HACS → Integrations**.
3. Open the three-dot menu and select **Custom repositories**.
4. Add this repository as an **Integration**:

   ```text
   https://github.com/andyblac/Advanced-History-Integration
   ```

5. Search for **Advanced History** and install it.
6. Restart Home Assistant.
7. Open **Settings → Devices & services → Add integration**.
8. Search for **Advanced History** and complete setup.
9. Confirm the integration contains separate **Advanced History** and **More-Info** services, then open Advanced History from the sidebar.

New installations create both services automatically. The More Info graph replacement has its own enable switch, optional calendar, YAML defaults, and visual editor.

### Manual

1. Install Statistics Graph Chart Card and register it as a dashboard resource.
2. Copy `custom_components/advanced_history` into `/config/custom_components/advanced_history`.
3. Restart Home Assistant.
4. Add **Advanced History** from **Settings → Devices & services**.

### Existing installations from before 0.6.0

After updating, open **Settings → Devices & services → Advanced History**, select **Add service**, and complete **Set up More-Info**. This creates the optional More Info graph replacement without changing the sidebar panel configuration.

## Documentation

Full setup, usage, configuration, and troubleshooting documentation is available in the [Advanced History Wiki](https://github.com/andyblac/Advanced-History-Integration/wiki).

- [Installation](https://github.com/andyblac/Advanced-History-Integration/wiki/Installation)
- [Getting started](https://github.com/andyblac/Advanced-History-Integration/wiki/Getting-Started)
- [Configuration reference](https://github.com/andyblac/Advanced-History-Integration/wiki/Configuration-Reference)
- [More Info graphs](https://github.com/andyblac/Advanced-History-Integration/wiki/More-Info-Graphs)
- [Troubleshooting](https://github.com/andyblac/Advanced-History-Integration/wiki/Troubleshooting)

## Special thanks

Special thanks to [cataseven](https://github.com/cataseven) for creating [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card), and for allowing and supporting its use in this project.

Graph rendering and the visual graph editor are provided at runtime by Statistics Graph Chart Card. It is not bundled with Advanced History and remains licensed under the [GNU General Public License v3.0](https://github.com/cataseven/Statistics-Graph-Chart-Card/blob/main/LICENSE).

Native controls and localization are supplied by the [Home Assistant frontend](https://github.com/home-assistant/frontend). [HACS](https://www.hacs.xyz/) provides the optional community installation and update channel.

## Licence and project status

Advanced History was created by [andyblac](https://github.com/andyblac) and is released under the [MIT Licence](LICENSE).

This is an independent community project. It is not an official Home Assistant, Open Home Foundation, HACS, or Statistics Graph Chart Card project, and is not endorsed by those projects or their maintainers.
