import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { CENTER, SEED, ZONES, type Scenario } from '../config';
import { CommandQueue, type Connection } from '../helmet/HelmetLink';
import { SimHelmetLink } from '../helmet/SimHelmetLink';
import {
  counterDelta,
  encodeCommand,
  Flags,
  getFailsafeDelta,
  HelmetState,
  Opcode,
  parseTelemetry,
  type Telemetry,
} from '../helmet/protocol';
import {
  getAir,
  insidePm25,
  smoothAir,
  updateSensor,
  type Air,
  type DisplayAir,
  type SensorState,
} from '../model/air';
import { collectAlerts, emptyAlertMemory, type AirAlert } from '../model/alerts';
import { decideFan, type FanDecision } from '../model/fan';
import {
  distance,
  nearestDistanceOnRoute,
  positionAlong,
  routeLengths,
  type Coordinate,
} from '../model/geometry';
import {
  advanceRide,
  emptyExposure,
  fieldPm25,
  integrateExposure,
  lookAhead,
  seededValue,
  spikeMultiplier,
  summarize,
  type Exposure,
  type FieldContext,
  type Movement,
} from '../model/simulation';
import {
  BUNDLED_ROUTES,
  roadName,
  RouteRequest,
  scoreRoutes,
  type Route,
  type ScoredRoute,
} from '../routes/routeService';
import {
  DEFAULT_PREFERENCES,
  getEnabledLanguage,
  parsePreferences,
  type Preferences,
} from './preferences';

const STORAGE_KEY = 'awear.preferences.v1';
export interface Ride {
  route: Route;
  movement: Movement;
  exposure: Exposure;
  paused: boolean;
}
export interface Snapshot {
  nowMs: number;
  position: Coordinate;
  road: string;
  outside: Air;
  inside: Air;
  actualOutside: Air;
  fan: FanDecision;
  ahead: { air: Air; zoneId: string | null } | null;
  elapsedSeconds: number;
}
export interface Toast {
  id: number;
  key: string;
  values?: Record<string, string | number>;
  band: number;
}
interface AppState {
  ready: boolean;
  preferences: Preferences;
  connection: Connection;
  telemetry: Telemetry | null;
  scenario: Scenario;
  schoolRush: boolean;
  speed: 1 | 4 | 10;
  snapshot: Snapshot;
  ride: Ride | null;
  summary: ReturnType<typeof summarize> | null;
  routes: ScoredRoute[];
  selectedRouteId: string | null;
  destination: string;
  routesLoading: boolean;
  routesUnavailable: boolean;
  alerts: AirAlert[];
  toast: Toast | null;
  diagnostics: string[];
  checkVisible: boolean;
  foreground: boolean;
  packetCount: number;
  connectionStartedMs: number | null;
}

const firstAir = getAir(
  fieldPm25(CENTER, new Date(), { scenario: 'busy', schoolRush: false, seed: SEED }),
);
const initialRoutes = scoreRoutes(BUNDLED_ROUTES, new Date(), {
  scenario: 'busy',
  schoolRush: false,
  seed: SEED,
});
export const useAppStore = create<AppState>(() => ({
  ready: false,
  preferences: { ...DEFAULT_PREFERENCES },
  connection: 'disconnected',
  telemetry: null,
  scenario: 'busy',
  schoolRush: false,
  speed: 4,
  snapshot: {
    nowMs: Date.now(),
    position: CENTER,
    road: 'Bibwewadi Road',
    outside: firstAir,
    inside: firstAir,
    actualOutside: firstAir,
    fan: { duty: 70, reason: 'eco', eco: { isOn: false, startedMs: 0 } },
    ahead: null,
    elapsedSeconds: 0,
  },
  ride: null,
  summary: null,
  routes: initialRoutes.routes,
  selectedRouteId: initialRoutes.selectedId,
  destination: 'swargate',
  routesLoading: false,
  routesUnavailable: false,
  alerts: [],
  toast: null,
  diagnostics: [],
  checkVisible: false,
  foreground: true,
  packetCount: 0,
  connectionStartedMs: null,
}));

