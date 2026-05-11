# Android Shell

The `android/` directory is the committed Capacitor native shell for Android TV and Fire TV style APK builds.

Keep app code in `src/`, target configuration in `devices/`, and Android-only launch metadata in `android/`. Generated
Gradle outputs, copied web assets, and Capacitor generated asset manifests stay ignored by `android/.gitignore`.

The source of truth for the web bundle is `dist/firetv/`, produced by:

```bash
pnpm build:firetv
```

The native shell is refreshed with:

```bash
pnpm firetv:sync
```

Build the debug APK with:

```bash
pnpm firetv:apk
```
