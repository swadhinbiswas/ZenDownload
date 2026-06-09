# ZenDownload Plugin Development Guide

## Overview

ZenDownload uses a metadata-based plugin system. Plugins are JSON manifest files that declare behavior, configuration, and optionally provide UI components. The system supports two plugin categories:

- **Hook-based plugins** — React to download events (start, complete, error, etc.) via the hook system
- **UI plugins** — Add sidebar entries with custom React components

Plugins are distributed via a remote catalog (GitHub-hosted `catalog.json`) and installed locally to the user's app data directory.

---

## Plugin Manifest

Every plugin is a single JSON file with this structure:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What this plugin does.",
  "homepage": "https://github.com/you/my-plugin",
  "plugin_type": "postprocessor",
  "enabled": true,
  "config": {},
  "hooks": ["file.postprocess"],
  "installed_at": 0,
  "path": null,
  "ui": null,
  "icon": "📦",
  "category": "downloader",
  "tags": ["archive", "extract"],
  "min_version": null,
  "screenshots": [],
  "config_schema": [],
  "downloads": 0
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (lowercase, hyphens only). Example: `auto-extract` |
| `name` | `string` | Display name shown in the store |
| `version` | `string` | Semver version (`MAJOR.MINOR.PATCH`) |
| `author` | `string` | Plugin author name |
| `description` | `string` | Short description (1-2 sentences) |
| `plugin_type` | `string` | One of the [plugin types](#plugin-types) |
| `enabled` | `boolean` | `true` for catalog entries, set on install |
| `hooks` | `string[]` | List of [hook names](#hooks) this plugin listens to |
| `installed_at` | `number` | Unix timestamp, set automatically on install |
| `icon` | `string` | Emoji icon for the plugin |
| `category` | `string` | One of the [categories](#categories) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `homepage` | `string \| null` | URL to plugin source/repo |
| `config` | `object` | Runtime configuration values (key-value pairs) |
| `config_schema` | `ConfigOption[]` | Schema defining configurable options |
| `ui` | `UiManifest \| null` | Required for UI plugins, `null` for hook-based |
| `tags` | `string[]` | Search tags for the store |
| `min_version` | `string \| null` | Minimum ZenDownload version required |
| `screenshots` | `string[]` | Screenshot URLs for the store |
| `downloads` | `number` | Download count (for catalog display) |
| `path` | `string \| null` | Local file path, set automatically |

---

## Plugin Types

| Type | Description |
|------|-------------|
| `extractor` | Extracts or transforms URLs before download |
| `postprocessor` | Processes files after download completes |
| `webhook` | Sends HTTP requests on events |
| `notifier` | Sends notifications (desktop, push, etc.) |
| `protocolhandler` | Intercepts and handles custom URL protocols (magnet:, ed2k:, etc.) |
| `mirror` | Finds alternative download sources |
| `ui` | Provides a sidebar UI component |

---

## Categories

| Category | Description |
|----------|-------------|
| `media` | Media-related (video, audio, IPTV) |
| `productivity` | Productivity tools (scheduling, organization) |
| `downloader` | Download enhancement (mirrors, proxies, extraction) |
| `notification` | Notifications and alerts |
| `utility` | General utilities (speed test, scanning) |
| `fun` | Fun tools (calculator, timer, games) |

---

## Hooks

Hooks are events fired during the download lifecycle. A plugin declares which hooks it listens to in its `hooks` array.

| Hook | When Fired | Payload |
|------|-----------|---------|
| `download.start` | Download begins | `{ id, url, filename, category, download_type }` |
| `download.complete` | Download finishes | `{ id }` |
| `download.error` | Download fails | `{ id, error }` |
| `url.extract` | URL is processed | `{ url, filename, category, download_type }` |
| `file.postprocess` | File post-processing | `{ id, path }` |
| `clipboard.detect` | Clipboard URL detected | `{ url, source, confidence }` |

### Hook Registration

In your plugin manifest, add hook names to the `hooks` array:

```json
{
  "id": "my-notifier",
  "hooks": ["download.complete", "download.error"],
  "plugin_type": "notifier"
}
```

When a hook fires, ZenDownload:
1. Finds all enabled plugins listening to that hook
2. Emits a `"plugin-fired"` Tauri event with the plugin ID, hook name, and payload
3. The frontend or backend can react to these events

---

## Configuration Schema

Plugins can declare configurable options using `config_schema`. Each option is a `ConfigOption` object:

```json
{
  "config_schema": [
    {
      "key": "webhook_url",
      "type": "text",
      "label": "Webhook URL",
      "description": "URL to send webhook requests to",
      "required": true,
      "default": null
    },
    {
      "key": "language",
      "type": "select",
      "label": "Subtitle Language",
      "options": [
        { "label": "English", "value": "en" },
        { "label": "Spanish", "value": "es" }
      ],
      "default": "en"
    },
    {
      "key": "auto_enabled",
      "type": "boolean",
      "label": "Auto-enable",
      "default": true
    }
  ]
}
```

### Config Option Types

| Type | Input | Description |
|------|-------|-------------|
| `text` | Text input | Single-line text |
| `password` | Password input | Masked text |
| `number` | Number input | Numeric value |
| `boolean` | Checkbox | Toggle on/off |
| `select` | Dropdown | Choose from predefined options |

### Config Option Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Unique key within this plugin |
| `type` | `string` | Yes | One of: `text`, `password`, `number`, `boolean`, `select` |
| `label` | `string` | Yes | Display label |
| `description` | `string` | No | Help text |
| `required` | `boolean` | No | Whether the field is required |
| `default` | `any` | No | Default value |
| `options` | `SelectOption[]` | No | Options for `select` type |

---

## UI Plugins

UI plugins add sidebar entries with custom React components.

### UiManifest

```json
{
  "ui": {
    "sidebar_label": "My Tool",
    "sidebar_icon": "Zap",
    "component_type": "my_tool",
    "page_config": {},
    "asset_dir": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sidebar_label` | `string` | Text shown in sidebar |
| `sidebar_icon` | `string` | Lucide icon name (e.g., `Zap`, `Radio`, `Calculator`) |
| `component_type` | `string` | Key in the `COMPONENT_MAP` in `PluginPageRenderer.tsx` |
| `page_config` | `any` | Config passed to the component as props |
| `asset_dir` | `string \| null` | Optional asset directory path |

### Available Component Types

These are the built-in component types registered in `PluginPageRenderer.tsx`:

| `component_type` | Component | Description |
|-------------------|-----------|-------------|
| `radio` | RadioPlayer | Internet radio player |
| `rss` | RssReader | RSS feed reader |
| `custom` | CustomPage | Generic custom page |
| `speed_test` | SpeedTestPlugin | Network speed test |
| `media_player` | MediaPlayer | In-app media player |
| `torrent_search` | TorrentSearch | Torrent search UI |
| `link_checker` | LinkChecker | Batch URL checker |
| `download_scheduler` | DownloadScheduler | Visual scheduler |
| `calculator` | CalculatorPlugin | Calculator |
| `notes` | NotesPlugin | Notes editor |
| `password_gen` | PasswordGenPlugin | Password generator |
| `color_picker` | ColorPickerPlugin | Color picker |
| `timer` | TimerPlugin | Pomodoro timer |

### Adding a New Component Type

1. Create your React component in `src/components/plugins/YourPlugin.tsx`
2. Export it as a named export
3. Add the import and mapping in `src/components/plugins/PluginPageRenderer.tsx`:

```tsx
import { YourPlugin } from './YourPlugin';

const COMPONENT_MAP: Record<string, React.FC<{ pageConfig?: any }>> = {
  // ... existing entries
  your_tool: YourPlugin,
};
```

4. Reference `your_tool` as the `component_type` in your plugin manifest

---

## Catalog API

The plugin catalog is served from a remote JSON endpoint. The default URL is configured in `src/services/pluginService.ts`:

```ts
export const PLUGIN_CATALOG_URL = 'https://raw.githubusercontent.com/swadhinbiswas/ZenDownload/main/catalog.json';
```

To change the catalog URL, edit this constant or pass a custom URL to `pluginService.fetchCatalog(url)`.

### Catalog Format

The catalog is a JSON array of `CatalogPlugin` objects:

```json
[
  {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "What it does.",
    "plugin_type": "postprocessor",
    "hooks": ["file.postprocess"],
    "homepage": "https://github.com/you/my-plugin",
    "downloads": 1234,
    "icon": "📦",
    "category": "downloader",
    "tags": ["tag1", "tag2"],
    "config_schema": [],
    "ui": null
  }
]
```

### Publishing a Plugin

1. Create your plugin manifest JSON file (see examples below)
2. Fork the catalog repository: `https://github.com/swadhinbiswas/ZenDownload`
3. Add your plugin entry to `catalog.json` (append to the array)
4. Open a pull request
5. Once reviewed and merged, your plugin appears in the ZenDownload Plugin Store

### Creating Your Own Catalog

To host a private or custom catalog:

1. Create a JSON file with an array of `CatalogPlugin` objects
2. Host it on any HTTPS endpoint (GitHub raw, your own server, etc.)
3. The URL must return valid JSON with `Content-Type: application/json`
4. Users can point ZenDownload to your catalog URL via the `fetch_plugin_catalog` command

Catalog JSON structure:
```json
[
  {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "What it does.",
    "plugin_type": "postprocessor",
    "hooks": ["file.postprocess"],
    "homepage": "https://github.com/you/my-plugin",
    "downloads": 0,
    "icon": "📦",
    "category": "downloader",
    "tags": ["example"],
    "config_schema": [],
    "ui": null
  }
]
```

---

## Installation Flow

1. User opens the Plugin Store (fetches `catalog.json` from the configured URL)
2. User browses/searches, clicks "Install" on a plugin
3. ZenDownload creates a full `Plugin` object from the catalog entry:
   - Sets `enabled: true`
   - Sets `config: {}` (empty default config)
   - Sets `installed_at` to current timestamp
   - Sets `path` to local file path
4. The plugin JSON is written to `{app_data_dir}/plugins/{id}.json`
5. The plugin is added to the in-memory `PluginManager`
6. For UI plugins, the sidebar entry appears immediately
7. For hook-based plugins, the next matching event triggers the hook

### What Gets Stored Locally

After installation, the full `Plugin` object is persisted as JSON:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What it does.",
  "homepage": "https://github.com/you/my-plugin",
  "plugin_type": "postprocessor",
  "enabled": true,
  "config": {},
  "hooks": ["file.postprocess"],
  "installed_at": 1718000000,
  "path": "/home/user/.local/share/zendownload/plugins/my-plugin.json",
  "ui": null,
  "icon": "📦",
  "category": "downloader",
  "tags": ["example"],
  "min_version": null,
  "screenshots": [],
  "config_schema": [],
  "downloads": 0
}
```

---

## File Locations

| Item | Path |
|------|------|
| Installed plugins | `{app_data_dir}/plugins/{id}.json` |
| Plugin components | `src/components/plugins/` |
| TypeScript types | `src/types/plugin.ts` |
| Rust types | `src-tauri/src/engine/plugin_system.rs` |
| Tauri commands | `src-tauri/src/lib.rs` |
| Frontend service | `src/services/pluginService.ts` |
| Zustand store | `src/stores/pluginStore.ts` |
| Catalog source | `https://github.com/swadhinbiswas/ZenDownload` |

---

## Example: Complete Hook-Based Plugin

This plugin sends a desktop notification when a download completes.

```json
{
  "id": "download-notify",
  "name": "Download Notify",
  "version": "1.0.0",
  "author": "Community",
  "description": "Shows a desktop notification when downloads finish.",
  "homepage": "https://github.com/community/download-notify",
  "plugin_type": "notifier",
  "enabled": true,
  "config": {},
  "hooks": ["download.complete"],
  "installed_at": 0,
  "path": null,
  "ui": null,
  "icon": "🔔",
  "category": "notification",
  "tags": ["notification", "desktop"],
  "min_version": null,
  "screenshots": [],
  "config_schema": [
    {
      "key": "sound",
      "type": "boolean",
      "label": "Play sound",
      "description": "Play a notification sound",
      "default": true
    }
  ],
  "downloads": 0
}
```

---

## Example: Complete UI Plugin

This plugin adds a custom tool to the sidebar.

```json
{
  "id": "my-tool",
  "name": "My Custom Tool",
  "version": "1.0.0",
  "author": "Community",
  "description": "A custom tool that does something useful.",
  "homepage": "https://github.com/community/my-tool",
  "plugin_type": "ui",
  "enabled": true,
  "config": {},
  "hooks": [],
  "installed_at": 0,
  "path": null,
  "ui": {
    "sidebar_label": "My Tool",
    "sidebar_icon": "Wrench",
    "component_type": "my_tool",
    "page_config": {},
    "asset_dir": null
  },
  "icon": "🔧",
  "category": "utility",
  "tags": ["tool", "custom"],
  "min_version": null,
  "screenshots": [],
  "config_schema": [],
  "downloads": 0
}
```

Then register the component in `PluginPageRenderer.tsx`:

```tsx
import { MyTool } from './MyTool';

const COMPONENT_MAP = {
  // ...
  my_tool: MyTool,
};
```

---

## API Reference

### Tauri Commands

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `list_plugins` | — | `Plugin[]` | List all installed plugins |
| `list_ui_plugins` | — | `Plugin[]` | List installed UI plugins |
| `get_plugin` | `{ id }` | `Plugin \| null` | Get a plugin by ID |
| `install_plugin` | `{ plugin }` | `string` | Install a plugin, returns ID |
| `uninstall_plugin` | `{ id }` | — | Remove a plugin |
| `enable_plugin` | `{ id }` | — | Enable a plugin |
| `disable_plugin` | `{ id }` | — | Disable a plugin |
| `update_plugin_config` | `{ id, config }` | — | Update plugin configuration |
| `get_plugin_config_schema` | `{ id }` | `ConfigOption[]` | Get config schema |
| `list_plugin_hooks` | — | `PluginHook[]` | List available hooks |
| `fetch_plugin_catalog` | `{ url }` | `CatalogPlugin[]` | Fetch catalog from URL |

### Tauri Events

| Event | Payload | Description |
|-------|---------|-------------|
| `plugin-fired` | `{ plugin, hook, payload }` | Emitted when a hook fires |

---

## Development Workflow

### Creating a New Plugin

1. Decide the plugin type (hook-based or UI)
2. Create the manifest JSON with all required fields
3. For UI plugins: create the React component and register it in `PluginPageRenderer.tsx`
4. For hook plugins: the hook system handles dispatch automatically
5. Add your plugin entry to the catalog repository
6. Test by installing from the Plugin Store

### Testing Locally

**For catalog contributors:**
1. Add your plugin to `catalog.json` in the fork
2. Push to your fork, use the raw URL to test
3. The Plugin Store fetches from the catalog URL

**For UI plugin development:**
1. Create your component in `src/components/plugins/YourPlugin.tsx`
2. Register it in `PluginPageRenderer.tsx` COMPONENT_MAP
3. Create a catalog entry with `plugin_type: "ui"` and matching `component_type`
4. Test by installing from the store

**For hook-based plugin development:**
1. Create the catalog entry with appropriate `hooks` array
2. Install from the store
3. Trigger the relevant download event (start a download, complete one, etc.)
4. Check browser devtools for `"plugin-fired"` events

### Debugging

- **Hook events**: Check browser devtools console for `"plugin-fired"` Tauri events
- **Plugin files**: Inspect `{app_data_dir}/plugins/` for installed JSON files
- **IPC errors**: Tauri command failures appear in browser devtools console
- **Rust logs**: Plugin operations are logged to stdout (check terminal)
- **Catalog fetch**: Network tab in devtools shows catalog API requests

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Plugin not in store | Catalog URL wrong or not merged yet | Check catalog URL, verify PR is merged |
| UI plugin not in sidebar | `component_type` not in COMPONENT_MAP | Register component in `PluginPageRenderer.tsx` |
| Hook not firing | Plugin disabled or not in `hooks` array | Check plugin is enabled, verify hook name |
| Config not saving | `config_schema` missing or wrong key | Verify schema matches config keys |