let clock = () => Date.now();
let modelMs = clock();
let lastWallMs = clock();
let sim = new SimHelmetLink(modelMs);
let queue = new CommandQueue(sim);
let removePacket = () => {};
let removeConnection = () => {};
let timer: ReturnType<typeof setInterval> | null = null;
let lastPublishMs = modelMs;
let lastCommandMs = -Infinity;
let lastDuty: number | null = null;
let awaitingDisarm = false;
let lastPacketMs = modelMs;
let beforeDrop: Telemetry | null = null;
let reconnectPending = false;
let reconnectAtMs = Infinity;
let suppressReconnect = true;
let sensor: SensorState = { packetBase: 0, base: 0, factor: 1 };
let insideValue = firstAir.pm25;
let displayOutside: DisplayAir = { air: firstAir, lastBandMs: modelMs };
let displayInside: DisplayAir = { air: firstAir, lastBandMs: modelMs };
let spikeStartMs = -Infinity;
let spikeUntilMs = -Infinity;
let history: { timeMs: number; pm25: number }[] = [];
let alertMemory = emptyAlertMemory(firstAir.band);
let ride: Ride | null = null;
let lengths: number[] = [];
let fan: FanDecision = { duty: 70, reason: 'eco', eco: { isOn: false, startedMs: 0 } };
let rushPending: string | null = null;
let toastNumber = 0;
let preferenceWrites = Promise.resolve();
const routeRequest = new RouteRequest();
let routeLoadId = 0;

function diagnose(context: string, error: unknown) {
  const message = `${new Date(clock()).toISOString()} ${context}: ${error instanceof Error ? error.message : String(error)}`;
  console.warn(message);
  useAppStore.setState((state) => ({ diagnostics: [message, ...state.diagnostics].slice(0, 40) }));
}
function toast(key: string, values?: Toast['values'], band = 2) {
  useAppStore.setState({ toast: { id: ++toastNumber, key, values, band } });
}
function fieldContext(): FieldContext {
  const state = useAppStore.getState();
  return { scenario: state.scenario, schoolRush: state.schoolRush, seed: SEED };
}
function send(opcode: Opcode, value?: number) {
  if (opcode === Opcode.Disarm) awaitingDisarm = true;
  return queue.send(encodeCommand(opcode, value)).catch((error) => {
    if (opcode === Opcode.Disarm) awaitingDisarm = false;
    diagnose(`Helmet command ${Opcode[opcode]}`, error);
    toast('commandFailed', undefined, 3);
    throw error;
  });
}
function sendControl(duty: number) {
  lastDuty = duty;
  lastCommandMs = modelMs;
  void send(Opcode.SetFan, duty).catch(() => {
    lastDuty = null;
  });
}

function subscribeLink() {
  removePacket();
  removeConnection();
  removePacket = sim.onPacket((bytes) => {
    try {
      const packet = parseTelemetry(bytes);
      if (packet.state === HelmetState.Connected || packet.state === HelmetState.Waiting)
        awaitingDisarm = false;
      const previous = useAppStore.getState().telemetry;
      lastPacketMs = modelMs;
      if (reconnectPending && beforeDrop) {
        const protectedSeconds = getFailsafeDelta(beforeDrop, packet);
        if (protectedSeconds > 0) toast('protectedSeconds', { seconds: protectedSeconds }, 0);
        reconnectPending = false;
        beforeDrop = null;
        lastDuty = null;
      }
      const buttonPressed =
        previous && counterDelta(previous.buttonCount, packet.buttonCount, 8) > 0;
      if (buttonPressed) {
        if (packet.state === HelmetState.Testing && packet.flags & Flags.button)
          toast('buttonArmed', undefined, 0);
        if (packet.state === HelmetState.Connected && previous.state === HelmetState.Running)
          toast('buttonDisarmed', undefined, 1);
      }
      if (previous?.state === HelmetState.Running && packet.state !== HelmetState.Running && ride)
        void actions.stopRide();
      if (packet.state === HelmetState.Testing || packet.state === HelmetState.Arming)
        useAppStore.setState({ checkVisible: true });
      if (packet.state === HelmetState.Running && previous?.state !== HelmetState.Running)
        toast('armed', undefined, 0);
      useAppStore.setState((state) => ({ telemetry: packet, packetCount: state.packetCount + 1 }));
    } catch (error) {
      diagnose('Telemetry packet rejected', error);
    }
  });
  removeConnection = sim.onConnection((connection, intentional) => {
    const state = useAppStore.getState();
    if (connection === 'disconnected') {
      awaitingDisarm = false;
      beforeDrop ??= state.telemetry;
      suppressReconnect = intentional;
      reconnectAtMs = intentional ? Infinity : modelMs + 3000;
      queue.clear();
      lastDuty = null;
    }
    if (connection === 'connected') {
      reconnectPending = beforeDrop !== null;
      reconnectAtMs = Infinity;
      lastPacketMs = modelMs;
    }
    useAppStore.setState({
      connection,
      packetCount: connection === 'connected' ? 0 : state.packetCount,
      connectionStartedMs: connection === 'connected' ? modelMs : state.connectionStartedMs,
    });
  });
}
subscribeLink();

