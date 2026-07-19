<p align="center">
  <img src="custom_components/advanced_history/brand/icon@2x.png" width="160" alt="Advanced History icon">
</p>

<h1 align="center">Advanced History</h1>

<p align="center">
  A configurable Home Assistant History panel powered by<br>
  <a href="https://github.com/cataseven/Statistics-Graph-Chart-Card">Statistics Graph Chart Card</a>.
</p>

<p align="center">
  <img alt="Home Assistant custom integration" src="https://img.shields.io/badge/Home%20Assistant-Custom%20Integration-18BCF2?logo=home-assistant&logoColor=white">
  <img alt="HACS custom repository" src="https://img.shields.io/badge/HACS-Custom%20Repository-41BDF5">
  <img alt="Version 0.5.1" src="https://img.shields.io/badge/version-0.5.1-blue">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-green">
</p>

Advanced History provides a Home Assistant-style History page with more powerful graphs, native target selection, Energy date navigation, comparisons, bookmarks and a full visual graph editor.

> [!IMPORTANT]
> [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card) is a separate required dependency. If it is missing, Advanced History provides an **Install using HACS** link and a **Retry** button.

## Features

- Native Home Assistant target picker for areas, devices and entities.
- Area names appended to entity names when they are not already present.
- Numeric history and state-timeline graphs.
- Floating Energy-style date navigation.
- Previous-period and previous-year comparison modes.
- User-scoped bookmarks containing targets, dates and complete chart settings, synchronized through Home Assistant across devices.
- Loading feedback while a saved date range is restored and its data is fetched.
- Undo and redo controls for incremental chart changes.
- History of the ten most recent charts cleared or replaced by navigation.
- Separate visual editors for current-chart settings and Card Defaults.
- Optional redirection of entity-dialog **Show more** links.
- Configurable sidebar title, icon, graph height and entity limit.
- Administrator-only mode.
- Native Home Assistant translations wherever matching strings are available.
- Additional translations for Advanced History-specific wording.
- Missing graph-card detection with guided HACS installation and in-page retry.

## Contents

