# Verification log

Implementation started on 16 October 2026. This file records actual checks; pending items are not acceptance claims.

## Automated checks

- TypeScript: passed.
- ESLint: passed with zero warnings or errors.
- Vitest: 55 tests passed in eight files. Covers protocol round trips, invalid packets/commands, counters, simulator timing and failsafe, Eco/Smart policy, AQI endpoints, smoothing, exposure, field determinism, school placement, forecast rollover, alert cooldowns, stale route responses, translations, preferences and foreground session behavior. Regression cases cover coarse simulator ticks, distinct route IDs, zero baseline reset, starting Eco's minimum run only after confirmed airflow, Stop/disarm between packets, reconnecting after a cancelled command, ARM's 35% minimum nonzero duty and loading old language preferences into the English-only build.
- Android JS/assets export: passed; a Hermes bundle and local assets were emitted.
- Expo Doctor: 20/20 checks passed. The generated Android directory is ignored; the build script synchronizes app.json through Prebuild.

## Native checks

- Pixel_8 x86_64 emulator booted; no physical Android phone was attached.
- Process-local JDK 17 selected. SDK/build tools 36 validated. Required NDK 27.1.12297006 installed by the Android build.
- Native debug compilation: passed, including MapLibre, Reanimated, Worklets and native screen libraries. Installed the x86_64 APK on the emulator.
- Native map rendering: verified the 3,600 cells, route, four zone markers, rider marker, city stations and fleet dots on Android.
- Debug walkthrough: English onboarding, simulated connection, arm/self-check, Swargate route selection/start, Presenter long-press, School rush and Action Card passed. Card background and bottom safe-area issues found during the walkthrough were fixed.
- Release APK: built successfully for `arm64-v8a` and `x86_64`, 77,165,266 bytes. APK signature verification passed (v2). Package `com.awear.demo`, version `1.0.0`, minimum SDK 24, target SDK 36. APK inspection confirmed the bundled Hermes bytecode, fonts and font licenses and no Bluetooth, location, microphone or storage permissions. Final SHA-256: `8e4073df3aaf29705c80e972de30318cda7cf464ea7d1b5a29f16582242e6302`.
- The first release compile passed; its PowerShell checksum step exposed an unavailable `Get-FileHash` command. The build script now uses .NET SHA-256, and the complete packaging command passed on a cached build.
- Offline release launch: passed after clearing app data with Wi-Fi and mobile data disabled and no listener on Metro port 8081. English onboarding, helmet/app-only choice, fonts and Swargate data loaded locally.
- Release walkthrough passed: app-only ride, native offline map and moving rider, road-name updates, visible ride bar, background pause and deliberate resume, outside-only summary, simulated connection, arm/self-check, fan Off/Smart, Locate, module-button disarm/re-arm, test-only command, calibration, keepalive and calculated helmet summary.
- Additional offline release walkthrough: Presenter school approach and School rush, School/Rider/Hospital/Parent Action Card wording and matching Telegram preview passed. Intentional disconnect stayed disconnected until Reconnect; the resulting toast reported 7 seconds of simulated protection. The longer helmet ride recorded 06:21, 11 seconds in school zones, score 69, outside/inside AQI 315/43, 86% cleaner and 89 modelled cleaned breaths.
- Layout fixes verified on Android: opaque air-card tints, flexible button labels/map height, one owner for top safe-area padding, map-marker clipping and alert toasts below the header. The ride bar remained visible across Settings, Presenter, Action Card and Telegram preview.
- Reduced-motion walkthrough used Android animator duration scale 0. Self-check/sheets and the completed summary remained usable, including an immediately resolved score. Preferences survived APK replacement and process restart; an in-progress ride did not resume after process death.
- A long rehearsal exposed repeated tab navigators and rendering of inactive stack screens. Presenter now returns to the existing Tabs route and inactive native stack screens freeze. The exact final APK was installed and checked offline: starting a ride from Presenter returned to the existing map, and holding the map header opened Presenter while ride progression continued. Unexpected connection loss automatically reconnected and showed the 4-second failsafe-counter difference.
- Presenter Data sources displayed transport/sensor simulation, bundled-road provenance, modelled IBM/Telegram content and live protocol fields. The live view showed Running, the expected 4-second failsafe counter, 2.0 packets per second and no diagnostics. Final release AndroidRuntime and ReactNativeJS error logs were empty during this check.
- Final APK map interactions passed: the hour slider displayed tomorrow after crossing midnight, and tapping a 100 m cell opened its air sheet. Selecting online-only Katraj with networking disabled showed an unavailable state and a Swargate choice; it did not fabricate a Katraj route. Stop closed the ride before this destination change.
- Emulator cold boots produced System UI ANRs. Selecting Wait allowed it to recover. This is emulator-only verification; cold-boot stalls and gesture injection make it unsuitable for a physical-phone performance claim.

## Source provenance

Three road alternatives were fetched from the OSRM public service and bundled with steps and request URLs in `src/routes/swargate.json`. OSRM geometry is derived from OpenStreetMap. Offline 18/21/19-minute durations are modelled estimates, with original OSRM durations retained as metadata.

Google Fonts Plus Jakarta Sans and Noto Sans Devanagari are bundled locally with their SIL Open Font Licenses. The renderer is MapLibre Native; the style starts with a local background and bundled roads. CARTO raster tiles are optional and have visible attribution. Android verification exposed CARTO's current key requirement, so the default build makes no tile requests. A public client key can be configured before building; keyed tiles have not been tested because no key was supplied.

## Scope and visual trade-offs

The user narrowed the current build to English only. Language selectors are hidden, old Hindi/Marathi preferences normalize to English, and the translation resources remain available behind `MULTILINGUAL_ENABLED` for a later build. Hindi/Marathi layout acceptance is outside the current delivery scope.

No physical-phone or real-helmet verification has been performed. Real BLE, GPS rides, background services, IBM execution and Telegram sending are outside this build's agreed scope.

Onboarding uses a shared helmet illustration across its three cards. Zone outlines are static. Air-card breathing, fan-driven airflow and summary score count-up are implemented; the original browser specification's detailed cross-fade, tick-drawing and zone-pulse choreography is simplified for the native prototype.

Clear air changes the shared field during a ride and retains its locked road geometry. Outside a ride, it moves the demonstration to the park. Presenter jumps deliberately add no trip distance or exposure.

## Rehearsal captures

- [English onboarding, offline](screenshots/release-01-offline-onboarding.png)
- [App-only summary](screenshots/release-06-app-only-summary.png)
- [Offline map during a helmet ride](screenshots/final-04-map-ride.png)
- [Confirmed High fan and calculated inside/outside air](screenshots/final-08-school-fan.png)
- [School Action Card](screenshots/final-09-action-school.png)
- [Parent message in Telegram preview](screenshots/final-14-telegram-preview.png)
- [Counter-based reconnect toast](screenshots/final-17-reconnected.png)
- [Calculated helmet summary with reduced motion](screenshots/final-18-summary.png)
- [Final APK offline map](screenshots/delivery-03-map.png)
- [Automatic reconnect in the final APK](screenshots/delivery-04-automatic-reconnect.png)
- [Presenter opened from the map during a ride](screenshots/delivery-05-presenter-navigation.png)
- [Data sources in the final APK](screenshots/delivery-06-data-sources.png)
- [Live packet and diagnostics](screenshots/delivery-08-packet.png)
- [Tomorrow on the hour slider](screenshots/delivery-09-hour-slider.png)
- [Map cell sheet](screenshots/delivery-10-map-cell.png)
- [Online-only destination while offline](screenshots/delivery-11-offline-destination.png)
