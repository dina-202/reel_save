# ReelSave

**A fast, free Windows desktop app for downloading videos and audio from Instagram, TikTok, YouTube, and Facebook.**

Paste a link, choose your format and quality, and ReelSave handles the rest.

[**⬇ Download ReelSave for Windows**](https://github.com/dina-202/reel_save/releases/latest)

> Windows 10/11 • 64-bit

---

## Supported Platforms

* Instagram Reels
* TikTok
* YouTube
* YouTube Shorts
* Facebook videos
* Facebook Reels

---

## Features

### Video & Audio Downloads

Download videos as **MP4** or extract audio as **MP3**.

Video options include:

* 1080p preference
* 480p preference
* automatic nearest-quality fallback
* portrait Reel/Short support

Audio options:

* 128 kbps MP3
* 320 kbps MP3

### Bulk Downloads

Paste up to **50 links at once**, one per line.

ReelSave processes them sequentially and continues even if one item fails.

### Choose Your Download Folder

Set your preferred download location once and ReelSave remembers it.

Files are downloaded directly to that folder without showing a save dialog every time.

Existing files are never overwritten — ReelSave automatically adds `(1)`, `(2)`, and so on when necessary.

### Automatic Downloader Updates

ReelSave can update **yt-dlp and its support packages independently** without requiring an application reinstall or restart.

### Application Updates

ReelSave checks GitHub Releases for new versions.

When an update is available:

1. Download it in the background.
2. ReelSave verifies the signed release manifest and installer hash.
3. Click **Restart & update**.
4. ReelSave installs the update and launches again automatically.

### Privacy-Focused Diagnostics

If something fails, ReelSave can create a privacy-filtered diagnostic report.

Before anything opens on GitHub, you can preview exactly what will be included.

Diagnostic reports exclude:

* video URLs
* video IDs
* titles
* account names
* local file paths
* cookies
* authentication tokens
* raw logs
* stack traces
* persistent device identifiers

Nothing is submitted automatically.

---

## How to Use

1. Download the latest ReelSave installer.
2. Install and open ReelSave.
3. On first launch, allow ReelSave to set up its download engine.
4. Choose **MP4** or **MP3**.
5. Select your preferred quality.
6. Choose your download folder.
7. Paste a supported video URL.
8. Download.

You can also paste multiple links at once to create a bulk queue.

---

## No Manual Dependencies Required

Users do **not** need to install:

* Python
* yt-dlp
* FFmpeg
* Node.js

ReelSave downloads and verifies its required runtime automatically on first launch.

The runtime is stored separately from the application so normal ReelSave updates remain relatively small.

---

## How ReelSave Works

ReelSave uses:

* **Electron** for the Windows desktop application
* **React** for the interface
* **Python + FastAPI** for the local media engine
* **yt-dlp** for media extraction
* **FFmpeg** for media processing and conversion
* **Node.js** for yt-dlp's JavaScript support

The media backend runs locally on your computer behind an authenticated loopback connection.

Media is streamed directly from the local backend to the selected download folder rather than being stored in the Electron renderer.

---

## Updates & Security

ReelSave has two independent update systems.

### Downloader Updates

yt-dlp and related packages can be updated without restarting ReelSave.

### ReelSave Updates

Application releases are distributed through GitHub Releases.

ReelSave verifies:

* an Ed25519-signed release manifest
* the installer SHA-256 hash

before allowing an application update to install.

No GitHub token or private update key is included with the application.

---

## Download Storage

Settings and runtime files are stored under:

```text
%APPDATA%\ReelSave
```

Your downloaded media is stored only in the folder you choose.

Updating or uninstalling ReelSave does not intentionally delete your downloaded videos or audio.

---

## Reporting a Problem

Click **Report a problem** inside ReelSave.

The app stores up to 20 distinct privacy-filtered diagnostic records locally.

You can:

1. select a diagnostic
2. preview exactly what will be shared
3. click **Open GitHub report**
4. review and manually submit the issue on GitHub

Opening the GitHub page does **not** automatically submit a report.

---

## Development

Clone the repository:

```powershell
git clone https://github.com/dina-202/reel_save.git
cd reel_save
```

Install dependencies:

```powershell
npm ci
npm ci --prefix frontend
```

Run desktop tests:

```powershell
npm run test:desktop
```

Build the Windows installer:

```powershell
npm run build:desktop
```

The installer is created at:

```text
release\ReelSave-Setup-<version>.exe
```

For complete build, runtime, release-signing and update instructions, see:

[**DESKTOP.md**](DESKTOP.md)

---

## Project Structure

```text
reel_save/
├── desktop/              # Electron app and Windows integrations
├── frontend/             # React desktop interface
├── backend.py            # Media extraction and conversion engine
├── desktop_server.py     # Authenticated local backend connection
├── updater.py            # Downloader update system
├── diagnostics.py        # Privacy-filtered diagnostics
├── scripts/              # Build, runtime, signing and release tools
├── package.json
├── requirements.txt
└── DESKTOP.md
```

---

## Windows Publisher Warning

The current installer is not yet Authenticode-signed with a Windows publisher certificate.

Because of this, Windows may display an **Unknown Publisher** or Microsoft Defender SmartScreen warning during installation.

ReelSave's internal application-update manifests are signed separately and verified by the application.

---

## Disclaimer

ReelSave is intended for downloading content that you own, content you have permission to download, or content whose licensing permits downloading.

Users are responsible for complying with applicable copyright laws and the terms of service of the platforms they use.

ReelSave is not affiliated with Instagram, Meta, TikTok, YouTube, Google, or their respective owners.

---

## License

ReelSave is released under the **MIT License**.