- [Requirements](#requirements)
- [Installation with HACS](#installation-with-hacs)
- [Manual installation](#manual-installation)
- [Initial setup](#initial-setup)
- [Using the panel](#using-the-panel)
- [Configuration](#configuration)
- [Graph-card defaults](#graph-card-defaults)
- [Bookmarks, history, undo and redo](#bookmarks-history-undo-and-redo)
- [Languages](#languages)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Credits and licence](#credits-and-licence)

## Requirements

- Home Assistant with support for custom integrations.
- [HACS](https://www.hacs.xyz/) is recommended.
- [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card) installed as a Lovelace resource.

No `panel_custom` entry is required in `configuration.yaml`.

## Installation with HACS

This repository is currently installed as a custom HACS repository:

1. Open **HACS → Integrations**.
2. Open the three-dot menu and select **Custom repositories**.
3. Paste the URL of this GitHub repository.
4. Select **Integration** as the category and choose **Add**.
5. Search for **Advanced History** and install it.
6. Restart Home Assistant once so the Python integration is discovered.
7. Continue with [Initial setup](#initial-setup).

## Manual installation

1. Download the latest release archive.
2. Copy `custom_components/advanced_history` into:

   ```text
   /config/custom_components/advanced_history
   ```

3. Restart Home Assistant once.
4. Continue with [Initial setup](#initial-setup).

The final directory should contain at least:

```text
custom_components/advanced_history/
├── __init__.py
├── config_flow.py
├── const.py
├── manifest.json
├── panel.py
├── websocket.py
├── frontend/
└── translations/
```

## Initial setup

1. Open **Settings → Devices & services**.
2. Select **Add integration**.
3. Search for **Advanced History**.
4. Configure the initial panel settings and select **Submit**.
5. Open **Advanced History** from the Home Assistant sidebar.

After installation, integration settings are available from:

**Settings → Devices & services → Advanced History → Configure**

Saving settings reloads the Advanced History panel automatically. A full Home Assistant restart is only normally required after the first installation or a Python integration update.

## Using the panel

### Targets

Use **Add target** to select multiple areas, devices or entities. Selected targets appear as removable chips. The remove-all button clears the complete selection.

If several entities share the same friendly name, Advanced History appends the area name unless it is already part of that friendly name.

### Dates and comparisons

The floating date navigator uses Home Assistant's Energy date controls. It can select common periods, custom ranges, months and years. The comparison banner supports the previous period and previous year.

### Graph editor

The cog button opens Statistics Graph Chart Card's visual editor for the current chart. Saving changes only that chart and its Undo/Redo, Bookmark and History snapshots; it never changes integration defaults.

The integration config flow displays **Card Defaults** as editable YAML. Its **Open visual editor** button opens the same card editor and writes the result back into that YAML field immediately. Submit the config flow to apply the new defaults; cancelling the flow discards the YAML draft.

## Configuration

| Setting | Description |
| --- | --- |
| **Panel title** | Name displayed in the sidebar and panel header. |
| **Sidebar icon** | Material Design icon used in the sidebar. |
| **Maximum entities** | Safety limit for entities resolved from selected targets. |
| **Default hours** | Initial graph duration before an Energy period is selected. |
| **Graph height** | Height applied to generated graph cards. |
| **Include hidden entities** | Includes hidden registry entities in area/device targets. |
| **Open Show more in Advanced History** | Redirects an entity dialog's History link to this panel. |
| **Graph card module URL** | Optional exact resource URL when automatic detection fails. |
| **Card Defaults** | Statistics Graph Chart Card defaults for new charts, editable as YAML. |
| **Default comparison** | Follows Energy, previous period, previous year or disabled. |
| **Administrators only** | Restricts the sidebar panel to administrators. |

When **Open Show more in Advanced History** is enabled, selecting **Show more** from an entity's History section opens `/advanced-history` with that entity as the only target. Existing area, device and entity selections are replaced.

## Graph-card defaults

Advanced History exposes its preferred Statistics Graph Chart Card defaults in the **Card Defaults** editor. They are visible, can be edited as YAML and can be explicitly disabled with `false`. The **Open visual editor** button beside that field edits the same values with the card's visual editor, then returns the result to the YAML field for review before the config flow is submitted.

Changes made with the normal graph-settings cog are stored only in the current chart. They are included in Undo/Redo, Bookmarks and History, but they are not written back into **Card Defaults**.

Current-chart settings are layered over **Card Defaults**. Removing a current override restores the integration default; when no integration default exists, the Statistics Graph Chart Card uses its own built-in default.

The recommended YAML is supplied when the integration is first configured. After that, the saved **Card Defaults** object is authoritative: deleting a key keeps it deleted instead of silently restoring the original recommendation.

Only `energy_date_sync: true` is enforced because the floating Energy period and comparison controls require both generated graphs to follow the shared date range. `height` and `hours_to_show` have dedicated integration fields and are therefore removed from the additional-options object.

Anonymous entries under `entities` apply to every dynamically selected entity without requiring an entity ID:

```yaml
entities:
  show_in_legend: true
  legend_stats:
    - min
    - avg
    - max
  show_state: false
  compare:
    hide_on_load: true
```

An anonymous list is also accepted and merged in order. Settings saved for a specific entity through the graph editor take precedence over anonymous defaults. Nested entity and comparison options are retained.

## Bookmarks, history, undo and redo

The top-right **Bookmarks** button stores named reusable chart snapshots. **Undo** and **Redo** restore incremental changes without filling the History list with every edit.

The **History** button keeps the ten most recent charts that were active before their selections were cleared or replaced. A chart is added immediately before:

- **Remove all selections** clears it;
- the final target is removed through the target picker or a target chip;
- **Show more** replaces the current selections with an entity;
- another action replaces a non-empty chart with an empty selection.

Each snapshot stores:

- selected areas, devices and entities;
- Energy start and end dates;
- comparison mode;
- graph-card defaults;
- per-entity styling;
- graph height and default hours.

Restoring a bookmark or History entry changes the current view without overwriting the integration-wide defaults. Bookmarks are stored by Home Assistant user and synchronized whenever the bookmark library is opened, making them available to the same account on other devices. Chart history and Undo/Redo remain in the current browser because they describe that device's editing session.

## Languages

US English is the source and fallback language. The integration also includes:

- English (United Kingdom)
- German
- Spanish
- French
- Italian
- Dutch
- Portuguese (Brazil)

Native Home Assistant controls use Home Assistant's own translations. The integration catalogues contain only Advanced History-specific wording.

## Updating

### HACS

Install the update from HACS. Restart Home Assistant when the release contains Python changes. Then perform a hard browser refresh if the old frontend remains cached.

### Manual

Replace the existing `/config/custom_components/advanced_history` directory with the new release contents, restart Home Assistant and refresh the browser.

### Migrating from the standalone panel

Remove the old `panel_custom` YAML entry to avoid duplicate sidebar routes. Existing target selections are retained because both versions use the same browser local-storage key.

## Troubleshooting

### Statistics Graph Chart Card could not be loaded

Use **Install using HACS** on the Advanced History error screen, install the card, return to Advanced History and select **Retry**. Advanced History checks registered dashboard resources as well as the standard HACS locations.

If the card is already installed, confirm it is registered under **Settings → Dashboards → Resources**. If its URL is unusual, copy the exact resource URL into **Graph card module URL** in the Advanced History configuration.

### The panel still shows an older version

Reload the integration, then hard-refresh the browser or clear the Home Assistant frontend cache. The loaded panel version is also written to the browser console.

### Bookmarks do not appear on another device

Confirm both devices are signed in with the same Home Assistant user, then reopen **Bookmarks** to refresh the server copy. If synchronization is temporarily unavailable, changes remain cached on the current device and are retried later.

Targets, chart history and Undo/Redo intentionally remain specific to each browser profile.

### The native target picker does not load

Reload the page after Home Assistant has fully started. If it continues, check the browser console and Home Assistant logs for an Advanced History error.

### The date range does not restore

Open the saved bookmark or chart-history entry after the Energy controls have loaded. The stored start date, end date and comparison mode should then be applied together.

## Project structure

```text
custom_components/advanced_history/
├── __init__.py                 # Integration lifecycle
├── config_flow.py              # Setup and reconfigure forms
├── const.py                    # Constants and visible defaults
├── panel.py                    # Frontend/sidebar registration
├── websocket.py                # User-scoped bookmark storage commands
├── manifest.json
├── brand/
├── translations/               # Config-flow translations
└── frontend/
    ├── advanced-history-panel.js
    ├── advanced-history-redirect.js
    ├── constants.js
    ├── energy.js
    ├── graphs.js
    ├── storage.js
    ├── styles.js
    ├── target-picker.js
    └── translations.js         # Panel-specific translations
```

## Contributing

Issues and pull requests are welcome. When reporting a problem, include:

- Home Assistant version;
- Advanced History version;
- Statistics Graph Chart Card version;
- browser and device;
- relevant browser-console and Home Assistant log messages;
- steps needed to reproduce the issue.

Please keep US English as the source wording and add regional translations only where the wording differs.

## Credits and licence

Advanced History was created by [andyblac](https://github.com/andyblac) and is released under the [MIT Licence](LICENSE).

Graph rendering and the visual graph editor are provided at runtime by [Statistics Graph Chart Card](https://github.com/cataseven/Statistics-Graph-Chart-Card), created and maintained by [cataseven](https://github.com/cataseven). It is a separate required dependency, is not bundled with Advanced History, and remains licensed under the [Apache License 2.0](https://github.com/cataseven/Statistics-Graph-Chart-Card/blob/main/LICENSE).

Special thanks to [cataseven](https://github.com/cataseven) for creating Statistics Graph Chart Card and for allowing and supporting its use in this project.

Native controls and localisation are supplied by the [Home Assistant frontend](https://github.com/home-assistant/frontend), which is also distributed under the [Apache License 2.0](https://github.com/home-assistant/frontend/blob/dev/LICENSE.md). [HACS](https://www.hacs.xyz/) provides the optional community installation and update channel.

Advanced History is an independent community project. It is not an official Home Assistant, Open Home Foundation, HACS or Statistics Graph Chart Card project, and is not endorsed by those projects or their maintainers.
