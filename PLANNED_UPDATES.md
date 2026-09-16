# Planned updates

Authorized for implementation on September 9, 2026. Included in version 1.0.3.

- Silent app updates: verified updates install without the setup wizard and restart ReelSave. The first installation keeps the wizard. An update launched by 1.0.2 still follows the old behavior once.
- Privacy-filtered diagnostics: automatically capture fixed diagnostic fields locally; let users preview and open a public GitHub issue manually. Never attach raw logs or video links.
- Automatic submission deferred: user selected a manual report button because no reporting server is available. No credentials are embedded in the app.

Implemented in version 1.0.5:

- Smaller app-only updates: keep the large media runtime in a shared per-user folder and distribute it as a separately signed package.
- Smoother restarts: show an update transition, install silently, relaunch automatically, and confirm successful startup.
- Stable desktop icon: keep the shortcut icon outside the replaceable app directory and avoid the installer's global desktop icon refresh.