function tick() {
  const wallMs = clock();
  const seconds = Math.min(0.3, Math.max(0, (wallMs - lastWallMs) / 1000));
  lastWallMs = wallMs;
  if (!useAppStore.getState().foreground || seconds <= 0) return;
  modelMs += seconds * 1000;
  sim.tick(modelMs);
  let state = useAppStore.getState();
  if (state.connection === 'connected' && modelMs - lastPacketMs > 3000) sim.disconnect(false);
  if (state.connection === 'disconnected' && !suppressReconnect && modelMs >= reconnectAtMs) {
    reconnectAtMs = modelMs + 3000;
    sim.connect(modelMs);
  }
  const telemetry = state.telemetry;
  if (telemetry)
    sensor = updateSensor(sensor, telemetry.outsideRaw, telemetry.outsideBase, seconds);
  let position = state.snapshot.position;
  let traveled = 0;
  if (ride && !ride.paused) {
    const previousMeters = ride.movement.meters;
    ride.movement = advanceRide(ride.movement, seconds, state.speed, lengths[lengths.length - 1]);
    traveled = ride.movement.meters - previousMeters;
    position = positionAlong(ride.route.coordinates, lengths, ride.movement.meters);
  }
  const context = fieldContext();
  const date = new Date(wallMs);
  const outsideValue = Math.min(
    380,
    fieldPm25(position, date, context) *
      (telemetry ? sensor.factor : 1) *
      spikeMultiplier((modelMs - spikeStartMs) / 1000),
  );
  const outside = getAir(outsideValue);
  const confirmedFan = state.preferences.helmet ? (telemetry?.fanPct ?? 0) : 0;
  insideValue = insidePm25(
    insideValue,
    outsideValue,
    confirmedFan,
    seconds,
    (seededValue(Math.floor(modelMs / 1000), 1) - 0.5) * 3,
  );
  const ahead = ride
    ? lookAhead(ride.route.coordinates, lengths, ride.movement.meters, date, context)
    : null;
  history.push({ timeMs: modelMs, pm25: outsideValue });
  history = history.filter((sample) => modelMs - sample.timeMs <= 10000);
  const oldest = history[0];
  const spikeDetected =
    !!oldest &&
    modelMs - oldest.timeMs >= 1000 &&
    outsideValue > 90 &&
    outsideValue > oldest.pm25 * 1.35;
  if (
    spikeDetected &&
    modelMs >= spikeUntilMs &&
    modelMs - (alertMemory.cooldowns.spike ?? -Infinity) >= 60000
  )
    spikeUntilMs = modelMs + 40000;
  const spikeActive = modelMs < Math.max(spikeUntilMs, spikeStartMs + 55000);
  const previousEco = fan.eco;
  fan = decideFan({
    mode: state.preferences.fanMode,
    alwaysDuty: state.preferences.alwaysDuty,
    pm25: outsideValue,
    currentBand: outside.band,
    predictedBand: ahead?.air.band ?? null,
    sensitive: state.preferences.sensitive !== 'none',
    spikeActive,
    nowMs: modelMs,
    eco: fan.eco,
  });
  if (
    telemetry?.state !== HelmetState.Running ||
    state.preferences.fanMode === 'off' ||
    state.preferences.fanMode === 'always'
  ) {
    fan.eco = { isOn: false, startedMs: modelMs };
  } else if (!previousEco.isOn && fan.eco.isOn && confirmedFan === 0) {
    // Demand may precede device confirmation; only confirmed airflow starts the hold time.
    fan.eco = previousEco;
  }
  if (
    telemetry?.state === HelmetState.Running &&
    !awaitingDisarm &&
    state.connection === 'connected' &&
    (fan.duty !== lastDuty || modelMs - lastCommandMs >= 10000)
  )
    sendControl(fan.duty);
  const enteredZones = ZONES.filter(
    (zone) => zone.kind !== 'park' && distance(position, zone.center) <= zone.radius,
  );
  const zoneBands = ZONES.filter((zone) => zone.kind !== 'park').map((zone) => ({
    id: zone.id,
    band: getAir(fieldPm25(zone.center, date, context)).band,
  }));
  const result = collectAlerts(alertMemory, {
    nowMs: modelMs,
    currentBand: outside.band,
    aheadBand: ahead?.air.band ?? null,
    aheadCell: ahead?.cellKey ?? '',
    sensitive: state.preferences.sensitive !== 'none',
    enteredZones: ride ? enteredZones.map((zone) => ({ id: zone.id, band: outside.band })) : [],
    zoneBands,
    spikeDetected,
    rushZone: rushPending,
  });
  alertMemory = result.memory;
  rushPending = null;
  if (result.alerts.length > 0) {
    const alerts = result.alerts.map((alert) => ({ ...alert, timeMs: wallMs }));
    useAppStore.setState((current) => ({ alerts: [...alerts, ...current.alerts].slice(0, 100) }));
    const alert = alerts[alerts.length - 1];
    const zone = ZONES.find((item) => item.id === alert.zoneId);
    toast(`alert_${alert.type}`, zone ? { zone: zone.name } : undefined, alert.band);
  }
  if (ride && !ride.paused) {
    ride.exposure = integrateExposure(ride.exposure, {
      seconds,
      outside: outsideValue,
      inside: state.preferences.helmet ? insideValue : null,
      fanPct: confirmedFan,
      school: enteredZones.some((zone) => zone.kind === 'school'),
      distanceMeters: traveled,
    });
  }
  displayOutside = smoothAir(displayOutside, outsideValue, seconds, modelMs, spikeActive);
  displayInside = smoothAir(displayInside, insideValue, seconds, modelMs, spikeActive);
  if (modelMs - lastPublishMs >= 500) {
    lastPublishMs = modelMs;
    state = useAppStore.getState();
    useAppStore.setState({
      snapshot: {
        nowMs: wallMs,
        position,
        road: ride ? roadName(ride.route, ride.movement.meters) : state.snapshot.road,
        outside: displayOutside.air,
        inside: displayInside.air,
        actualOutside: outside,
        fan,
        ahead,
        elapsedSeconds: ride?.exposure.seconds ?? 0,
      },
      ride: ride ? { ...ride } : null,
    });
  }
}

