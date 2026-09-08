# ReelSave for Windows

The Windows x64 installer bundles Electron, Python, yt-dlp, FFmpeg/ffprobe, and Node. Users need no command prompt, browser tab, or separate runtime installation. Windows 10/11 x64 is the build target. An authenticated loopback server runs privately behind the desktop window on an automatically assigned port.

## Build locally

```powershell
npm ci
npm ci --prefix frontend
npm run prepare:runtime
npm run test:desktop
npm run build:desktop
npm run sign:release
```

The installer is `release/ReelSave-Setup-1.0.1.exe`. Build resources and outputs are ignored by Git. Runtime downloads come from Python.org, Nodejs.org, PyPA, and Gyan's FFmpeg builds. Bundled licenses and source references are in `resources/runtime/licenses`.

## Two separate update paths

- **Downloader updates:** the downloader button upgrades yt-dlp and its support packages in a writable per-user bundled Python copy. No app restart is needed.
- **App updates:** Electron checks GitHub Releases. Users download an available version, then click **Restart & install**. Downloads and yt-dlp updates must finish first. The app verifies an Ed25519-signed release manifest and the installer's SHA-256 before enabling installation. Automatic installation on quit is disabled so this verification cannot be skipped.

App settings and runtime state live under `%APPDATA%/ReelSave`. A new application version receives a fresh copy of its matching runtime. Downloaded videos are saved to the location the user chooses and are not deleted by upgrades or uninstall. The installer is per-user by default.

## GitHub Releases

The public app update feed is [dina-202/reel_save](https://github.com/dina-202/reel_save/releases). No GitHub token is bundled with the app. Local builds do not publish automatically; releases are published separately after verification.

## Keep the signing key

The private update key is `.release-keys/update-private.pem`, excluded from Git and installers. Back it up privately and retain it for future releases. `desktop/update-public-key.pem` is the matching public key shipped inside the app. Do not generate a new key for each release: existing installations trust this key.

These update signatures are separate from Windows Authenticode signing. The local installer has no Windows publisher certificate, so Windows may show an unknown-publisher/SmartScreen warning. A publisher certificate can be configured later through electron-builder's signing settings.

## Publish a new version later

1. Change the root `package.json` version (for example `1.0.2`) and refresh the lockfile with `npm install --package-lock-only`.
2. Run the build and signing commands above.
3. Create a GitHub Release tagged exactly `v1.0.2`.
4. Upload the installer `.exe`, its `.blockmap`, `latest.yml`, `release-manifest.json`, and `release-manifest.sig` from the same build. Do not modify the installer after signing the manifest.
5. Publish the release when ready. Installed copies check on launch and hourly, or when the user clicks **Check app updates**.

`.github/workflows/release.yml` automates the build and creates a **draft** release for version tags. Before using it, add the existing private key as the repository Actions secret `REELSAVE_UPDATE_PRIVATE_KEY`. Do not paste it into source files or commit it. CI does not publish the draft automatically.

## Checks

```powershell
build\runtime\python\python -m unittest discover -s . -p "test_*.py"
npm run test:desktop
python scripts/smoke-runtime.py release/win-unpacked/resources --live
```

The runtime smoke check uses only packaged binaries, tests desktop API authentication, validates tools, and optionally downloads a short public YouTube video as MP3 and MP4. Full update-over-GitHub testing requires a second publicly published version. The initial release establishes the feed; a genuine version upgrade can be tested when the next version is published.
