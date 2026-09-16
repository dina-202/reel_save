# ReelSave for Windows

The Windows x64 installer contains the Electron application. On first launch, the app downloads a separately signed runtime package containing Python, yt-dlp, FFmpeg/ffprobe, and Node, then stores it under `%APPDATA%/ReelSave/runtime/shared-v1`. Users need no command prompt, browser tab, or separate runtime installation. Windows 10/11 x64 is the build target. An authenticated loopback server runs privately behind the desktop window on an automatically assigned port.

## Build locally

```powershell
npm ci
npm ci --prefix frontend
npm run test:desktop
npm run build:desktop
npm run sign:release
```

The installer is written to `release/ReelSave-Setup-<version>.exe`. The shared engine is pinned to the signed `ReelSave-Runtime-Windows-x64-v1.zip` asset in release `v1.0.5`, so ordinary app-only releases do not rebuild or upload it. Build resources and outputs are ignored by Git.

When the runtime itself changes, run `npm run prepare:runtime`, `npm run package:runtime`, and `npm run sign:runtime-release`, then publish the runtime archive with the signed manifest. Runtime inputs come from Python.org, Nodejs.org, PyPA, and Gyan's FFmpeg builds; licenses and source references are included in the archive.

## Two separate update paths

- **Downloader updates:** the downloader button upgrades yt-dlp and its support packages in the writable shared runtime. No app restart is needed.
- **App updates:** Electron checks GitHub Releases. Users download an available version, then click **Restart & update**. Downloads and yt-dlp updates must finish first. The app verifies an Ed25519-signed release manifest and the installer's SHA-256 before enabling installation. It shows the restart state, installs silently, forces a relaunch, and records a successful startup. The app-managed desktop shortcut uses an icon stored outside the replaceable installation directory.

App settings and runtime state live under `%APPDATA%/ReelSave`. Application upgrades reuse the shared runtime instead of recopying hundreds of megabytes of tools. Downloaded videos are saved to the location the user chooses and are not deleted by upgrades or uninstall. The installer is per-user by default.

Media downloads use authenticated IPC from the renderer to the Electron main process. The main process requests the media from the loopback backend and streams it to the saved folder, so Chromium never opens a save dialog or retains the complete file in renderer memory. Folder paths are checked for an absolute Windows path and write access. Filenames from HTTP headers are reduced to a Windows-safe basename, and the destination allocator never overwrites an existing or concurrently reserved file.

## GitHub Releases

The public app update feed is [dina-202/reel_save](https://github.com/dina-202/reel_save/releases). No GitHub token is bundled with the app. Local builds do not publish automatically; releases are published separately after verification.

## Keep the signing key

The private update key is `.release-keys/update-private.pem`, excluded from Git and installers. Back it up privately and retain it for future releases. `desktop/update-public-key.pem` is the matching public key shipped inside the app. Do not generate a new key for each release: existing installations trust this key.

These update signatures are separate from Windows Authenticode signing. The local installer has no Windows publisher certificate, so Windows may show an unknown-publisher/SmartScreen warning. A publisher certificate can be configured later through electron-builder's signing settings.

## Publish a new version later

1. Change the root `package.json` version and refresh the lockfile with `npm install --package-lock-only`.
2. Run the app build and signing commands above.
3. Create a GitHub Release tagged exactly `v<version>`.
4. Upload the installer `.exe`, its `.blockmap`, `latest.yml`, `release-manifest.json`, and `release-manifest.sig` from the same build. Do not modify the installer after signing the manifest.
5. Publish the release when ready. Installed copies check on launch and hourly, or when the user clicks **Check app updates**.

`.github/workflows/release.yml` automates the build and creates a **draft** release for version tags. Before using it, add the existing private key as the repository Actions secret `REELSAVE_UPDATE_PRIVATE_KEY`. Do not paste it into source files or commit it. CI does not publish the draft automatically.

## Checks

```powershell
build\runtime\python\python -m unittest discover -s . -p "test_*.py"
npm run test:desktop
node_modules/.bin/electron scripts/smoke-desktop.cjs
python scripts/smoke-runtime.py release/win-unpacked/resources build/runtime --live
```

The runtime smoke check uses the exact runtime being archived, tests desktop API authentication, validates tools, and optionally downloads a short public YouTube video as MP3 and MP4. Full update-over-GitHub testing requires a published version.

The desktop smoke check uses an isolated profile inside `build`, captures a backend failure, exercises the report preview through real IPC, intercepts browser opening without submitting an issue, checks clearing and narrow layout, and saves preview screenshots in `build`.

## Diagnostic reporting

`diagnostics.py` classifies engine failures locally and emits only fixed diagnostic fields to the desktop host. `desktop/diagnostics.cjs` independently validates those fields before storing at most 20 distinct records in the user data directory. Public issue bodies are generated only from these fields. Raw logs, arbitrary exception text, video links and persistent device identifiers are never attached.

The report dialog displays exactly the body that will be placed in a GitHub issue form. The main process opens only the fixed repository's issue URL, accepts a local report ID rather than an arbitrary URL, and checks the calling renderer/frame. The user must sign in and submit through GitHub. There is no report server, automatic upload, or bundled GitHub credential.
