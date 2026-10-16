import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bluetooth, ChevronDown, ShieldCheck, Sparkles } from 'lucide-react-native';
import {
  AirBadge,
  Airflow,
  AirTile,
  Breathing,
  Button,
  Card,
  Chip,
  Divider,
  ForecastChart,
  Label,
  Page,
  Row,
  SafeLevel,
} from '../components/ui';
import { actions, useAppStore } from '../state/appStore';
import { BAND_COLORS, cleanerPercent, type Air } from '../model/air';
import { cleanestHour, forecast } from '../model/simulation';
import { SEED, ZONES } from '../config';
import { HelmetState } from '../helmet/protocol';
import { number, time } from '../i18n';
import { airTints, colors } from '../theme';
import type { RootParams } from '../navigation';

export function AirHero({ air, details: defaultDetails = false }: { air: Air; details?: boolean }) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(defaultDetails);
  const helmet = useAppStore((state) => state.preferences.helmet);
  const telemetry = useAppStore((state) => state.telemetry);
  return (
    <Breathing>
      <Card
        style={{
          backgroundColor: airTints[air.band],
          borderWidth: 1,
          borderColor: `${BAND_COLORS[air.band]}25`,
          gap: 12,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Label size={10} bold style={{ letterSpacing: 1.6 }}>
            {t('airAround')}
          </Label>
          <Label muted size={11}>
            AQI {air.aqi}
          </Label>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label size={43} bold style={{ letterSpacing: -1.5, color: colors.deep, flexShrink: 1 }}>
            {t(`band${air.band}`)}
          </Label>
          <View
            style={{ backgroundColor: `${BAND_COLORS[air.band]}25`, padding: 13, borderRadius: 22 }}
          >
            <Sparkles size={29} color={BAND_COLORS[air.band]} />
          </View>
        </Row>
        <Label size={15}>{t(`scene${air.band}`)}</Label>
        <SafeLevel pm25={air.pm25} />
        <Divider />
        <Label size={13}>{t(`${helmet ? 'helmetTip' : 'appTip'}${air.band}`)}</Label>
        <Label muted size={11}>
          {t('mainCause', {
            cause: `${t(air.cause)} (${air.cause === 'pm25' ? 'PM2.5' : air.cause.toUpperCase()})`,
          })}
        </Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label muted size={10}>
            {t('updated')}
          </Label>
          <Pressable accessibilityRole="button" onPress={() => setDetails(!details)}>
            <Row style={{ gap: 3 }}>
              <Label size={11} bold style={{ color: colors.deep }}>
                {t(details ? 'hideDetails' : 'details')}
              </Label>
              <ChevronDown color={colors.deep} size={14} />
            </Row>
          </Pressable>
        </Row>
        {details && (
          <View style={{ gap: 12 }}>
            <Divider />
            <Label size={12}>
              AQI {air.aqi} · {t(`category${air.band}`)}
            </Label>
            {(['pm25', 'pm10', 'no2', 'co'] as const).map((pollutant) => (
              <View key={pollutant} style={{ gap: 5 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label size={12} bold={air.cause === pollutant}>
                    {t(pollutant)} ·{' '}
                    {pollutant === 'pm25'
                      ? 'PM2.5'
                      : pollutant === 'pm10'
                        ? 'PM10'
                        : pollutant === 'no2'
                          ? 'NO₂'
                          : 'CO'}
                  </Label>
                  <Label size={12}>
                    {number(air[pollutant], pollutant === 'co' ? 1 : 0)}{' '}
                    {pollutant === 'co' ? 'mg/m³' : 'µg/m³'}
                  </Label>
                </Row>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.line }}>
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      width: `${Math.min(100, (air[pollutant] / (pollutant === 'co' ? 5 : 200)) * 100)}%`,
                      backgroundColor: BAND_COLORS[air.band],
                    }}
                  />
                </View>
              </View>
            ))}
            {telemetry && (
              <Label size={11} muted>
                {t('sensorRatio', {
                  value: number(
                    telemetry.outsideBase > 0 ? telemetry.outsideRaw / telemetry.outsideBase : 1,
                    1,
                  ),
                })}
              </Label>
            )}
          </View>
        )}
      </Card>
    </Breathing>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const snapshot = useAppStore((state) => state.snapshot);
  const preferences = useAppStore((state) => state.preferences);
  const telemetry = useAppStore((state) => state.telemetry);
  const connection = useAppStore((state) => state.connection);
  const scenario = useAppStore((state) => state.scenario);
  const schoolRush = useAppStore((state) => state.schoolRush);
  const context = { scenario, schoolRush, seed: SEED };
  const hours = forecast(
    snapshot.position,
    new Date(snapshot.nowMs),
    context,
    snapshot.outside.pm25,
  );
  const cleanest = cleanestHour(snapshot.position, new Date(snapshot.nowMs), context);
  const running = telemetry?.state === HelmetState.Running;
  const status =
    connection === 'connecting'
      ? 'pairing'
      : connection !== 'connected'
        ? 'waiting'
        : ['boot', 'waiting', 'connected', 'testing', 'arming', 'armedFan'][telemetry?.state ?? 2];
  const zone = ZONES.find((item) => item.id === snapshot.ahead?.zoneId);
  const fanLevel =
    snapshot.fan.duty === 100
      ? 'high'
      : snapshot.fan.duty === 70
        ? 'medium'
        : snapshot.fan.duty === 40
          ? 'low'
          : 'off';
  return (
    <Page>
      <Row>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />
        <Label muted size={12}>
          {t('near', { place: snapshot.road })}
        </Label>
      </Row>
      <AirHero
        key={String(preferences.details)}
        air={snapshot.outside}
        details={preferences.details}
      />
      {preferences.helmet ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label size={10} bold style={{ letterSpacing: 1.5 }}>
              {t('yourHelmet')}
            </Label>
            <Bluetooth
              size={16}
              color={connection === 'connected' ? colors.primary : colors.smoke}
            />
          </Row>
          <Row>
            <ShieldCheck size={22} color={running ? colors.primary : colors.muted} />
            <Label bold size={13} style={{ flex: 1 }}>
              {t(status, { duty: telemetry?.fanPct ?? 0 })}
            </Label>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: running ? colors.clean : '#D9B558',
              }}
            />
          </Row>
          <Row style={{ alignItems: 'stretch' }}>
            <AirTile air={snapshot.outside} />
            <AirTile air={snapshot.inside} inside />
          </Row>
          <View
            style={{
              alignSelf: 'center',
              paddingVertical: 6,
              paddingHorizontal: 14,
              backgroundColor: '#DCF7EC',
              borderRadius: 99,
            }}
          >
            <Label size={12} bold style={{ color: '#18704C' }}>
              {t('cleaner', {
                value: number(cleanerPercent(snapshot.inside.pm25, snapshot.outside.pm25)),
              })}
            </Label>
          </View>
          <Airflow fanPct={telemetry?.fanPct ?? 0} />
          <Label muted size={11}>
            {t('fanMode')}
          </Label>
          <Row style={{ flexWrap: 'wrap', gap: 7 }}>
            {(['off', 'eco', 'smart', 'always'] as const).map((mode) => (
              <Chip
                key={mode}
                label={t(mode)}
                selected={preferences.fanMode === mode}
                onPress={() => actions.setPreferences({ fanMode: mode })}
              />
            ))}
          </Row>
          {preferences.fanMode === 'always' && (
            <Row style={{ flexWrap: 'wrap' }}>
              {([40, 70, 100] as const).map((duty) => (
                <Chip
                  key={duty}
                  label={t(duty === 40 ? 'low' : duty === 70 ? 'medium' : 'high')}
                  selected={preferences.alwaysDuty === duty}
                  onPress={() => actions.setPreferences({ alwaysDuty: duty })}
                />
              ))}
            </Row>
          )}
          <View style={{ backgroundColor: colors.tint, borderRadius: 16, padding: 13, gap: 4 }}>
            <Label size={11} bold style={{ color: colors.primary }}>
              {t('brain')} · {t('fanDuty', { level: t(fanLevel), duty: snapshot.fan.duty })}
            </Label>
            <Label muted size={11}>
              {t(`reason_${snapshot.fan.reason}`, { zone: zone ? ` · ${zone.name}` : '' })}
            </Label>
          </View>
          <Button
            label={t(connection !== 'connected' ? 'connect' : running ? 'disarm' : 'arm')}
            onPress={() =>
              connection !== 'connected'
                ? navigation.navigate('Connect')
                : running
                  ? actions.disarm()
                  : actions.arm()
            }
            secondary
          />
          <Pressable
            accessibilityRole="button"
            disabled={connection !== 'connected'}
            onPress={() => {
              void actions.locate().catch((error) => actions.report('Find helmet', error));
            }}
          >
            <Label
              size={12}
              style={{
                color: colors.primary,
                textAlign: 'center',
                opacity: connection === 'connected' ? 1 : 0.4,
              }}
            >
              {t('locate')}
            </Label>
          </Pressable>
        </Card>
      ) : (
        <Card>
          <Label bold>{t('findRoute')}</Label>
          <Label muted>{t('appModeBody')}</Label>
        </Card>
      )}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label bold>{t('forecast')}</Label>
          <Sparkles size={18} color={colors.primary} />
        </Row>
        <ForecastChart values={hours} />
        <Row style={{ justifyContent: 'space-between' }}>
          {[hours[0], hours[3], hours[6]].map((hour) => (
            <Label key={hour.timeMs} size={10} muted>
              {time(hour.timeMs)}
            </Label>
          ))}
        </Row>
        <Label size={10} muted>
          {t('forecastCredit')}
        </Label>
        <Label size={12} bold>
          {t(cleanest.tomorrow ? 'cleanHourTomorrow' : 'cleanHourToday', {
            hour: time(cleanest.timeMs),
          })}
        </Label>
      </Card>
      <Button
        label={t(preferences.helmet ? 'startRide' : 'findRoute')}
        onPress={() => navigation.navigate('Tabs', { screen: 'Routes' })}
      />
      <AirBadge air={snapshot.outside} compact />
    </Page>
  );
}
