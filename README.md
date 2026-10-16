# AWEAR Android prototype

A local Expo / React Native Android app for the AWEAR air-awareness demonstration. All helmet hardware is simulated. JavaScript, illustrations, fonts, translations and three Swargate road routes are bundled into the release APK. Street tiles and optional OSRM refreshes use the network; the Swargate workflow does not require it.

The current build is English-only, following the updated demo scope. Language selection is hidden and saved Hindi/Marathi choices fall back to English without losing other preferences. The translation resources remain in the source; set `MULTILINGUAL_ENABLED` in `src/config.ts` to `true` when restoring and verifying those languages.

The delivered build defaults to the local map with pollution cells, bundled roads, zones and riders. CARTO now requires a basemap key. To enable its optional street tiles, copy `.env.example` to `.env`, set `EXPO_PUBLIC_CARTO_API_KEY`, and rebuild. This is a public client configuration value included in the APK, so use a provider key intended for client apps. See [CARTO's basemap setup](https://www.carto.com/basemaps/apikey/index.html).

## Install and develop

Use Node 22.13+ (tested here with Node 24), npm, JDK 17 and Android SDK 36. No account, cloud build, Bluetooth permission or API key is required.

```powershell
npm ci
npx expo prebuild --platform android --no-install
npm run android -- --no-bundler
npm start -- --dev-client --localhost
```

Select JDK 17 in the current shell before running the development build (`JAVA_HOME` and its `bin` directory on `Path`). The release build script selects the installed JDK itself. This is a native development build, not Expo Go. Use `adb reverse tcp:8081 tcp:8081` for the Android emulator. Keep the app in the foreground while demonstrating a ride.

The start script prefers IPv4 and advertises `127.0.0.1` so Windows localhost binding works with ADB reverse forwarding. For LAN development, set `REACT_NATIVE_PACKAGER_HOSTNAME` to the computer's LAN address. Metro excludes generated native build folders and uses two workers to avoid competing with the emulator and Gradle for memory.

The workspace `.npmrc` selects the npm mirror used when the default registry connection was resetting during setup. `package-lock.json` records exact artifacts and integrity hashes. Use an accessible registry for fresh installations if necessary.

## Build a standalone APK

```powershell
npm run typecheck
npm run lint
npm test
npx expo-doctor
npm run build:android
```

The PowerShell build script sets a process-local JDK, synchronizes native configuration with Expo Prebuild, and builds a release APK for arm64 Android phones and the x86_64 emulator. It copies the result to `dist/AWEAR-demo.apk` and writes `dist/AWEAR-demo.apk.sha256`. The delivery also includes `dist/AWEAR-source.zip` with source, locked dependencies, build scripts and verification screenshots; generated native files and dependencies are excluded. Expo's generated demo keystore signs this sideloadable build; it is not store signing.

The native Android directory is generated and ignored by version control. Keep native configuration in `app.json`; the build script regenerates it and copies the bundled font licenses into the APK assets.

```powershell
adb install -r dist/AWEAR-demo.apk
adb shell am start -n com.awear.demo/.MainActivity
```

The final offline acceptance check must stop Metro, disable network access, force-stop the app and relaunch it. A JavaScript export is not a substitute for this check. Actual results and any unfinished checks are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Rehearse the demo

1. Continue through the three English onboarding cards. Select the AWEAR module, then **Connect helmet**. Both connection buttons use `SimHelmetLink`.
2. On Home, tap **Arm & self-check**. The 4.7-second test and 1.5-second arming sequence follow telemetry. Inside air settles with the confirmed fan duty. The AQI, words and cleaner percentage are calculated together.
3. Open Routes. Swargate has three bundled alternatives. The app selects the cleanest option within five minutes of the fastest. Tap **Start ride on this route**.
4. Hold the AWEAR logo for 1.5 seconds to open Presenter. Select 4× or 10× movement, then **Approach school zone**. Close Presenter to see the route and school. The same pollution field drives the High request, map and Action Card.
5. In Presenter, trigger **Spike outside air** or **School rush**. School rush opens the Action Card. Switch Rider / School / Hospital / Parent wording and open the Telegram preview. Nothing is sent externally.
6. In Presenter, **Disconnect helmet**, wait, and **Reconnect**. The simulator keeps at least 70% fan while disconnected. The protection toast uses the device failsafe-counter difference. **Unexpected connection loss** automatically reconnects after three seconds.
7. Stop the ride once. The summary uses time-weighted exposure, confirmed fan telemetry, elapsed time and distance along the actual route. App-only rides omit inside exposure, helmet score and cleaned-breath claims.
8. Settings controls sensitive mode, detail visibility and helmet mode. Five rapid taps on the version also open Presenter. Its Data sources tab shows protocol values, simulator flags, source provenance and diagnostic errors.

Backgrounding or locking the phone pauses the demo. Return and tap **Resume**; inactive time is not included in exposure. Preferences survive relaunch, while rides and alerts start fresh. Presenter **Reset demo** resets seed, route, simulator and controls and preserves preferences.

During an active ride, **Clear air** changes the shared field while retaining the locked route. When no ride is active, it moves the demonstration to Gulmohar Park. Presenter jumps do not add exposure or mapped distance.

## Source layout and decisions

- `src/helmet`: the 20-byte v1 protocol, minimal transport interface, one command queue, simulator and tests. Add a native BLE implementation at this boundary later; UI/model code has no Bluetooth dependency.
- `src/model`: pure air, fan, field, geometry, movement, exposure and alert calculations. One seeded family and injected clocks make behavior testable.
- `src/state`: one Zustand store, foreground lifecycle, commands, route requests and serialized preference writes. Only versioned non-sensitive preferences use AsyncStorage.
- `src/routes`: validated OSRM requests and bundled geometry with source URLs and original durations. The offline 18/21/19-minute values are modelled demo estimates. Run `node scripts/prepare-routes.mjs` to fetch new road geometry deliberately.
- `src/screens`, `src/components`: native navigation, reusable cards, SVG illustrations and MapLibre overlays. Grid geometry is stable; visible values refresh every five seconds while the model runs at 10 Hz and the UI publishes at 2 Hz.
- `src/i18n`: English messages with Hindi/Marathi resources preserved for later. Place names and protocol identifiers remain in English; numbers use Latin digits. Font licenses are alongside the bundled font files.

AQI is a prototype CPCB-style display convention: PM2.5/PM10/NO₂ are rounded to whole units and CO to one decimal before table selection and interpolation. Concentrations are bounded and AQI uses the highest pollutant sub-index. Control/spike logic uses the timely model; display values are smoothed before AQI, bands and cleaner percentages are derived. Example numbers in the original reference do not override these formulas.

Smart computes Eco demand first, then applies current/300 m look-ahead minimums. A Good school does not force High. Eco retains 60/45 µg/m³ hysteresis (45/35 when sensitive) and a 120-second minimum run. Off and Always remain explicit choices. Modelled spike activity ends after its 15-second rise and 40-second decay; historical alerts do not hold the fan on.

## Scope

No real BLE, firmware validation, GPS ride tracking, background monitoring, account, backend, fleet measurements, station feed, IBM inference or Telegram sending is included. IBM presentation labels, the Action Card delivery narrative and last-week claim are disclosed as modelled content in Presenter. No real messages are sent. One-time location, iOS and web are deferred by the Android build plan.

Official setup references: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [Expo local release builds](https://docs.expo.dev/guides/local-app-production/).
