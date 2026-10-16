import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AirBadge, Button, Card, Chip, Label, Page, Row } from '../components/ui';
import { actions, useAppStore } from '../state/appStore';
import { DESTINATIONS, SEED } from '../config';
import { getAir, BAND_COLORS } from '../model/air';
import { routeBandSegments, type Route } from '../routes/routeService';
import type { FieldContext } from '../model/simulation';
import { number } from '../i18n';
import { colors } from '../theme';
import type { RootParams } from '../navigation';

function RoutePreview({
  route,
  context,
  nowMs,
}: {
  route: Route;
  context: FieldContext;
  nowMs: number;
}) {
  const longitudes = route.coordinates.map((point) => point[0]);
  const latitudes = route.coordinates.map((point) => point[1]);
  const left = Math.min(...longitudes);
  const top = Math.max(...latitudes);
  const width = Math.max(0.001, Math.max(...longitudes) - left);
  const height = Math.max(0.001, top - Math.min(...latitudes));
  const project = (point: number[]) =>
    `${16 + ((point[0] - left) / width) * 240},${14 + ((top - point[1]) / height) * 65}`;
  const segments = routeBandSegments(route, new Date(nowMs), context);
  return (
    <View style={{ backgroundColor: colors.background, borderRadius: 16, overflow: 'hidden' }}>
      <Svg height={95} width="100%" viewBox="0 0 275 95">
        <Path
          d={`M${route.coordinates.map(project).join('L')}`}
          fill="none"
          stroke="white"
          strokeWidth="9"
        />
        {segments.map((segment, index) => (
          <Path
            key={index}
            d={`M${project(segment.start)}L${project(segment.end)}`}
            fill="none"
            stroke={BAND_COLORS[segment.band]}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        ))}
      </Svg>
    </View>
  );
}
export function RoutesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const routes = useAppStore((state) => state.routes);
  const selected = useAppStore((state) => state.selectedRouteId);
  const destination = useAppStore((state) => state.destination);
  const loading = useAppStore((state) => state.routesLoading);
  const unavailable = useAppStore((state) => state.routesUnavailable);
  const ride = useAppStore((state) => state.ride);
  const scenario = useAppStore((state) => state.scenario);
  const schoolRush = useAppStore((state) => state.schoolRush);
  const nowMs = useAppStore((state) => Math.floor(state.snapshot.nowMs / 60000) * 60000);
  const fastestSeconds = Math.min(...routes.map((route) => route.durationSec));
  return (
    <Page title={t('routeTitle')}>
      <Card>
        <Row>
          <Label muted size={11}>
            {t('from')}
          </Label>
          <Label bold size={13}>
            {t('currentLocation')}
          </Label>
        </Row>
        <Label muted size={11}>
          {t('to')}
        </Label>
        <Row style={{ flexWrap: 'wrap', gap: 7 }}>
          {DESTINATIONS.map((item) => (
            <Chip
              key={item.id}
              selected={destination === item.id}
              label={item.name}
              onPress={() => {
                if (!ride) void actions.loadRoutes(item.id);
              }}
            />
          ))}
        </Row>
      </Card>
      <Label size={12} muted>
        {t(ride ? 'routeLocked' : 'routeReason')}
      </Label>
      {loading && (
        <Label size={11} muted>
          {t('refreshing')}
        </Label>
      )}
      {unavailable && (
        <Card>
          <Label>{t('routeUnavailable')}</Label>
          <Button label="Swargate" secondary onPress={() => actions.loadRoutes('swargate')} />
        </Card>
      )}
      {routes.map((route) => (
        <Pressable
          key={route.id}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === route.id }}
          onPress={() => actions.selectRoute(route.id)}
        >
          <Card
            style={{
              borderWidth: 1.5,
              borderColor: selected === route.id ? colors.primary : 'transparent',
            }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Label bold size={15} style={{ flex: 1 }}>
                {t('via', { road: route.name })}
              </Label>
              <Label bold size={20} style={{ color: colors.deep }}>
                {t('minutes', { value: number(route.durationSec / 60) })}
              </Label>
            </Row>
            <RoutePreview
              route={route}
              context={{ scenario, schoolRush, seed: SEED }}
              nowMs={nowMs}
            />
            <Row style={{ justifyContent: 'space-between' }}>
              <AirBadge air={getAir(route.averagePm25)} compact />
              <Label size={11} muted>
                {number(route.distanceMeters / 1000, 1)} km
              </Label>
            </Row>
            <Row style={{ flexWrap: 'wrap', gap: 7 }}>
              {route.durationSec === fastestSeconds && (
                <Label
                  size={10}
                  bold
                  style={{ padding: 6, borderRadius: 8, backgroundColor: colors.background }}
                >
                  {t('fastest')}
                </Label>
              )}
              {route.cleaner > 0 && (
                <Label size={11} bold style={{ color: colors.primary }}>
                  {t('routeCleaner', { value: number(route.cleaner), minutes: route.extraMinutes })}
                </Label>
              )}
              {selected === route.id && (
                <Label size={10} bold style={{ color: colors.primary }}>
                  {t('recommended')}
                </Label>
              )}
            </Row>
          </Card>
        </Pressable>
      ))}
      {routes.length > 0 && (
        <Button
          testID="start-route"
          label={t('startSelected')}
          disabled={!!ride}
          onPress={() => {
            if (actions.startRide()) navigation.navigate('Tabs', { screen: 'Map' });
          }}
        />
      )}
      {!ride && (
        <Button
          label={t('refreshRoutes')}
          secondary
          disabled={loading}
          onPress={() => actions.loadRoutes(destination)}
        />
      )}
      <Label size={9} muted>
        {t('attribution')}
      </Label>
    </Page>
  );
}
