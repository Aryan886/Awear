import React, { useEffect } from 'react';
import { Pressable, Vibration, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Flags, HelmetState } from '../helmet/protocol';
import { actions, useAppStore } from '../state/appStore';
import { BAND_COLORS, type Band } from '../model/air';
import { duration, number } from '../i18n';
import { colors } from '../theme';
import {
  AirBadge,
  AirTile,
  Button,
  Card,
  CheckItem,
  HelmetArt,
  Label,
  Row,
  SafeLevel,
  ScoreRing,
} from './ui';
import { Sheet } from './Sheet';

export function RideBar() {
  const { t } = useTranslation();
  const ride = useAppStore((state) => state.ride);
  const snapshot = useAppStore((state) => state.snapshot);
  const foreground = useAppStore((state) => state.foreground);
  const connection = useAppStore((state) => state.connection);
  const telemetry = useAppStore((state) => state.telemetry);
  const helmet = useAppStore((state) => state.preferences.helmet);
  const activeRide = !!ride && !ride.paused && foreground;
  useEffect(() => {
    if (activeRide)
      void activateKeepAwakeAsync('awear-ride').catch((error) =>
        actions.report('Keep screen awake', error),
      );
    else void deactivateKeepAwake('awear-ride');
    return () => {
      void deactivateKeepAwake('awear-ride');
    };
  }, [activeRide]);
  const disconnected =
    helmet && connection !== 'connected' && telemetry?.state === HelmetState.Running;
  if (!ride && !disconnected) return null;
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: colors.deep,
        gap: 8,
      }}
    >
      {disconnected && (
        <Pressable onPress={actions.connect}>
          <Label size={11} style={{ color: 'white' }}>
            {t('disconnected')} · {t('reconnect')}
          </Label>
        </Pressable>
      )}
      {ride && (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ flex: 1 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: BAND_COLORS[snapshot.outside.band],
                }}
              />
              <Label size={12} bold style={{ color: 'white', fontVariant: ['tabular-nums'] }}>
                {duration(snapshot.elapsedSeconds)}
              </Label>
              <Label size={10} style={{ color: '#D6D0F3', flexShrink: 1 }}>
                {ride.paused ? t('paused') : snapshot.road}
              </Label>
            </Row>
            {ride.paused && (
              <Pressable accessibilityRole="button" onPress={actions.resumeRide}>
                <Label size={12} bold style={{ color: colors.clean }}>
                  {t('resume')}
                </Label>
              </Pressable>
            )}
            <Pressable
              testID="stop-ride"
              accessibilityRole="button"
              onPress={() => {
                void actions.stopRide();
              }}
              style={{
                paddingHorizontal: 15,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: '#FFFFFF22',
              }}
            >
              <Label size={12} bold style={{ color: 'white' }}>
                {t('stop')}
              </Label>
            </Pressable>
          </Row>
          {ride.paused && (
            <Label size={10} style={{ color: '#D6D0F3' }}>
              {t('pausedBody')}
            </Label>
          )}
        </>
      )}
    </View>
  );
}