function refreshScores() {
  const state = useAppStore.getState();
  const result = scoreRoutes(state.routes, new Date(clock()), fieldContext());
  useAppStore.setState({
    routes: result.routes,
    selectedRouteId: ride ? ride.route.id : result.selectedId,
  });
}

export const actions = {
  async hydrate() {
    try {
      const preferences = parsePreferences(await AsyncStorage.getItem(STORAGE_KEY));
      useAppStore.setState({ preferences });
    } catch (error) {
      diagnose('Preference load; defaults retained', error);
    } finally {
      useAppStore.setState({ ready: true });
    }
  },
  setPreferences(changes: Partial<Omit<Preferences, 'version'>>) {
    if (
      ride &&
      changes.helmet !== undefined &&
      changes.helmet !== useAppStore.getState().preferences.helmet
    ) {
      diagnose('Preference change rejected', 'Finish the current ride before changing helmet mode');
      return;
    }
    const preferences = { ...useAppStore.getState().preferences, ...changes };
    preferences.language = getEnabledLanguage(preferences.language);
    useAppStore.setState({ preferences });
    preferenceWrites = preferenceWrites
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)))
      .catch((error) => diagnose('Preference save', error));
  },
  startRuntime() {
    if (timer) return () => {};
    lastWallMs = clock();
    timer = setInterval(tick, 100);
    return () => {
      if (timer) clearInterval(timer);
      timer = null;
      routeRequest.cancel();
      queue.clear();
    };
  },
  setForeground(foreground: boolean) {
    if (!foreground && ride) {
      ride.paused = true;
      useAppStore.setState({ ride: { ...ride } });
    }
    lastWallMs = clock();
    useAppStore.setState({ foreground });
  },
  resumeRide() {
    if (ride) {
      ride.paused = false;
      lastWallMs = clock();
      useAppStore.setState({ ride: { ...ride } });
    }
  },
  connect() {
    suppressReconnect = false;
    sim.connect(modelMs);
  },
  disconnect(intentional = true) {
    sim.disconnect(intentional);
  },
  async setHelmetMode(helmet: boolean) {
    if (ride) return;
    if (!helmet) {
      const state = sim.getTelemetry().state;
      if (
        state === HelmetState.Running ||
        state === HelmetState.Testing ||
        state === HelmetState.Arming
      ) {
        if (useAppStore.getState().connection === 'connected') await send(Opcode.Disarm);
        else actions.pressButton();
      }
      sim.disconnect();
    }
    actions.setPreferences({ helmet });
  },
  async arm() {
    if (useAppStore.getState().connection !== 'connected') {
      actions.connect();
      return;
    }
    await send(Opcode.Arm, 70);
  },
  async disarm() {
    await send(Opcode.Disarm);
    if (ride) await actions.stopRide();
  },
  async selfTest() {
    await send(Opcode.SelfTest);
  },
  async locate() {
    await send(Opcode.Locate);
    toast('locating', undefined, 0);
  },
  async calibrate() {
    await send(Opcode.Calibrate);
    toast('calibrated', undefined, 0);
  },
  async keepalive() {
    await send(Opcode.Keepalive);
    toast('keepaliveDone', undefined, 0);
  },
  pressButton() {
    const state = sim.getTelemetry().state;
    awaitingDisarm =
      state === HelmetState.Running ||
      state === HelmetState.Testing ||
      state === HelmetState.Arming;
    sim.pressButton();
  },
  setSensors(inside: boolean, outside: boolean) {
    sim.setSensors(inside, outside);
  },
  hideCheck() {
    useAppStore.setState({ checkVisible: false });
  },
  clearToast(id: number) {
    if (useAppStore.getState().toast?.id === id) useAppStore.setState({ toast: null });
  },
  setSpeed(speed: 1 | 4 | 10) {
    useAppStore.setState({ speed });
  },
  setScenario(scenario: Scenario) {
    useAppStore.setState({ scenario });
    if (scenario === 'park' || scenario === 'clean') useAppStore.setState({ schoolRush: false });
    refreshScores();
  },
  spike() {
    spikeStartMs = modelMs;
  },
  schoolRush() {
    const scenario = useAppStore.getState().scenario;
    useAppStore.setState({
      schoolRush: true,
      scenario: scenario === 'clean' || scenario === 'park' ? 'school' : scenario,
    });
    rushPending = 'banyan';
    refreshScores();
  },
  enterSchool() {
    if (!ride) {
      toast('startRideFirst');
      return;
    }
    const school = ZONES[0];
    const nearest = nearestDistanceOnRoute(ride.route.coordinates, lengths, school.center);
    ride.movement = {
      meters: Math.max(0, nearest - school.radius - 300),
      stopSeconds: 0,
      nextSignal: 4,
    };
    // A presenter jump is not mapped distance or exposure.
    useAppStore.setState({ ride: { ...ride } });
  },
  clearAir() {
    actions.setScenario('clean');
    if (!ride)
      useAppStore.setState((state) => ({
        snapshot: { ...state.snapshot, position: ZONES[3].center, road: 'Gulmohar Park' },
      }));
    else toast('cleanConditions', undefined, 0);
    spikeStartMs = -Infinity;
    spikeUntilMs = -Infinity;
  },
  async loadRoutes(destination = 'swargate') {
    if (ride) return;
    const requestId = ++routeLoadId;
    const local =
      destination === 'swargate'
        ? scoreRoutes(BUNDLED_ROUTES, new Date(clock()), fieldContext())
        : { routes: [], selectedId: null };
    useAppStore.setState({
      destination,
      routes: local.routes,
      selectedRouteId: local.selectedId,
      routesLoading: true,
      routesUnavailable: false,
    });
    try {
      const routes = await routeRequest.load(destination);
      if (!routes || ride || useAppStore.getState().destination !== destination) return;
      const result = scoreRoutes(routes, new Date(clock()), fieldContext());
      useAppStore.setState({ routes: result.routes, selectedRouteId: result.selectedId });
    } catch (error) {
      diagnose(
        `Routes to ${destination}; ${destination === 'swargate' ? 'bundled roads retained' : 'unavailable'}`,
        error,
      );
      useAppStore.setState({ routesUnavailable: destination !== 'swargate' });
    } finally {
      if (requestId === routeLoadId && useAppStore.getState().destination === destination)
        useAppStore.setState({ routesLoading: false });
    }
  },
  selectRoute(id: string) {
    if (!ride && useAppStore.getState().routes.some((route) => route.id === id))
      useAppStore.setState({ selectedRouteId: id });
  },
  startRide() {
    const state = useAppStore.getState();
    if (ride) return true;
    const route = state.routes.find((item) => item.id === state.selectedRouteId);
    if (!route) return false;
    if (
      state.preferences.helmet &&
      (state.connection !== 'connected' || state.telemetry?.state !== HelmetState.Running)
    ) {
      toast('armFirst', undefined, 2);
      return false;
    }
    routeRequest.cancel();
    lengths = routeLengths(route.coordinates);
    ride = {
      route: { ...route, coordinates: [...route.coordinates] },
      movement: { meters: 0, stopSeconds: 0, nextSignal: 1 },
      exposure: emptyExposure(),
      paused: false,
    };
    alertMemory.zoneIds = [];
    useAppStore.setState((current) => ({
      ride: { ...ride! },
      summary: null,
      routesLoading: false,
      snapshot: {
        ...current.snapshot,
        position: route.coordinates[0],
        road: roadName(route, 0),
        elapsedSeconds: 0,
      },
    }));
    return true;
  },
  startDemoRide() {
    if (!ride) {
      const result = scoreRoutes(BUNDLED_ROUTES, new Date(clock()), fieldContext());
      routeRequest.cancel();
      useAppStore.setState({
        destination: 'swargate',
        routes: result.routes,
        selectedRouteId: result.selectedId,
        routesUnavailable: false,
        routesLoading: false,
      });
    }
    return actions.startRide();
  },
  async stopRide() {
    if (!ride) return;
    const exposure = ride.exposure;
    ride = null;
    lengths = [];
    useAppStore.setState({ ride: null, summary: summarize(exposure) });
    if (
      useAppStore.getState().connection === 'connected' &&
      sim.getTelemetry().state !== HelmetState.Connected
    ) {
      try {
        await send(Opcode.Disarm);
      } catch (error) {
        diagnose('Stop ride disarm', error);
      }
    } else if (sim.getTelemetry().state === HelmetState.Running) {
      // A local simulator can honour Stop while its transport is deliberately disconnected.
      actions.pressButton();
      diagnose('Stop ride', 'Disconnected simulated module disarmed through its local button');
    }
    lastDuty = null;
  },
  closeSummary() {
    useAppStore.setState({ summary: null });
  },
  reset() {
    routeRequest.cancel();
    queue.clear();
    modelMs = clock();
    lastWallMs = modelMs;
    lastPublishMs = modelMs;
    lastPacketMs = modelMs;
    sim = new SimHelmetLink(modelMs);
    queue = new CommandQueue(sim);
    subscribeLink();
    sensor = { packetBase: 0, base: 0, factor: 1 };
    beforeDrop = null;
    reconnectPending = false;
    suppressReconnect = true;
    reconnectAtMs = Infinity;
    spikeStartMs = -Infinity;
    spikeUntilMs = -Infinity;
    lastDuty = null;
    lastCommandMs = -Infinity;
    awaitingDisarm = false;
    history = [];
    ride = null;
    lengths = [];
    rushPending = null;
    const air = getAir(
      fieldPm25(CENTER, new Date(clock()), { scenario: 'busy', schoolRush: false, seed: SEED }),
    );
    insideValue = air.pm25;
    displayOutside = { air, lastBandMs: modelMs };
    displayInside = { air, lastBandMs: modelMs };
    fan = { duty: 70, reason: 'eco', eco: { isOn: false, startedMs: 0 } };
    alertMemory = emptyAlertMemory(air.band);
    const routes = scoreRoutes(BUNDLED_ROUTES, new Date(clock()), {
      scenario: 'busy',
      schoolRush: false,
      seed: SEED,
    });
    useAppStore.setState({
      connection: 'disconnected',
      telemetry: null,
      scenario: 'busy',
      schoolRush: false,
      speed: 4,
      ride: null,
      summary: null,
      alerts: [],
      toast: null,
      checkVisible: false,
      packetCount: 0,
      connectionStartedMs: null,
      destination: 'swargate',
      routes: routes.routes,
      selectedRouteId: routes.selectedId,
      routesLoading: false,
      routesUnavailable: false,
      snapshot: {
        nowMs: clock(),
        position: CENTER,
        road: 'Bibwewadi Road',
        outside: air,
        inside: air,
        actualOutside: air,
        fan,
        ahead: null,
        elapsedSeconds: 0,
      },
    });
  },
  debug() {
    return {
      telemetry: sim.getTelemetry(),
      modelMs,
      lastCommand: sim.lastCommand,
      locateCount: sim.locateCount,
    };
  },
  report: diagnose,
  // A fixed clock makes reset, weather and replay verifiable without changing the device clock.
  setClockForTest(value: () => number) {
    clock = value;
    actions.reset();
  },
};
