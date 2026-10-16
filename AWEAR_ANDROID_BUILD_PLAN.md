# AWEAR Android demo: agreed scope and five-hour build plan

Requirements clarified on 16 October 2026. This is a build plan, not a record of completed implementation.

The original `AWEAR__mobile_app.md` remains the detailed feature and design reference. This document replaces its browser architecture and its real-hardware assumptions for the current demo. Where they disagree, the decisions recorded here apply. The original document's instructions to build without questions, its reference to a demo "tomorrow", and its browser setup commands are not current requirements.

## 1. Confirmed scope

| Decision | Current build |
| --- | --- |
| Platform | Android phone; React Native with TypeScript. |
| Time budget | Five hours of implementation, with packaging and verification included. |
| Helmet and sensors | Fully simulated. Hardware and firmware are not ready. Preserve the specified packet format and device behaviour for later integration. |
| Ride | Simulated movement along road geometry; no continuous GPS tracking. |
| Background operation | Outside the core deadline. Pause the simulation when the app leaves the foreground and resume safely. Keep the screen awake during a foreground ride. |
| Presenter | Hidden panel inside the phone app. No laptop control interface or keyboard shortcut. |
| Persistence | Save onboarding completion and simple preferences locally. Current ride and alert history remain in memory. No account, backend, database or cloud sync. |
| Routes | Swargate is the rehearsed demo destination and the only destination with bundled offline routes. The other three original destination chips may use the same online route service; no extra offline datasets. |
| Air numbers | Compute from one consistent model. Formulas and calculated categories take precedence over example numbers. |
| School fan | Use the explicitly accepted rule in section 4. A school alone does not force High. |
| Telegram and IBM | Telegram preview and modelled forecast/action content are core. Real Telegram sending and IBM integration are outside the core build. |

The supported demo is a locally installed app with bundled JavaScript, fonts, illustrations and Swargate route data. Online map tiles and optional route requests improve it, but do not gate the main workflow.

## 2. Native replacements and trade-offs

| Browser requirement in the reference | Android implementation |
| --- | --- |
| Browser/PWA, Vercel or Netlify | Expo development build for iteration; a locally built, sideloadable APK for presentation. No web deployment is required. |
| Web Bluetooth device picker and GATT | `SimHelmetLink` now. Keep a small `HelmetLink` contract and packet parser so a native BLE transport can be added later. Do not request Bluetooth permissions or claim a real connection in this build's Data sources panel. |
| Leaflet and CARTO tiles | Native MapLibre renderer with a local style, optional CARTO raster tiles, and separate GeoJSON layers for cells, routes, riders and zones. Keep visible map attribution. |
| Framer Motion and CSS | React Native Reanimated for motion; native styles for layout and shadows. |
| Browser SVG and lucide-react | react-native-svg and lucide-react-native. |
| Fontsource web fonts | Bundle Plus Jakarta Sans and Noto Sans Devanagari font files and load through expo-font. Include their licenses. |
| Browser storage | AsyncStorage for versioned, non-sensitive preferences only. |
| Browser wake lock | expo-keep-awake while the active ride is visible in the foreground. |
| Browser vibration and reduced motion | React Native Vibration and the Android accessibility reduced-motion setting. |
| Desktop phone frame | Full-screen Android UI, safe-area insets, Android Back handling and scrollable sheets. |
| PWA offline shell | Assets and JavaScript included in the APK; offline start works without Metro or a previous online visit. |

Use Expo with native builds to reduce platform configuration work while retaining access to native libraries. Bare React Native is a valid alternative but adds manual setup without a current feature benefit. MapLibre requires a development/native build; Expo Go is not the delivery target. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) · [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/).

MapLibre was selected to keep the pollution grid in native map layers and support an explicit offline blank background. A Leaflet WebView could reproduce the web implementation, but would add a second UI runtime and a message bridge. Verify the native map in the first build, before investing in screen polish. Pin compatible versions rather than upgrading packages during the demo build. MapLibre v11 requires React Native's new architecture; compatibility must be checked against the selected Expo SDK. [MapLibre requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/).

Use a small Zustand store for selective subscriptions, i18next/react-i18next for translations, and standard Expo-compatible navigation. Avoid a custom navigation system, dependency-injection framework or generic repository layer. There is no existing application code or library convention to preserve in this folder.