export function SessionPanels() {
  const { t } = useTranslation();
  const packet = useAppStore((state) => state.telemetry);
  const visible = useAppStore((state) => state.checkVisible);
  const summary = useAppStore((state) => state.summary);
  const toast = useAppStore((state) => state.toast);
  const insets = useSafeAreaInsets();
  const state = packet?.state ?? HelmetState.Connected;
  const progress = packet?.testProgress ?? 0;
  const testOnly = !!((packet?.flags ?? 0) & Flags.testOnly);
  useEffect(() => {
    if (
      !visible ||
      (state !== HelmetState.Running && !(testOnly && state === HelmetState.Connected))
    )
      return;
    const timer = setTimeout(actions.hideCheck, 1000);
    return () => clearTimeout(timer);
  }, [visible, state, testOnly]);
  useEffect(() => {
    if (!toast) return;
    if (toast.key.startsWith('alert_')) Vibration.vibrate([0, 200, 100, 200]);
    else if (toast.key === 'armed') Vibration.vibrate(120);
    else if (toast.key === 'locating') Vibration.vibrate([0, 100, 150, 100, 150, 100]);
    const timer = setTimeout(() => actions.clearToast(toast.id), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <>
      <Sheet visible={visible && !summary} title={t('checkTitle')} onClose={actions.hideCheck}>
        <View style={{ alignItems: 'center' }}>
          <HelmetArt size={170} />
        </View>
        <Label muted style={{ textAlign: 'center' }}>
          {t(testOnly ? 'testOnly' : 'checkBody')}
        </Label>
        <Card>
          <CheckItem label={t('outsideSensor')} complete={progress >= 8} active={progress < 15} />
          <CheckItem
            label={t('insideSensor')}
            complete={progress >= 23}
            active={progress >= 15 && progress < 30}
          />
          <CheckItem
            label={t('fan')}
            complete={progress >= 55}
            active={!!((packet?.flags ?? 0) & Flags.fanTest)}
          />
          <CheckItem
            label={t('calibrating')}
            complete={progress >= 95}
            active={progress >= 70 && progress < 100}
          />
          {!testOnly && (
            <CheckItem
              label={t(state === HelmetState.Running ? 'armed' : 'arming')}
              complete={state === HelmetState.Running}
              active={state === HelmetState.Arming}
            />
          )}
        </Card>
        <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
          <View
            style={{
              height: 6,
              width: `${progress}%`,
              backgroundColor: colors.primary,
              borderRadius: 3,
            }}
          />
        </View>
        <Label muted size={11} style={{ textAlign: 'center' }}>
          {number(progress)}%
        </Label>
        {state === HelmetState.Running && (
          <Label bold style={{ textAlign: 'center', color: colors.primary }}>
            {t('checkPassed')}
          </Label>
        )}
      </Sheet>
      <Sheet visible={!!summary} title={t('summary')} onClose={actions.closeSummary}>
        {summary && (
          <>
            {summary.score !== null ? (
              <View style={{ alignItems: 'center' }}>
                <Label muted size={12}>
                  {t('cleanScore')}
                </Label>
                <ScoreRing score={summary.score} />
                {summary.inside && <AirBadge air={summary.inside} />}
              </View>
            ) : (
              <Card>
                <Label bold>{t('outsideExposure')}</Label>
                <AirBadge air={summary.outside} />
              </Card>
            )}
            <Row style={{ alignItems: 'stretch' }}>
              <AirTile air={summary.outside} />
              {summary.inside && <AirTile air={summary.inside} inside />}
            </Row>
            <SafeLevel pm25={summary.outside.pm25} />
            {summary.cleaner !== null && (
              <Label bold style={{ color: colors.primary }}>
                {t('cleaner', { value: number(summary.cleaner) })}
              </Label>
            )}
            <Card>
              {summary.breaths !== null && (
                <Label bold>{t('breaths', { value: number(summary.breaths) })}</Label>
              )}
              <Row style={{ justifyContent: 'space-between' }}>
                <Label muted>{t('duration')}</Label>
                <Label bold>{duration(summary.seconds)}</Label>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label muted style={{ flex: 1 }}>
                  {t('schoolTime')}
                </Label>
                <Label bold>{duration(summary.schoolSeconds)}</Label>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label muted>{t('mappedDistance')}</Label>
                <Label bold>{number(summary.distanceMeters / 1000, 2)} km</Label>
              </Row>
            </Card>
            <Card>
              <Label bold size={13}>
                {t('exposureStrip')}
              </Label>
              {summary.seconds <= 1 && (
                <Label size={11} muted>
                  {t('emptyRide')}
                </Label>
              )}
              {[false, true]
                .filter((inside) => !inside || summary.inside)
                .map((inside) => (
                  <View key={String(inside)} style={{ gap: 6 }}>
                    <Label size={11} muted>
                      {t(inside ? 'insideExposure' : 'outsideExposure')}
                    </Label>
                    <Row style={{ gap: 0, height: 12, overflow: 'hidden', borderRadius: 6 }}>
                      {summary.strips.map((strip, index) => (
                        <View
                          key={index}
                          style={{
                            flex: strip.seconds,
                            height: 12,
                            backgroundColor:
                              BAND_COLORS[(inside ? (strip.inside ?? 0) : strip.outside) as Band],
                          }}
                        />
                      ))}
                    </Row>
                  </View>
                ))}
            </Card>
            <Button label={t('done')} onPress={actions.closeSummary} />
          </>
        )}
      </Sheet>
      {toast && (
        <Pressable
          accessibilityLiveRegion="polite"
          onPress={() => actions.clearToast(toast.id)}
          style={{
            position: 'absolute',
            top: insets.top + 72,
            left: 14,
            right: 14,
            elevation: 15,
            backgroundColor: 'white',
            borderRadius: 16,
            borderLeftWidth: 4,
            borderLeftColor: BAND_COLORS[toast.band as Band],
            padding: 16,
            shadowColor: colors.deep,
            shadowOpacity: 0.15,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Label bold size={12}>
            {t(toast.key, toast.values)}
          </Label>
        </Pressable>
      )}
    </>
  );
}
