<p align="center">
  <img src="icon128.png" width="96" height="96" alt="FocusGuard icon">
</p>

<h1 align="center">FocusGuard</h1>

<p align="center">
  Block distracting sites and protect deep work.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## Features

- **Block by domain or keyword** — one click to block the site you're on, or add keywords that match anywhere in a URL
- **Password-protected settings** — SHA-256 hashed, 3-attempt lockout with a 30s cooldown, auto-locks after 5 minutes idle
- **Tab timers** — auto-close a tab after a set time, or just pause its video instead
- **Progress dashboard** — total blocks, current & best streak, a 7-day chart, and your most-tempting sites
- **Import/export** your blocklist and keywords as JSON
- **Dark mode** for the settings page

## Installation

### Option 1: Download a release (recommended)

1. Go to the [Releases page](../../releases) and download `focusguard-vX.Y.Z.zip` from the latest release.
2. Unzip it.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped `focusguard` folder.

### Option 2: Clone from source

```bash
git clone https://github.com/<your-username>/focusguard.git
```

Then follow steps 3–5 above, selecting the cloned `focusguard` folder.

## Usage

- Click the FocusGuard icon and press **Block Site** to block whatever site you're currently on.
- Open **Blocklist** (from the popup or the extension's options) to manage domains, keywords, password, stats, and timers.
- Set a password on first use — without one, the settings page has nothing to unlock.
- Start a tab timer from the popup to auto-close a tab, or just pause its video, after a chosen duration.

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Stores your blocklist, keywords, password hash, stats, and timers locally. |
| `tabs` | Reads the current tab's URL to block it, and manages tabs for the timer feature. |
| `alarms` | Schedules tab timers so they still fire after the popup closes. |
| `declarativeNetRequest` | Blocks/redirects requests to sites on your blocklist. |
| `host_permissions: <all_urls>` | Needed for `declarativeNetRequest` and the content script to work on any site you choose to block. |

FocusGuard makes no network requests of its own and keeps all data in local browser storage.

## Known limitations

- **The settings-page password is a soft lock, not real security.** It deters casual access, but anyone with the extension's own DevTools console open can read or edit its stored data directly. Uninstalling or disabling the extension also removes protection entirely — this is disclosed in the settings page itself.
- **The "pause video" tab timer only works on tabs opened after install.** Tabs already open when you install (or update) FocusGuard need a refresh before the content script is present.

## Project structure

```
focusguard/
├── manifest.json       # Manifest V3 config
├── background.js       # Service worker: blocklist rules, stats, tab timers
├── popup.html/.js      # Toolbar popup: block current site, tab timer
├── options.html/.js    # Settings: blocklist, keywords, password, stats, import/export
├── dashboard.html/.js  # Shown when a site/keyword is blocked
├── video-pause.js      # Content script: pauses <video> on "pause instead of close"
├── icon.svg            # Vector source for the icons (not used by the manifest directly)
├── icon16.png
├── icon32.png
├── icon48.png
└── icon128.png
```

## Development

No build step or dependencies — it's plain HTML/CSS/JS.

1. Clone the repo.
2. Load it unpacked via `chrome://extensions` (see Installation above).
3. After editing `background.js`, click the refresh icon on the extension's card in `chrome://extensions` to reload the service worker. Editing popup/options/dashboard files just requires reopening them.

## Releasing a new version

This repo includes a GitHub Actions workflow (`.github/workflows/release.yml`) that automatically zips the extension and attaches it to a GitHub Release whenever a version tag is pushed:

```bash
# bump "version" in manifest.json first, then:
git tag v1.0.1
git push origin v1.0.1
```

## License

Released under the [MIT License](LICENSE).
