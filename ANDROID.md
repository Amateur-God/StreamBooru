# StreamBooru on Android (Capacitor, JavaScript)

This adds a native Android app that reuses the `renderer/` UI. No TypeScript required.

## Prerequisites
- Node.js 18+ (recommended 20)
- Android Studio (SDK + platform tools)
- Java 17 (Temurin/OpenJDK)
- USB debugging enabled on device (or use an emulator)

## One-time setup

1. Install Node deps:
   ```
   npm ci
   ```

2. Install Capacitor runtime + plugins (JavaScript):
   ```
   npm i @capacitor/core @capacitor/android @capacitor/browser @capacitor/filesystem @capacitor/share @capacitor/app
   npm i -D @capacitor/cli
   ```

3. Add Android platform:
   ```
   npx cap add android
   ```

4. Sync web assets:
   ```
   npx cap sync android
   ```

> If your renderer entry file is not `renderer/index.html`, update `webDir` in `capacitor.config.js` accordingly.

## Development

- Ensure the renderer does not call Electron APIs directly. Use `src/platform.js`:
  - `Platform.openExternal(url)`
  - `Platform.saveImageFromUrl(url, filename)`
  - `Platform.share({...})`
  - `Platform.getVersion()`

- To run on a device/emulator:
  ```
  npx cap open android
  ```
  Then click “Run” in Android Studio.

- If you change files under `renderer/`, re-sync:
  ```
  npx cap sync android
  ```

## Building

- Debug APK:
  ```
  (cd android && ./gradlew assembleDebug)
  ```
  Output: `android/app/build/outputs/apk/debug/*.apk`

- Release AAB for Play Store:
  1. Create/upload a keystore and configure signing in Gradle or pass vars from CI.
  2. Build:
     ```
     (cd android && ./gradlew bundleRelease)
     ```
     Output: `android/app/build/outputs/bundle/release/*.aab`

## Permissions

- INTERNET is included by default.
- Image saving uses scoped storage via `@capacitor/filesystem` to `Pictures/StreamBooru/`.
- For some Android versions, call `ensureStoragePermission()` before saving if you hit permission errors.

## CI

- See `.github/workflows/android.yml`.
- Tag a release (`vX.Y.Z`) to produce artifacts, or run manually via “Run workflow”.

## Troubleshooting

- Blank screen:
  - Run `npx cap sync android` after changing `renderer/`
  - Check console (Logcat) for CSP or network errors
- Mixed content (HTTP):
  - Prefer HTTPS. If you must allow HTTP, configure network security in the Android project.
- Electron-specific code:
  - Replace direct IPC or `require` calls in the renderer with `Platform.*` or guard with `Platform.isElectron()`.
