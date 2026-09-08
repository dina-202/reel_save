# ReelSave

A Windows desktop app for saving videos as MP4 and audio as MP3.

[Download the Windows installer](https://github.com/dina-202/reel_save/releases/latest)

## Install and use

1. Download the latest `ReelSave-Setup` installer from GitHub Releases.
2. Run the installer and open the ReelSave desktop shortcut.
3. Paste a YouTube, Instagram, Facebook, or TikTok video link.
4. Choose MP4 video or MP3 audio, select a quality, and save your file.

ReelSave includes Python, yt-dlp, FFmpeg, and Node. No separate dependencies are needed. The installer targets Windows 10/11 x64.

## Features

- MP4 video with a 1080p or 480p preference, including portrait reels. Uses the nearest available quality when the source has no matching size.
- MP3 audio at 128 or 320 kbps.
- A purple/pink desktop interface with native clipboard and file-save dialogs.
- A glowing update button when a newer downloader or app version is available.
- Separate yt-dlp updates and signed application updates through GitHub Releases.

Source availability and platform restrictions can affect individual downloads. Keep ReelSave open until your download or update finishes.

## Updates

Open **Update details** to check downloader and app versions. Downloader updates apply without restarting. App updates are downloaded and verified before **Restart & install** becomes available. Your saved files and settings remain in place.

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
