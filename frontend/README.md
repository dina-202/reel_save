# ReelSave desktop renderer

React components, CSS design tokens, and visual assets for the Electron window.

Install renderer dependencies from the repository root:

```powershell
npm ci --prefix frontend
```

Build and open the desktop app from the root:

```powershell
npm run prepare:runtime
npm run desktop
```

Vite compiles the renderer into `frontend/dist`; Electron loads the compiled interface and connects it to the authenticated bundled engine. Native clipboard and application updates use the restricted preload bridge in `desktop/preload.cjs`.

Use `npm run build:desktop` at the root to package the Windows installer. See [DESKTOP.md](../DESKTOP.md) for the full development and release workflow.
