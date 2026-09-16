# ReelSave

A Windows desktop app for saving videos as MP4 and audio as MP3.

[Download the Windows installer](https://github.com/dina-202/reel_save/releases/latest)

## Install and use

1. Download the latest `ReelSave-Setup` installer from GitHub Releases.
2. Run the installer and open the ReelSave desktop shortcut.
3. Choose MP4 video or MP3 audio, select a quality, and set your download location.
4. Paste one link to download immediately, or paste up to 50 links on separate lines for a bulk queue.

ReelSave sets up Python, yt-dlp, FFmpeg, and Node automatically. On the first launch, it downloads and verifies the signed download engine once. No separate dependencies are needed. The installer targets Windows 10/11 x64.

## Features

- MP4 video with a 1080p or 480p preference, including portrait reels. Uses the nearest available quality when the source has no matching size.
- MP3 audio at 128 or 320 kbps.
- A saved download location set by direct path or a native folder browser, with no save popup for each file.
- Paste-to-download and sequential bulk downloads of up to 50 links per batch.
- A glowing update button when a newer downloader or app version is available.
- Separate yt-dlp updates and signed application updates through GitHub Releases.
- Smaller background app updates with silent installation, automatic restart, and a post-update success check.
- Privacy-filtered local diagnostics with a preview before opening a public GitHub report.

Source availability and platform restrictions can affect individual downloads. Keep ReelSave open until your download or update finishes.

## Downloads and folders

ReelSave initially uses your Windows Downloads folder. Enter a full folder path and click **Save path**, or click **Browse** to choose one. The setting is remembered in `%APPDATA%/ReelSave/settings.json`. Completed files go directly there, and an existing file is preserved by adding `(1)`, `(2)`, and so on to the new filename.

Pasting with **Ctrl+V** or the **Paste** button starts the download immediately. A link typed or edited manually starts only when you click **Download**. For bulk downloads, copy one link per line and paste the list; ReelSave processes the queue one at a time and continues after an individual failure.

## Updates

Open **Update details** to check downloader and app versions. Downloader updates apply without restarting. App updates download in the background and are verified before **Restart & update** becomes available. ReelSave then closes briefly, installs silently, reopens, and confirms the new version started successfully. The large download engine lives in the ReelSave data folder and is reused, so later app-only updates do not replace it. Version 1.0.5 performs a one-time engine setup during this migration and removes obsolete per-version engine copies after a healthy start.

## Reporting problems

Click **Report a problem** below the download box. ReelSave automatically keeps up to 20 distinct, privacy-filtered diagnostic records on your PC. Select a report, review its exact contents, then click **Open GitHub report**. Sign in to GitHub and submit the issue in your browser. Opening the form does not submit it. Issues and the submitting GitHub username are public.

Reports contain only software versions, Windows version and architecture, the failing step, a fixed error category, a platform name, format, quality and HTTP status when known. Video URLs and IDs, titles, account names, local file paths, cookies, tokens, raw errors and stack traces are excluded. Unrecognized errors use a generic category; we may need a follow-up description to reproduce them.

Diagnostics are stored in `%APPDATA%/ReelSave/diagnostics.json` and can be cleared in the report preview. Existing `backend.log` and `desktop.log` stay local and are never attached. No reports are transmitted automatically; an automatic reporting service is not configured.

## Development

See [DESKTOP.md](DESKTOP.md) for building the Windows installer, running checks, and signing releases.

- `desktop/`: Electron window, native integrations, and app updater.
- `frontend/`: React renderer and visual assets for the desktop window.
- `backend.py`: media extraction and conversion engine.
- `desktop_server.py`: authenticated private connection between Electron and the engine.
- `updater.py`: bundled downloader updates and operation coordination.
- `scripts/`: runtime preparation, packaging, signing, and verification.

The installer does not yet have a Windows publisher certificate; Windows may display an unknown-publisher notice. Update manifests are signed separately and checked by the app.

## License

MIT
