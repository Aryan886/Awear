import React, { useCallback, useState } from 'react';
import { Switch, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AirBadge, Button, Card, Label, Legend, Page, Row } from '../components/ui';
import { PollutionMap } from '../components/PollutionMap';
import { Sheet } from '../components/Sheet';
import { useAppStore } from '../state/appStore';
import { MAP_TILE_URL, SEED, ZONES } from '../config';
import { cleanestHour, fieldPm25, getCellCenter } from '../model/simulation';
import { getAir } from '../model/air';
import { time } from '../i18n';
import { colors } from '../theme';
import { AirHero } from './HomeScreen';
import type { RootParams } from '../navigation';

export function MapScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const snapshot = useAppStore((state) => state.snapshot);
  const scenario = useAppStore((state) => state.scenario);
  const schoolRush = useAppStore((state) => state.schoolRush);
  const ride = useAppStore((state) => state.ride);
  const routes = useAppStore((state) => state.routes);
  const selected = useAppStore((state) => state.selectedRouteId);
  const [hour, setHour] = useState(0);
  const [tiles, setTiles] = useState(!!MAP_TILE_URL);
  const [cell, setCell] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const onCell = useCallback((id: number) => {
    setCell(id);
    setZoneId(null);
  }, []);
  const onZone = useCallback((id: string) => {
    setZoneId(id);
    setCell(null);
  }, []);
  const zone = ZONES.find((item) => item.id === zoneId);
  const position = zone?.center ?? (cell !== null ? getCellCenter(cell) : snapshot.position);
  const date = new Date(snapshot.nowMs + hour * 3600000);
  const air = getAir(fieldPm25(position, date, { scenario, schoolRush, seed: SEED }));
  const clean = cleanestHour(position, date, { scenario, schoolRush, seed: SEED });
  const isTomorrow = date.getDate() !== new Date(snapshot.nowMs).getDate();
  return (
    <Page scroll={false}>
      <View style={{ paddingHorizontal: 22, paddingBottom: 14, gap: 8 }}>
        <Label size={28} bold style={{ color: colors.deep }}>
          {t('liveMap')}
        </Label>
        <Label size={11} muted>
          {t('mappedRiders')}
        </Label>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <PollutionMap
          nowMs={snapshot.nowMs}
          position={snapshot.position}
          scenario={scenario}
          schoolRush={schoolRush}
          hour={hour}
          route={ride?.route ?? routes.find((route) => route.id === selected)}
          riding={!!ride}
          tiles={tiles}
          onCell={onCell}
          onZone={onZone}
        />
        <View
          style={{ position: 'absolute', top: 12, left: 14, right: 14, alignItems: 'flex-start' }}
        >
          <View style={{ backgroundColor: '#FFFFFFEE', borderRadius: 14, padding: 10 }}>
            <AirBadge air={snapshot.outside} compact />
            <Label size={9} muted>
              {snapshot.road}
            </Label>
          </View>
        </View>
      </View>
      <View style={{ padding: 15, gap: 10, backgroundColor: 'white' }}>
        <Legend />
        <Row style={{ justifyContent: 'space-between' }}>
          <Label size={11} bold>
            {hour === 0
              ? t('now')
              : `${isTomorrow ? `${t('tomorrow')} · ` : ''}${t('typicalHour', { hour: time(date.getTime()) })}`}
          </Label>
          <Row style={{ gap: 4 }}>
            <Label muted size={9}>
              {t(MAP_TILE_URL ? 'mapTiles' : 'offlineMap')}
            </Label>
            <Switch
              value={tiles}
              disabled={!MAP_TILE_URL}
              onValueChange={setTiles}
              trackColor={{ true: colors.primary, false: colors.line }}
            />
          </Row>
        </Row>
        <Slider
          accessibilityLabel={t('typicalHour', { hour })}
          value={hour}
          onValueChange={setHour}
          minimumValue={0}
          maximumValue={24}
          step={1}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.line}
          thumbTintColor={colors.primary}
        />
        <Label size={8} muted style={{ textAlign: 'center' }}>
          {t('attribution')}
        </Label>
      </View>
      <Sheet
        visible={cell !== null || zoneId !== null}
        title={zone?.name ?? t('cell')}
        onClose={() => {
          setCell(null);
          setZoneId(null);
        }}
      >
        <AirHero air={air} />
        <Card>
          <Label size={12}>
            {t(clean.tomorrow ? 'cleanHourTomorrow' : 'cleanHourToday', {
              hour: time(clean.timeMs),
            })}
          </Label>
          {zone && (
            <>
              <Label size={11} muted>
                {t('historicalCard')}
              </Label>
              <Button
                label={t('viewAction')}
                onPress={() => {
                  setZoneId(null);
                  navigation.navigate('Action', { zoneId: zone.id });
                }}
              />
            </>
          )}
        </Card>
      </Sheet>
    </Page>
  );
}
