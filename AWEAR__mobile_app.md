# AWEAR mobile app: build prompt for the hackathon demo

## How to use this file

- Copy everything below the line and send it to ChatGPT (Astra) as one message. If it asks to split the work, send it the sections in order.
- Run it with npm install and then npm run dev. Open the link in Chrome on your laptop.
- To use it on a phone, deploy it to Vercel or Netlify, because Bluetooth needs an HTTPS link. Open that link in **Chrome on Android**. iPhone Safari has no Web Bluetooth, so an iPhone can only run the demo helmet.
- On demo day: switch the module on 5 minutes early so the air sensors warm up. Open the app, tap Connect, then Arm.

---

You are building **AWEAR**, the phone app for a hackathon project on "Hyperlocal Air Quality Awareness". It will be demoed live to judges tomorrow, with a real ESP32 helmet module on the table. Build the complete app in one go and do not stop to ask questions. Where this spec is silent, pick the simplest option that keeps the live demo reliable.

## 0. The one rule

A few things are **real**: the Bluetooth link to the helmet module, the module's states, the self-test timing, the fan, the module's button and the module's air sensors. Everything else is **simulated**. The simulation must be smooth, consistent and believable, so the app behaves exactly like the finished product would. Numbers must agree with each other on every screen. The main screens carry no "demo", "fake" or "simulated" labels. The truth about each data source lives in one place only: the hidden Presenter panel's **Data sources** tab, plus one line in Settings → About ("Prototype build · some data is modelled").

## 1. What is real and what is simulated

| **Part** | **Real or simulated** | **Where it comes from** |
| --- | --- | --- |
| Bluetooth connection to the helmet module | **Real** | Web Bluetooth to the ESP32 (section 3) |
| Module state: waiting, connected, testing, arming, running | **Real** | telemetry byte 1 |
| Self-test progress | **Real** | telemetry byte 14 |
| Fan on/off and speed | **Real** | the app sends commands; telemetry byte 2 confirms |
| Module button (arm/disarm) | **Real** | the state changes, and the button counter is byte 17 |
| Beep and vibration on the module | **Real** (the module does it on its own) | the app can trigger "Find my helmet" |
| Failsafe: phone lost, fan keeps running | **Real** | failsafe seconds in bytes 18–19 |
| Inside air sensor (MQ-135) | **Real** when fitted. If it is unplugged, the module makes up readings itself | bytes 4–5, flag bit 0 |
| Outside air sensor (MQ-135) | **Real** when fitted. If it is unplugged, the module makes up readings itself | bytes 6–7, flag bit 1 |
| AQI, PM2.5, other pollutants, "× the safe level" | Simulated model that **moves with the real sensors** | section 6 |
| Street map with 100 m cells, other riders, city stations | Simulated | section 6 |
| Route lines | **Real road shapes** from OSRM. Their air scores are simulated | section 6.7 |
| Forecast (IBM Granite TimeSeries), spike detection (IBM Granite TSPulse), clean window | Simulated | section 6.8 |
| Action Cards and the Telegram message | Simulated preview. An optional real Telegram send can be switched on | section 4.6 |
| Trip summary | Computed from this session's data | section 4.7 |
| Demo helmet (no hardware) | Simulated copy of the module, with the same states, timings and packet format | section 3.7 |

## 2. The demo workflow

This is the story the app must tell, step by step. Each step must look perfect.