## 3. Data flow and source layout

1. `SimHelmetLink` produces a version-1, 20-byte packet every 500 ms. The shared parser validates and decodes it.
2. One simulation loop combines telemetry, scenario, location and time. Pure functions calculate air values, fan requests, alerts and exposure.
3. One application store publishes a coherent snapshot. Home, Map, Routes, Alerts and the summary read that state rather than inventing separate values.
4. UI commands go through one helmet command queue. Presenter controls change the same simulator and model used by normal app interactions.
5. Route requests and preference writes stay outside model functions. Failures retain usable local state and record diagnostic context in Presenter.

Suggested layout, creating files only as their responsibility is implemented:

```text
App.tsx
app.json
src/
  screens/             Home, Map, Routes, Alerts, Settings, onboarding,
                       connection, presenter, Action Card, Telegram, summary
  components/          Shared cards, sheet, ride bar, air badge, charts
  helmet/
    HelmetLink.ts      Minimal transport contract and command types
    protocol.ts        Packet encode/decode, UUIDs and opcodes
    SimHelmetLink.ts   Device states, telemetry and simulated disconnection
  model/
    air.ts            Pollutants, AQI, bands, smoothing and forecast
    fan.ts            Eco/Smart/Always/Off decisions and reason codes
    simulation.ts     Seed, field, movement, alerts and trip integration
  state/
    appStore.ts       Shared snapshot, actions and preference persistence
  routes/
    routeService.ts   OSRM request, validation, ranking and fallback
    swargate.json     Bundled road geometry, steps and durations
  i18n/               English, Hindi and Marathi resources and initialization
  config.ts           Timings, thresholds, scenarios and default centre
  theme.ts            Colours, spacing, type and shared design tokens
assets/
  fonts/
```

Keep meaningful model/protocol tests next to their source. Do not split every small helper into its own file. `HelmetLink` is the deliberate hardware boundary; neither components nor the air model may depend on native Bluetooth APIs.

## 4. Accepted Smart fan rule

Smart retains the original Eco thresholds and minimum run time. Calculate the Eco demand first, then apply the largest relevant current-air or look-ahead demand. Look ahead 300 m along the selected route, including an approaching school or hospital zone. With no active route, use current air only.

| Worse of current and predicted air | Air-based minimum |
| --- | --- |
| Great or Good | No additional increase; use the Eco result. |
| Okay | Low, 40%. |
| Bad | Medium, 70%. |
| Very bad or Dangerous | High, 100%. |
| Active spike alert | High, 100%, in Eco or Smart. |

This table is a minimum, not an override that lowers an existing Eco demand. For example, Okay air may still run Medium because PM2.5 already crosses Eco's activation threshold. A Good school does not force High; current dirty air or an active spike can still justify High near it.

Keep Eco at Medium from PM2.5 60 upward, or 45 in sensitive mode. Turn off below 45, or 35 in sensitive mode, only after at least 120 seconds running. Retain the current Eco on/off state in the hysteresis interval. Off and Always remain explicit user modes; the Smart rule does not override them.

The seeded school demo has Very bad forecast air before arrival, so it reaches High for a visible reason. Place the fictional school along the selected Swargate route and apply its pollution to the shared field, map, route forecast and Action Card. Do not change just the fan or its label to manufacture the demonstration. The presenter can also select clean conditions to demonstrate that a Good school does not increase the fan to High.

Store the winning reason with the duty: current air, upcoming zone, or spike. Translate that reason into the "Brain says" line. Send SET_FAN only on duty changes and the ten-second armed keepalive. Base airflow and pollution removal on confirmed telemetry fanPct, not the requested target.

## 5. Demo behaviour and numerical consistency

### Helmet simulation

- Retain the original UUIDs, opcodes, flag meanings and 20-byte little-endian layout as the future firmware contract.
- Preserve boot 1.2 s, connection about 1 s, testing 4.7 s, fan test 1.5–3.5 s, arming 1.5 s, and telemetry every 500 ms.
- ARM, DISARM, SET_FAN, SELF_TEST, LOCATE, CALIBRATE and KEEPALIVE all have observable simulator behaviour. Add presenter controls for the module button and sensor availability so those paths are testable without hardware.
- Drive checklist items from telemetry progress and flags. SELF_TEST alone returns to connected and does not accidentally arm.
- Presenter Disconnect suppresses automatic reconnection. Unexpected connection loss retries after three seconds. A disconnected running simulator maintains at least 70% fan and accumulates failsafe seconds.
- Calculate the reconnect toast from the difference in failsafe counters, not time since the banner appeared. Never show a positive protection duration for an unchanged counter.
- Reject short packets, unsupported versions and invalid commands with context. Handle sequence/button wrapping and the 16-bit counters without negative durations; do not confuse a device reset with time protected.
- Data sources identifies the transport, sensors and fan as simulated. Turning off the phone's physical Bluetooth is not a valid failsafe acceptance test for this version.

### Shared air model

- Preserve the reference's sensor factors, baseline handling, fan efficiency, lag, pollutant formulas, CPCB-style table and six simple band words.
- Apply `kIn = 1` with the demo helmet. Use the parser path for simulator data without counting simulated fan removal twice.
- Calculate AQI from the maximum pollutant sub-index. Do not hard-code inside AQI 40, the word Great, 78% cleaner, a score of 80, or a route improvement of 42%.
- Make the table's integer breakpoints unambiguous: round PM2.5/PM10/NO2 to whole units and CO to one decimal before selecting and interpolating the listed interval. Clamp out-of-table concentrations at the model boundaries. Document this as a prototype convention rather than a validated instantaneous monitoring method.
- Clean-Air Score remains `clamp(100 * (1 - averageInsidePm25 / 60), 0, 100)`. An inside average of 24 therefore scores 60. Breaths, school-zone time and distance derive from this ride.
- Calculate time-weighted averages; guard zero exposure duration and zero outside concentration. App-only rides have no inside exposure, helmet score or cleaned-breath claim; show outside exposure, time and distance instead.
- Apply display smoothing before deriving the displayed AQI/category/cleaner values, so those values remain consistent. Control and spike detection use the timely underlying model, not delayed visual animations. Preserve the spike exception to the normal one-band-per-second transition limit.
- Maintain one seeded random source family for the model, separate from decorative particles. Rendering or switching tabs must not change the simulated weather.
- Preserve the original wall-clock-driven hourly profile and separate 1x/4x/10x movement multiplier. Reset returns seed, route and control state to the start; exact replay tests inject a fixed clock. Movement acceleration does not multiply breaths or real elapsed time.
- Give spike activity a bounded end (the reference's 15 s rise and 40 s decay), distinct from the 60 s alert debounce. A historical alert in the feed must not hold the fan at High forever.
- When it is past 18:00, search the next day's daytime window for the cleanest hour and label it tomorrow. Handle day rollover in both the forecast and hour slider.

### Foreground lifecycle

Keep the screen awake during an active foreground ride. If Android backgrounds the app or the user locks the phone, pause demo progression and mark it paused on return; resume through a clear action. Do not fabricate exposure samples for the period when it was inactive. Cancel duplicate timers and route requests during cleanup. If the process is killed, start a fresh session with saved preferences; do not pretend to restore an in-progress trip.

Foreground keep-awake is a small part of the core build, separate from reliable background services, BLE and location tracking. [Expo KeepAwake](https://docs.expo.dev/versions/latest/sdk/keep-awake/).

## 6. Screen and feature coverage

| Reference area | Five-hour implementation |
| --- | --- |
| First launch | Three languages, three short onboarding cards, helmet/app-only choice and simulated connection sequence. |
| Home | Air hero, pollutant details, inside/outside tiles, cleaner badge, fan modes, Brain says, self-check, Locate, forecast and start-ride action. |
| Helmet self-check | Checklist and progress from shared telemetry; simulator button can arm/disarm independently of the UI button. |
| Map | 100 m pollution cells over the original 6 km square; 40 moving rider dots; city stations; all four named zones; legend; hour slider; cell and zone sheets. |
| Routes | Two or three Swargate options, road names, durations, coloured route previews, computed air comparison and cleanest-within-five-minutes selection. Other original destinations share the online request path only. |
| Active ride | Moving rider, road name, cross-screen ride bar, timer, school entry, spike and Stop. Stop disarms the simulator and computes one summary. |
| Alerts | All five reference types, cooldowns, translated toast and vibration. Sensitive mode advances air-severity triggers by one band; it does not change zone geometry or invent spike events. |
| Action Card | Zone/time, actions now/this week/last week and Rider/School/Hospital/Parent wording. The modelled content and historical claim are listed as such in Data sources. |
| Telegram | In-app preview with the card and selected-language message. No external message is sent in the core build. |
| Summary | Calculated score for helmet rides, air comparison, cleaned breaths, school time, mapped distance and exposure colour strips. |
| Settings | Language, sensitive mode, default detail visibility, helmet simulator controls, How AWEAR decides, About and version. |
| Presenter | 1.5 s logo long-press or five version taps. Scenario, movement speed, spike, school entry/rush, clear air, disconnect/reconnect, reset and live Data sources. Telegram tab reports preview-only status. |
| Design | Original colours, typography, radii and air-band palette. Bundled fonts, flexible translated text, native sheets, breathing/airflow/count-up motion and reduced-motion support. |

The main screens retain the reference's presentation style. About keeps "Prototype build · some data is modelled". Presenter must clearly disclose that no live sensor, fleet, city-station, IBM model or Telegram delivery is being used. The forecast and AI attribution are prototype presentation content, not evidence that an external model ran.

## 7. Map, routing and performance

1. Fetch real road geometry and steps for Swargate while preparing the app, then bundle three verified route alternatives. The app can demo them with no network. Preserve the reference fallback durations of 18, 21 and 19 minutes as modelled estimates and disclose their provenance in Presenter.
2. Optionally refresh using OSRM with a bounded timeout. Validate coordinates, step metadata and nonempty geometry; accept two valid alternatives. Try one bounded via-point request if needed, then retain bundled routes. Never fabricate an online route or silently substitute Swargate for a different destination.
3. Lock the active route for the duration of a ride. Ignore late responses for a previous destination or session. Do not change route geometry while the rider is moving along it.
4. Derive route scores from the same field at predicted arrival times. Any demo traffic hotspot must also affect the map and Home when the rider enters it. Compare average exposure concentration for "% cleaner air" and retain integrated exposure separately; do not mix denominators.
5. Online-only destinations show a brief unavailable state and allow choosing Swargate when the network fails. The main Swargate workflow remains fully usable.
6. Load a local map style with a plain background and local overlays first. Network tile failure must not remove cells, routes or zones. Add attribution when using external tiles/geometry; avoid a remote style whose failure blanks the entire map.
7. Update the model at 10 Hz, but avoid rebuilding all 3,600 map polygons or every screen on each tick. Keep cell geometry stable, update visible data at a lower cadence and animate rider position separately. Map labels and station comparisons must reference model values.
8. Forecast profiles reuse the field function. Cache stable cell geometry/hour profiles where useful; key invalidation to scenario and centre changes. Do not add a general caching layer.

## 8. Deferred work and boundaries

The following are explicitly outside the core five-hour build, rather than hidden incomplete features:

- Real BLE scanning, pairing, notifications, writes, permission prompts and firmware validation. Preserve the protocol boundary for that next phase.
- Continuous GPS tracking and genuine background monitoring, foreground services or notifications while the app is inactive.
- Accounts, server storage, long-term ride history, cloud sync and public pollution aggregation.
- Live IBM inference, verified sensor AQI and real Telegram delivery.
- Offline route packages beyond Swargate, a laptop presenter dashboard, iOS and web/PWA deployment.

One-time "Use my location" can be added after the main demo passes: request foreground location only on tap, use it to recenter and request routes, and retain Pune if denied. The seeded Swargate demo remains available. This is a lower-priority convenience, not live GPS riding.

Background operation is reserved for a later phase rather than squeezed into unverified last-minute work. If there is spare time, spend it first on physical-phone checks, translation layout and recovery tests.

## 9. Five-hour implementation order

These are time budgets and checkpoints, not a guarantee that native dependency downloads or device issues will finish on schedule. Identify setup failure at the start, not at packaging time.

| Elapsed time | Work | Checkpoint |
| --- | --- | --- |
| 0:00–0:35 | Bootstrap Expo/TypeScript, compatible dependencies, JDK/SDK, navigation, native map and initial Android compilation. | App and map render on the emulator; the native build path is proven. |
| 0:35–1:30 | Packet parser, simulator, shared model, fan rules, state, preferences and focused unit tests. | Connection → self-check → running → disconnect → reconnect works independently of polished screens. |
| 1:30–2:25 | Home, helmet controls, self-check, onboarding, design tokens and shared UI. Set up all translation keys while building. | The core helmet story is navigable and consistent. |
| 2:25–3:25 | Pollution map, bundled routes, route ranking, ride movement, zone look-ahead and summary integration. | Swargate ride and Stop work online and offline. |
| 3:25–4:10 | Alerts, Action Cards, Telegram preview, Presenter, Settings and complete Hindi/Marathi resources. | Presenter can demonstrate spike, school rush, disconnect and language switch. |
| 4:10–5:00 | Type/lint/test checks, Android UI walkthrough, translation overflow fixes, offline APK build and demo rehearsal. | APK launches without Metro, demo script passes, limitations are recorded. |

If the schedule slips, reduce decorative animation detail before cutting the simulator state machine, number consistency, native packaging, language coverage or the demonstrable workflow. Report any omitted feature explicitly instead of marking it done.

## 10. Verification and delivery

Automated checks cover meaningful behaviour:

- Packet round trip; malformed packets; unsupported versions; integer boundaries and wrap behaviour.
- ARM versus test-only timing; button-driven state changes; duplicate commands; disconnect during self-check; reconnect counter difference.
- Eco hysteresis and 120 s runtime; sensitive thresholds; Good school not forcing High; Very bad ahead requesting High; Off/Always remaining authoritative; expiry of spike override.
- AQI at every breakpoint, bounded concentrations, zero baselines, demo inside factor, calculated score and weighted exposure with zero-duration handling.
- Deterministic reset with a fixed clock, route interpolation, route selection within the five-minute limit, zone entry/debounce and stale network response rejection.
- Identical translation-key sets across all three languages.

Manual Android acceptance:

1. Fresh install and offline launch; first-run language and onboarding; app-only and helmet paths.
2. Connect, arm checklist, fan mode change, sensor spike, simulated hardware-button arm/disarm and test-only command.
3. Start Swargate ride, see the moving dot and current road, approach the polluted school, observe justified High and one zone-entry alert.
4. Press School rush, open the Action Card, switch audience and open Telegram preview.
5. Disconnect through Presenter, wait, reconnect and verify the reported simulated failsafe duration.
6. Stop once, verify the simulator fan stops and summary values agree with the recorded session; empty/very short rides do not produce invalid numbers.
7. Switch to Hindi and Marathi on narrow Android layouts, including sheets, cards and toasts; check clipping, Back navigation and reduced motion.
8. Disable the network, repeat the Swargate ride and confirm usable map overlays. Background/resume the app and confirm deliberate pause with no fabricated trip progress.
9. Relaunch and verify preferences survive while session data resets. Clear or corrupt stored preference data and verify safe defaults with diagnostic context.

Planned project commands: `npm run typecheck`, `npm run lint`, `npm test`, `npx expo-doctor`, and the configured Gradle APK build. Test script names will be created with the application. A successful JavaScript bundle alone is not Android build verification.

Deliver the APK, source code, a short setup/demo README and actual verification results. Package the JavaScript and assets into the APK and test with Metro stopped. Use demo signing for sideloading; store distribution is outside this request. Do not claim physical hardware or physical-phone verification when only the simulator/emulator was available. [Expo local release builds](https://docs.expo.dev/guides/local-app-production/).

## 11. Environment findings

Checked during planning:

- The workspace contains the original Markdown specification and no existing app or Git repository.
- Node 24.13.1 and npm 11.8.0 are installed.
- Android SDK tools and the Pixel_8 emulator definition are available. No Android device was attached through adb at the time of inspection.
- The shell resolves Java 8, while Android Studio includes JDK 21. Set a build-specific compatible JDK before compiling. React Native recommends JDK 17; validate the generated Gradle toolchain and use a compatible JDK without changing the user's global Java installation unnecessarily. [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment).
- Installed SDK platforms include 36 and 36.1. Validate the selected Expo template's exact requirements and install a missing SDK component only if needed.

No app code, package installation, native compilation or acceptance test has been completed by this planning document.