| **#** | **The person does** | **The module does (real)** | **The app shows** |
| --- | --- | --- | --- |
| 1 | Switches the module on | Beeps and buzzes once. Both LEDs light for 1 s, then the yellow LED blinks slowly | (app not open yet) |
| 2 | Opens the app and taps **Connect helmet**, then picks AWEAR-xxxx | Beeps and buzzes once. Yellow LED stays on | A connect animation, then Home with the helmet card reading "Connected" |
| 3 | Taps **Arm & self-check** (or presses the module's button) | Yellow LED blinks fast, the fan spins briefly, the sensors calibrate, then the green LED blinks fast | A full-screen checklist that ticks in sync with the real progress: Outside air sensor ✓ → Inside air sensor ✓ → Fan ✓ → Calibrating ✓ → Armed ✓ |
| 4 | — | Green LED solid. The fan starts, with one beep | "Armed". The airflow animation starts, and inside air falls from Bad to Great over about 20 s. "78% cleaner" counts up |
| 5 | Taps **Start ride** on the cleaner route | The fan follows the app | The rider dot moves on the map, and the place name updates from real road names |
| 6 | (ride reaches the school zone) | The fan speeds up **before** arrival (Smart mode) | "Smart: fan High · school zone 200 m ahead". Then the toast "Entering Banyan Tree School zone" |
| 7 | Holds hand sanitizer near the outside sensor (a real sensor reaction) | The sensor reading jumps | Outside turns Very bad. The alert "Unusual spike nearby" appears and the fan goes to High, while inside stays Good |
| 8 | Presenter: **School rush** | — | An Action Card for the school, then the Telegram preview |
| 9 | Turns off the phone's Bluetooth, or uses Presenter: **Disconnect helmet** | The fan **keeps running**. Green solid with yellow blinking | Banner: "Disconnected · your helmet is protecting you on its own". After reconnecting: "Your helmet kept you protected for 42 s" |
| 10 | Taps **Stop** | The fan stops and the yellow LED stays on | Trip summary with the Clean-Air Score ring |
| 11 | Settings → मराठी | — | The whole app switches language instantly |

## 3. The helmet module link (real hardware, exact protocol)

### 3.1 Bluetooth Low Energy (GATT)

| **Item** | **UUID** | **Properties** |
| --- | --- | --- |
| Service | a3c10000-5f2b-4b8e-9d3a-0e1f2a3b4c5d | |
| Telemetry | a3c10001-5f2b-4b8e-9d3a-0e1f2a3b4c5d | notify (every 500 ms) and read |
| Command | a3c10002-5f2b-4b8e-9d3a-0e1f2a3b4c5d | write, and write without response |

The module advertises the name AWEAR- plus 4 hex characters (for example AWEAR-3A7C). It advertises the service UUID too.

```js
const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: [SERVICE_UUID] }, { namePrefix: 'AWEAR' }],
  optionalServices: [SERVICE_UUID],
});
```

### 3.2 Telemetry packet (20 bytes, little-endian)

| **Byte** | **Type** | **Field** | **Meaning** |
| --- | --- | --- | --- |
| 0 | u8 | version | always 1 |
| 1 | u8 | state | 0 boot, 1 waiting, 2 connected, 3 testing, 4 arming, 5 running |
| 2 | u8 | fanPct | the fan speed right now, 0–100 |
| 3 | u8 | flags | bit0 inside sensor real · bit1 outside sensor real · bit2 self-test passed · bit3 armed from the module button · bit4 fan test spinning · bit5 test-only run |
| 4–5 | u16 | insideRaw | inside air sensor reading, 0–4095. Higher means dirtier |
| 6–7 | u16 | outsideRaw | outside air sensor reading, 0–4095. Higher means dirtier |
| 8–9 | u16 | insideBase | inside "normal" level stored at calibration |
| 10–11 | u16 | outsideBase | outside "normal" level stored at calibration |
| 12–13 | u16 | uptimeSec | seconds since the module was switched on |
| 14 | u8 | testProgress | 0–100 during the self-test |
| 15 | u8 | fanTarget | the speed the module was asked for |
| 16 | u8 | seq | counts up with every packet |
| 17 | u8 | buttonCount | counts up with every short press of the module's button |
| 18–19 | u16 | failsafeSec | seconds the fan ran while the phone was disconnected |

```ts
export function parseTelemetry(dv: DataView) {
  return {
    version: dv.getUint8(0), state: dv.getUint8(1), fanPct: dv.getUint8(2), flags: dv.getUint8(3),
    insideRaw: dv.getUint16(4, true), outsideRaw: dv.getUint16(6, true),
    insideBase: dv.getUint16(8, true), outsideBase: dv.getUint16(10, true),
    uptimeSec: dv.getUint16(12, true), testProgress: dv.getUint8(14), fanTarget: dv.getUint8(15),
    seq: dv.getUint8(16), buttonCount: dv.getUint8(17), failsafeSec: dv.getUint16(18, true),
  };
}
```

### 3.3 Commands (write 1 or 2 bytes: opcode, then an optional argument)

| **Opcode** | **Name** | **Argument** | **What the module does** |
| --- | --- | --- | --- |
| 0x01 | ARM | starting fan % (0 = module default of 70) | runs the self-test (about 4.7 s), arms (1.5 s), then runs the fan |
| 0x02 | DISARM | — | stops the fan and goes back to connected |
| 0x03 | SET_FAN | fan % from 0 to 100 | sets the fan speed. The module enforces a 35% minimum whenever the fan is on |
| 0x04 | SELF_TEST | — | test only, no arming |
| 0x05 | LOCATE | — | 3 beeps and buzzes ("Find my helmet") |
| 0x06 | CALIBRATE | — | stores the current readings as the baselines |
| 0x07 | KEEPALIVE | — | nothing |

- Send every write through **one queue**, one at a time. Web Bluetooth throws "GATT operation already in progress" if two writes overlap.
- While armed, re-send SET_FAN with the current duty every 10 s as a keepalive.

### 3.4 Module states and lights

The app shows these on the helmet card, so people understand what they see on the table.

| **State** | **Yellow LED** | **Green LED** | **Helmet card text** |
| --- | --- | --- | --- |
| 1 waiting | slow blink | off | "Looking for your phone" |
| 2 connected | on | off | "Connected · ready to arm" |
| 3 testing | fast blink | off | "Self-check running" |
| 4 arming | on | fast blink | "Arming" |
| 5 running | off (slow blink if the phone is lost) | on | "Armed · fan {fanPct}%" |

### 3.5 Self-check sheet, driven by the real progress

- 0–30%: "Outside air sensor", then "Inside air sensor" (each ticks halfway through its range).
- 30–70% (flag bit4 set while the fan spins): "Fan". The fan icon in the sheet spins.
- 70–95%: "Calibrating", with a progress ring.
- Progress 100 and state 4: "Arming".
- State 5: "Armed ✓", one phone vibration (120 ms) and a soft ring burst. The sheet closes after 1 s.
- Sensor items always tick, because the module covers a missing sensor itself. The real truth shows only in Presenter → Data sources.
- If the state goes 2 → 3 without the app sending ARM (or flag bit3 is set), the button on the module started it. Open the sheet automatically and show the toast "Armed from your helmet button".
- If the state drops from 5 to 2 without the app sending DISARM, the button disarmed it. Show "Disarmed from your helmet" and end the ride.

### 3.6 Reconnect and failsafe

- Remember the BluetoothDevice. On gattserverdisconnected, show the banner "Disconnected · your helmet is protecting you on its own".
- If the drop was unexpected, retry device.gatt.connect() every 3 s.
- If the app asked for the disconnect (Presenter → Disconnect helmet), **don't auto-retry**. Wait for Reconnect, so the failsafe moment lasts as long as the presenter wants.
- Remember the last failsafeSec seen before the drop. After reconnecting, if the new value is higher, show the toast "Your helmet kept you protected for {new − old} s", then sync the fan mode back. Never show the toast for an unchanged value.
- If navigator.bluetooth is missing, explain "Bluetooth works in Chrome on Android or on a laptop" and offer **Use demo helmet**.

### 3.7 Demo helmet (backup when there is no hardware)

SimHelmetLink implements the same HelmetLink interface as BleHelmetLink. It **encodes real 20-byte packets** and feeds them through the same parseTelemetry, so both paths run identical code. It copies the firmware's timings exactly:

- boot 1.2 s → waiting → connected about 1 s after "connect".
- testing 4.7 s (fan spins from 1.5 s to 3.5 s) → arming 1.5 s → running.
- On disconnect: connected goes to waiting. Running stays running, with the fan at 70% or more, and failsafe seconds count up. Testing and arming carry on to running.
- Simulated raw readings, the same as the module's own fallback:
  - Outside: around 980, with a slow ±70 wave and a +80 to +180 traffic bump every 45–120 s.
  - Inside: starts at 520 and follows the outside. With the fan off it settles at 90% of the gap between 520 and outside (20 s lag). With the fan on it settles at about 25% of the gap (8 s lag).

## 4. Screens

Navigation is a bottom tab bar: **Home · Map · Routes · Alerts**. A gear icon at the top right opens Settings. Mobile-first at 390 × 844. On a laptop wider than 900 px, show the app inside a centred phone frame with the Presenter panel beside it.

### 4.1 First launch

- Language: three big tiles, English, हिन्दी, मराठी.
- Three swipe cards, each with a small looping animation:
  - "Your helmet senses the street": grey dust dots flow into the module.
  - "You breathe cleaner air": mint swirls appear inside the helmet.
  - "Every ride warns your city": map cells light up and a school icon pings.
- Choice: **"I have the AWEAR module"** opens the Connect screen. **"Just the app"** goes to Home without a helmet card.
- Connect screen: a large helmet illustration with a pulsing ring and a **Connect helmet** button. Below it is the secondary link "Use demo helmet". While connecting, show these steps: "Searching" → "Pairing" → "Connected ✓".

### 4.2 Home

**Top bar:** the place name ("Near Bibwewadi Road", or the current road name from the route during a ride) and the gear icon.

**A. Air card (hero):** full width, softly tinted with the band colour, with a slow breathing animation.

- The band word, large ("Bad"), with its icon. Next to it, small: "AQI 259".
- Scene: "Feels like a traffic jam".
- "1.8× the safe level" (PM2.5 ÷ 60, one decimal). Below 1.0 it reads "Within the safe level".
- Suggestion: "Visor down, fan on Smart. Try the cleaner route."
- "Main cause: fine dust (PM2.5)".
- "Updated 1 s ago".
- **Show details** toggle: the AQI and its CPCB category, then a row per pollutant with its plain name, scientific name, value, unit and a mini bar. The pollutant that sets the AQI is marked "main cause". It also shows the line "Air sensor (MQ-135): 1.3× normal", built from the real raw ÷ baseline.

**B. Helmet card** (module or demo helmet only):

- Connection row: the helmet icon, the state text from 3.4, a small LED legend dot in the right colour, and an "Armed" badge.
- **Inside vs outside**: two big tiles side by side. "Outside · AQI 259 · Bad" in orange and "Inside your helmet · AQI 40 · Great" in green. A "78% cleaner" badge counts up. The numbers count smoothly and never jump.
- Airflow strip: grey particles drift into a module icon and mint particles flow out into a helmet icon. Speed and density follow the **real** fanPct, and the particles stop when the fan stops.
- Fan mode control: **Off · Eco · Smart · Always**, with **Low · Medium · High** chips under Always. There is no slider.
- "Brain says" line, always present: "Smart: fan High · school zone 200 m ahead", "Eco: fan off · air is Good", "Always: fan High".
- **Arm & self-check** button (becomes "Disarm" when armed) and a small "Find my helmet" link (LOCATE).

**C. Next 6 hours card:** a small SVG line of the forecast AQI for this street, labelled "Forecast · IBM Granite TimeSeries". Under it: "Cleanest hour today: 3–4 PM · best time for school PT".

**D. Primary button:** "Start ride" (module users) or "Find a cleaner route" (app only).

**During a ride:** a slim ride bar on every screen shows the timer, a live band dot and **Stop**. Stop sends DISARM (0x02), so the real fan stops, then opens the Trip summary.

### 4.3 Map

- A Leaflet map with CARTO Positron tiles, centred on the rider.
- A grid of 100 m cells filled with band colours at 55% opacity. Cells near moving riders refresh with a soft fade, which makes the mapping look live.
- 40 tiny moving rider dots, and the chip "Mapped by 47 riders in the last hour".
- Two grey squares labelled "City station" that show the area average. This makes the point: the station shows "Okay" while the school gate next to it is "Bad".
- Zones, all fictional names: **Banyan Tree School** (graduation-cap icon), **Riverside Public School**, **Riverside Hospital** (cross icon) and **Gulmohar Park**. The outline pulses when a zone is Bad or worse.
- Legend chip with the six band colours and words.
- Hour slider from "Now" to 24 h. Dragging it recolours the grid from the hourly profile ("Typical at 8 AM").
- Tap a cell to open a sheet: band, scene, × safe level, suggestion and the cleanest hour. Tap a zone to open its sheet, with the line "Action Card sent to the school office at 8:10 AM" and a **View Action Card** button.
- If the tiles fail to load (no internet), still draw the grid and zones on a plain background.

### 4.4 Routes

- From: current location. To: chips for **Swargate** (18.5018, 73.8636), **Katraj** (18.4529, 73.8554), **Market Yard** (18.4869, 73.8786) and **Pune Station** (18.5286, 73.8743).
- Two or three route cards. Each shows the route name (the main road name from OSRM's steps, "via Satara Road"), the real travel time from OSRM, a mini map coloured by segment band, and an air summary ("Mostly Okay").
- The cleanest card gets "**42% cleaner air · +3 min**", using the real percentage and minutes. The fastest gets "Fastest".
- It selects the cleanest route by default when it adds no more than 5 minutes, and one line explains why.
- Button: **Start ride on this route**.

### 4.5 Alerts

- A feed, newest first. Types: "Bad air ahead", "Entering a school zone", "Unusual spike nearby", "Action Card sent", "Air improved".
- Toasts slide down with a band-coloured edge, together with a phone vibration. The module does not beep for alerts.

### 4.6 Action Card and Telegram

- Header: zone, band and time.
- **What's happening:** "Fine dust at Banyan Tree School gate is Bad at 8:10 AM. Main source: the drop-off queue."
- **Do now (next 10 minutes):** "Guard asks parents to switch engines off in the queue" · "Keep the gate open so cars don't stack up" · "Move PT and assembly indoors" · "Close road-side classroom windows" · "Students with asthma stay inside".
- **This week:** "Staggered drop-off by grade" · "No-idling sign at the gate" · "Move the pickup point 100 m from the road" · "Schedule PT in today's cleanest hour: 3–4 PM".
- **Last week:** "Gate air improved from Very bad to Bad after engines-off."
- Audience chips **Rider · School · Hospital · Parent** switch the wording.
- "Written by IBM Granite from verified readings" in small text.
- **Send on Telegram** opens a Telegram-style chat screen: the bot "AWEAR Alerts" with a blue tick avatar, the card as a message bubble with bold headings, and a timestamp with double ticks.
- **Optional real send:** in Presenter → Telegram, the presenter can paste a bot token and a chat ID. When both are set, "Send on Telegram" also POSTs to `https://api.telegram.org/bot<token>/sendMessage` with {chat_id, text, parse_mode: "HTML"}. The preview always shows; the real send's result shows only in the Presenter panel.

### 4.7 Trip summary

- Hero: a Clean-Air Score ring that animates from 0 to its value (example 80), plus the inside band word.
- Rows: "Outside air: Bad · 1.8× the safe level", "Inside your helmet: Great · within the safe level", "Your helmet cleaned 310 breaths" (for a 24-minute ride), "Time in school zones: 4 min", "You mapped 3.2 km of streets".
- Ride strip: two thin colour bands over time, outside on top and inside below.
- Button: **Done**.

### 4.8 Settings

- Language: English, हिन्दी, मराठी. It switches instantly with a crossfade and never reloads the page.
- Sensitive mode: Asthma · Children · Elderly · No one. Any choice except "No one" makes alerts fire one band earlier.
- "Show details by default".
- Helmet: Connect, Disconnect, Use demo helmet, firmware 1.0, and the device name.
- "How AWEAR decides": one sheet that explains in plain words how AI fixes readings, fills the map, forecasts, spots spikes, picks routes and writes Action Cards.
- About: "Readings are anonymous, grouped into 100 m cells." Plus one small line: "Prototype build · some data is modelled".

### 4.9 Presenter panel (hidden demo control)

It opens from a 1.5 s long-press on the AWEAR logo, the keyboard key P, or 5 taps on the version number. On a laptop it sits beside the phone frame.

**Controls tab:**

| **Button** | **What the judges see** |
| --- | --- |
| Start ride (Swargate, cleanest route) | The ride starts and the dot moves |
| Ride speed 1× / 4× / 10× (default 4×) | Faster movement along the route |
| Spike outside air | Outside PM2.5 ramps ×2.6 over 15 s, then decays over 40 s. The spike alert fires |
| Enter school zone | The ride jumps to just before Banyan Tree School |
| School rush | The school zone turns Bad; an Action Card and a toast follow |
| Clear air | The ride moves to Gulmohar Park cells |
| Disconnect helmet | Really calls device.gatt.disconnect(), so the module goes into failsafe for real |
| Reconnect helmet | Reconnects and syncs |
| Scenario: Busy road (default) · School gate · Park · Highway | Changes the base air level |
| Reset demo | Back to a clean start, with the same random seed |

**Data sources tab:** a live table of every source in section 1, with a green "Real" or grey "Modelled" pill. It also shows the live raw values, baselines, flags, fan %, state, packet sequence and packets per second. The sensor rows read the flags, for example "Outside sensor: modelled by the module (not plugged in)".

**Telegram tab:** bot token, chat ID, a "Send test" button and the last result.

## 5. Air model: turning the real sensors into believable AQI

Run this at 10 Hz, smooth everything, and make every number on every screen come from this one model.

- **Street PM2.5 at the rider's position:** P = field(lat, lng, time) (see 6.2). The default "Busy road" scenario keeps it around 100–110 µg/m³ (Bad, AQI about 250–270).
- **Sensor factor (real):** kOut = clamp(1 + 1.2 × (outsideRaw ÷ base − 1), 0.9, 4.0), smoothed over 2 s. If the baseline is 0, kOut = 1.
- base starts at outsideBase from the packet. MQ-135 sensors drift down while they warm up, so whenever the raw value stays below base, let base follow it down slowly (time constant 60 s). Never let it drift up, and reset it whenever the packet's baseline changes (after a calibration).
- kIn works the same way with the inside values, with a lower clamp of 0.7.
- **kIn = 1 whenever flag bit0 is 0** (the module is modelling the inside sensor) **and always with the demo helmet.** The modelled inside reading already includes the fan effect, so using it would count the fan twice.
- Hand sanitizer held near a sensor (alcohol vapour) makes the raw value jump 2–4×. That is the live "real sensor" moment.
- **Outside PM2.5** = P × kOut × presenterSpike.
- **Fan effect (real fan %):** η = 0.08 when the fan is off, otherwise 0.55 + 0.33 × fanPct ÷ 100. Medium (70%) gives 0.78 and High gives 0.88.
- **Inside PM2.5** follows outside × (1 − η) × kIn with a first-order lag (8 s with the fan on, 20 s with it off). The floor is 6 µg/m³, with ±1.5 noise.
- **Other pollutants:** PM10 = 1.7 × PM2.5 + 10. NO₂ (µg/m³) = 25 + 0.5 × PM2.5. CO (mg/m³) = 0.6 + 0.012 × PM2.5. The AQI is the highest CPCB sub-index, which is normally PM2.5's.
- **Spike detection** ("IBM Granite TSPulse"): when outside PM2.5 rises more than 35% within 10 s and goes above 90, raise "Unusual spike nearby · possible smoke or burning". Debounce it for 60 s.

Consistency check, using the pitch numbers: outside PM2.5 108 gives AQI 259, "Bad", "1.8× the safe level". At 70% fan, inside is about 24 µg/m³: AQI 40, "Great", 78% cleaner.

## 6. Simulation engine

### 6.1 Basics

- Seeded random numbers (mulberry32, seed 2026), so every run of the demo is identical.
- The clock is real time. Ride movement has its own speed multiplier.
- Default centre: VIT Pune, Bibwewadi (18.4636, 73.8682). Settings has "Use my location".

### 6.2 Pollution field

- A 6 km × 6 km grid of 100 m cells around the centre (60 × 60).
- Base 55 µg/m³ × diurnal(hour) × cell factor.
- Diurnal: peaks at 9:00 (×1.6) and 20:00 (×1.8), troughs at 15:00 (×0.7) and 4:00 (×0.9).
- Cell factor: smooth value noise from 0.7 to 1.3.
- Plus a road term: +30 to +60 within 60 m of any route line or synthetic arterial.
- Plus signal hotspots: +40 to +120 during red phases on a 90 s cycle.
- Plus school zones: +80 to +150 at 7:45–8:30 and 13:30–14:15 on weekdays, or whenever "School rush" is pressed.
- Plus hospital entrances: +30.
- Parks: ×0.5.
- Hourly profile per cell (for the hour slider and forecasts): the same formula evaluated at each hour, plus ±8% noise.

### 6.3 Ride

- The rider moves along the chosen route polyline at 25 km/h × the ride speed, and stops for 20 s at 2–3 signal points.
- The road name in the top bar comes from the OSRM step that contains the rider.

### 6.4 Fleet

40 virtual riders on loops around the centre at 15–35 km/h. They are drawn as tiny dots, and cells near them refresh.

### 6.5 Fan brain (pure function)

- Duty levels: Low 40, Medium 70, High 100. Off is 0.
- **Off:** 0. The app stays armed and the module stays green.
- **Always:** the chosen level.
- **Eco:** Medium when outside PM2.5 ≥ 60 (45 in sensitive mode). Off below 45 (35 in sensitive mode), after running at least 120 s.
- **Smart:** Eco, plus look-ahead. When the band 300 m ahead on the route is Bad or worse, or a school or hospital zone is ahead, raise the fan before arrival. Okay → Low, Bad → Medium, Very bad or worse → High.
- **Eco and Smart, spike rule:** while the "Unusual spike nearby" alert is active, or the outside band right now is Very bad or worse, the fan goes to High (100). The "brain says" line reads "Smart: fan High · sudden spike".
- Send SET_FAN only when the duty changes, plus the 10 s keepalive.

### 6.6 Exposure and score

- % cleaner = 1 − inside ÷ outside (live value, and the ride average for the summary).
- Breaths cleaned = ride minutes × 14 × the share of time with the fan on and inside lower than outside. Example: 24 min gives 310.
- Clean-Air Score = clamp(100 × (1 − inside average ÷ 60), 0, 100).

### 6.7 Routes

- Call `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?alternatives=3&overview=full&geometries=geojson&steps=true`.
- If fewer than 3 routes come back, make one more by adding a via point 400 m to the side of the fastest route's midpoint.
- Air score = the sum of PM2.5 at arrival time × time over each segment. "% cleaner" is measured against the fastest route.
- Put one extra traffic hotspot on the stretch of the fastest route that the cleanest route does not share. This makes the default trip show a cleaner route of about 35–45%.
- If OSRM fails or there is no internet, use 3 built-in polylines between the centre and Swargate, with times of 18, 21 and 19 minutes.

### 6.8 Forecast and clean window

- Next 6 hours for the current cell: the hourly profile × the current deviation from it, which decays toward 1 over 3 hours.
- Cleanest hour today: the lowest hour from now until 18:00.

### 6.9 Alert rules

| **Alert** | **Trigger** | **Debounce** |
| --- | --- | --- |
| Bad air ahead | the band 300 m ahead is Bad or worse | 3 min per cell |
| Entering a school/hospital zone | the rider enters a zone while it is Okay or worse | once per entry |
| Unusual spike nearby | rule 5.7 | 60 s |
| Action Card sent | a zone stays Bad or worse for 60 s (demo-fast), or School rush is pressed | 10 min per zone |
| Air improved | the rider's band improves by 2 or more levels | 2 min |

## 7. Air words, colours and tables

### 7.1 CPCB National AQI sub-index

Sub-index: I = ((I_hi − I_lo) ÷ (BP_hi − BP_lo)) × (C − BP_lo) + I_lo.

| **AQI band** | **PM2.5** | **PM10** | **NO₂** | **CO (mg/m³)** |
| --- | --- | --- | --- | --- |
| Good 0–50 | 0–30 | 0–50 | 0–40 | 0–1.0 |
| Satisfactory 51–100 | 31–60 | 51–100 | 41–80 | 1.1–2.0 |
| Moderate 101–200 | 61–90 | 101–250 | 81–180 | 2.1–10 |
| Poor 201–300 | 91–120 | 251–350 | 181–280 | 10.1–17 |
| Very poor 301–400 | 121–250 | 351–430 | 281–400 | 17.1–34 |
| Severe 401–500 | 251–380 | 431–510 | 401–500 | 34.1–50 |

### 7.2 Simple bands (what most people see)

| **Word** | **Colour** | **CPCB band** | **"Feels like…"** | **Suggestion (with helmet)** | **Suggestion (app only)** |
| --- | --- | --- | --- | --- | --- |
| Great | #1B9E4B | Good | a garden after rain | Great air. Enjoy the ride. | Great air. A good time to be outside. |
| Good | #8BC34A | Satisfactory | a quiet street | Fine for most people. Sensitive? Keep Eco on. | Fine for most people. Sensitive? Take it easy outside. |
| Okay | #F2C230 | Moderate | a busy market | Fan on Eco. Kids and elderly, limit time outside. | Kids and elderly, limit time outside. |
| Bad | #F28C28 | Poor | a traffic jam | Visor down, fan on Smart. Try the cleaner route. | Wear a mask outside. Try the cleaner route. |
| Very bad | #E53935 | Very poor | standing behind a bus | Avoid this road if you can. Fan on High. | Avoid this road if you can. Keep outdoor time short. |
| Dangerous | #8E1B3A | Severe | standing next to a bonfire | Stay indoors if possible. Fan on Always, High. | Stay indoors if possible. Close windows. |

- Band colours are used only for air states, never as decoration. A colour always appears with its word and icon.
- Plain pollutant names: PM2.5 "fine dust", PM10 "dust", NO₂ "traffic gas", CO "carbon monoxide".

## 8. Languages

- i18next with English, Hindi and Marathi. Every visible string goes through t(), including Action Cards, toasts and the Telegram message.
- Write the Hindi and Marathi translations fully yourself.
- Fixed band words:

| **English** | **Hindi** | **Marathi** |
| --- | --- | --- |
| Great | बढ़िया | उत्तम |
| Good | अच्छी | चांगली |
| Okay | ठीक | ठीक |
| Bad | खराब | वाईट |
| Very bad | बहुत खराब | खूप वाईट |
| Dangerous | खतरनाक | धोकादायक |

- Units, PM2.5 and place names stay in English. Numbers use Intl.NumberFormat with Latin digits.
- Hindi and Marathi use Noto Sans Devanagari with a slightly taller line height. Never give a text element a fixed width.

## 9. Design and motion: simple, premium, calm

| **Token** | **Value** | **Use** |
| --- | --- | --- |
| primary | #4B3FA8 | buttons, active tab |
| primary-deep | #2E2670 | headings on tinted cards |
| background | #F6F5FB | app background |
| surface | #FFFFFF | cards and sheets |
| ink | #1B1A2E | main text |
| muted | #6B6880 | secondary text |
| line | #E6E3F2 | dividers |
| clean | #3DDC97 | clean-air particles and "cleaner" badges |
| smoke | #9A98A6 | dirty-air particles |

- Font: Plus Jakarta Sans (Latin) and Noto Sans Devanagari, bundled with @fontsource so they work offline. Big numbers are 700 weight with tabular figures.
- Radius: cards 24, buttons 16, chips fully round. Shadow: 0 8px 24px rgba(46,38,112,0.08).
- Icons: lucide-react, plus custom SVGs for the helmet, module, school and hospital in one line weight.
- Motion (Framer Motion):
  - Page transitions: a 16 px slide with a fade over 220 ms, easing [0.2, 0, 0, 1].
  - Air card: the band colour crossfades over 600 ms when it changes, and the word slides in. A 4 s breathing loop scales it 1 → 1.015.
  - Numbers count smoothly over 500 ms. Self-check ticks draw as a path.
  - Bottom sheets: spring with stiffness 380 and damping 34. Map cells fade over 800 ms.
  - Only success moments and toasts may overshoot. Respect prefers-reduced-motion. Keep it at 60 fps on a mid-range Android phone.
  - Phone haptics: single 120 ms; alert pattern [200, 100, 200]

## 11. Live-demo safety rules

- The app must never crash or freeze when Bluetooth fails, the internet drops, or OSRM or the map tiles fail. Every failure falls back silently to the next option.
- The app shell works offline after the first load (PWA).
- If telemetry stops for 3 s while connected, treat the helmet as disconnected and start reconnecting.
- All numbers are smoothed, so nothing jumps more than one band per second, except during the spike demo.
- Keep the screen awake during a ride (Wake Lock API, if available).

## 12. Acceptance checks (verify each before finishing)

- [ ] npm run build passes with no TypeScript errors.
- [ ] With the real module: Connect shows the device picker. After connecting, the helmet card reads "Connected · ready to arm".
- [ ] Arm: the checklist ticks in sync with byte 14. The fan item ticks while bit4 is set. The sheet ends on "Armed ✓" when the state becomes 5.
- [ ] Pressing the module's button arms and disarms, and the app follows both ways.
- [ ] Changing the fan mode changes the real fan within 1 s, and the airflow particles follow fanPct.
- [ ] With the outside sensor unplugged, everything still works, and Data sources shows "modelled by the module".
- [ ] Hand sanitizer near the outside sensor raises outside AQI within 5 s and fires the spike alert, while inside stays Great or Good with the fan on.
- [ ] Disconnect: the banner appears within 3 s, the module's fan keeps running, and reconnecting shows "kept you protected for N s".
- [ ] Demo helmet: the whole workflow in section 2 works with no hardware.
- [ ] Routes shows 2–3 real road routes with "% cleaner · +min". A ride moves on the map, and Stop opens the Trip summary.
- [ ] School rush creates an Action Card, and the Telegram preview renders.
- [ ] Hindi and Marathi change every visible string, with no overflow at 390 px wide.
