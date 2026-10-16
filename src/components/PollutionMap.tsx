import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
  RasterSource,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point, Polygon, LineString } from 'geojson';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Hospital, Trees, Navigation } from 'lucide-react-native';
import { CENTER, MAP_TILE_URL, SEED, ZONES, type Scenario } from '../config';
import bundled from '../routes/swargate.json';
import { BAND_COLORS, getAir } from '../model/air';
import { fieldPm25, fleetPositions, getCellCenter, GRID_GEOMETRY } from '../model/simulation';
import { offset, type Coordinate } from '../model/geometry';
import { routeBandSegments, type Route } from '../routes/routeService';
import { actions } from '../state/appStore';
import { colors } from '../theme';
import { Label } from './ui';

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#F0EFF2' } }],
};
const stations: Coordinate[] = [
  [73.858, 18.4745],
  [73.877, 18.4835],
];
const localRoads: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: bundled.routes.map((road) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: road.coordinates },
  })),
};

export const PollutionMap = memo(function PollutionMap({
  nowMs,
  position,
  scenario,
  schoolRush,
  hour = 0,
  route,
  tiles,
  onCell,
  onZone,
  riding = false,
}: {
  nowMs: number;
  position: Coordinate;
  scenario: Scenario;
  schoolRush: boolean;
  hour?: number;
  route?: Route;
  tiles: boolean;
  onCell: (id: number) => void;
  onZone: (id: string) => void;
  riding?: boolean;
}) {
  const { t } = useTranslation();
  const bucket = Math.floor(nowMs / 5000);
  const grid = useMemo<FeatureCollection<Polygon>>(() => {
    const date = new Date(bucket * 5000 + hour * 3600000);
    return {
      type: 'FeatureCollection',
      features: GRID_GEOMETRY.features.map((feature) => {
        const pm25 = fieldPm25(getCellCenter(Number(feature.id)), date, {
          scenario,
          schoolRush,
          seed: SEED,
        });
        return {
          ...feature,
          properties: { id: feature.id, pm25, color: BAND_COLORS[getAir(pm25).band] },
        };
      }),
    };
  }, [bucket, hour, scenario, schoolRush]);
  const fleet: FeatureCollection<Point> = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: fleetPositions(nowMs / 1000).map((point, index) => ({
        type: 'Feature',
        id: index,
        properties: {},
        geometry: { type: 'Point', coordinates: point },
      })),
    }),
    [nowMs],
  );
  const zones: FeatureCollection<Polygon> = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: ZONES.map((zone) => {
        const ring = [];
        for (let index = 0; index <= 48; index += 1)
          ring.push(
            offset(
              zone.center,
              Math.cos((index / 48) * Math.PI * 2) * zone.radius,
              Math.sin((index / 48) * Math.PI * 2) * zone.radius,
            ),
          );
        const air = getAir(
          fieldPm25(zone.center, new Date(bucket * 5000 + hour * 3600000), {
            scenario,
            schoolRush,
            seed: SEED,
          }),
        );
        return {
          type: 'Feature',
          properties: { id: zone.id, color: BAND_COLORS[air.band] },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      }),
    }),
    [bucket, hour, scenario, schoolRush],
  );
  const routeData: FeatureCollection<LineString> = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: route
        ? routeBandSegments(route, new Date(bucket * 5000), {
            scenario,
            schoolRush,
            seed: SEED,
          }).map((segment) => ({
            type: 'Feature',
            properties: { color: BAND_COLORS[segment.band] },
            geometry: { type: 'LineString', coordinates: [segment.start, segment.end] },
          }))
        : [],
    }),
    [route, bucket, scenario, schoolRush],
  );
  return (
    <Map
      mapStyle={mapStyle}
      style={{ flex: 1 }}
      androidView="texture"
      attribution={false}
      logo={false}
      compass
      onDidFailLoadingMap={() =>
        actions.report('Native map style', 'MapLibre reported a load failure')
      }
    >
      <Camera
        initialViewState={{ center: [CENTER[0], CENTER[1] + 0.012], zoom: 12.6 }}
        {...(riding ? { center: position, zoom: 14.5, duration: 500 } : {})}
      />
      {tiles && MAP_TILE_URL && (
        <RasterSource
          id="carto"
          tiles={[MAP_TILE_URL]}
          tileSize={256}
          attribution="© OpenStreetMap contributors © CARTO"
        >
          <Layer id="carto-layer" type="raster" paint={{ 'raster-opacity': 0.75 }} />
        </RasterSource>
      )}
      <GeoJSONSource id="local-roads" data={localRoads}>
        <Layer
          id="local-road-lines"
          type="line"
          paint={{ 'line-color': '#FFFFFF', 'line-width': 3 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </GeoJSONSource>
      <GeoJSONSource
        id="cells"
        data={grid}
        onPress={(event) => {
          event.stopPropagation();
          const id = event.nativeEvent.features[0]?.properties?.id;
          if (typeof id === 'number') onCell(id);
        }}
      >
        <Layer
          id="cell-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.4,
            'fill-outline-color': '#FFFFFF44',
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource
        id="zone-polygons"
        data={zones}
        onPress={(event) => {
          event.stopPropagation();
          const id = event.nativeEvent.features[0]?.properties?.id;
          if (typeof id === 'string') onZone(id);
        }}
      >
        <Layer
          id="zone-fill"
          type="fill"
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 }}
        />
        <Layer
          id="zone-outline"
          type="line"
          paint={{ 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [3, 2] }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="route" data={routeData}>
        <Layer id="route-halo" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 8 }} />
        <Layer
          id="route-line"
          type="line"
          paint={{ 'line-color': ['get', 'color'], 'line-width': 5 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="fleet" data={fleet}>
        <Layer
          id="rider-dots"
          type="circle"
          paint={{
            'circle-radius': 2.5,
            'circle-color': colors.primary,
            'circle-opacity': 0.65,
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1,
          }}
        />
      </GeoJSONSource>
      {ZONES.map((zone) => (
        <Marker key={zone.id} lngLat={zone.center} onPress={() => onZone(zone.id)}>
          <View style={{ alignItems: 'center', maxWidth: 130, gap: 2 }}>
            <View style={{ padding: 7, backgroundColor: 'white', borderRadius: 12, elevation: 2 }}>
              {zone.kind === 'school' ? (
                <GraduationCap size={17} color={colors.deep} />
              ) : zone.kind === 'hospital' ? (
                <Hospital size={17} color={colors.deep} />
              ) : (
                <Trees size={17} color={colors.deep} />
              )}
            </View>
            <Label
              size={8}
              bold
              style={{
                backgroundColor: '#FFFFFFE6',
                borderRadius: 4,
                paddingHorizontal: 3,
                textAlign: 'center',
              }}
            >
              {zone.name}
            </Label>
          </View>
        </Marker>
      ))}
      {stations.map((station, index) => {
        let average = 0;
        for (const east of [-300, 0, 300])
          for (const north of [-300, 0, 300])
            average +=
              fieldPm25(offset(station, east, north), new Date(bucket * 5000 + hour * 3600000), {
                scenario,
                schoolRush,
                seed: SEED,
              }) / 9;
        const air = getAir(average);
        return (
          <Marker key={`station-${index}`} lngLat={station}>
            <View
              style={{
                backgroundColor: '#FFFFFFE8',
                borderColor: colors.smoke,
                borderWidth: 1,
                borderRadius: 5,
                padding: 4,
                maxWidth: 95,
              }}
            >
              <Label size={8} bold>
                {t('cityStation')}
              </Label>
              <Label size={8}>
                {t(`band${air.band}`)} · AQI {air.aqi}
              </Label>
            </View>
          </Marker>
        );
      })}
      <Marker lngLat={position}>
        <View
          style={{
            backgroundColor: colors.primary,
            borderWidth: 3,
            borderColor: 'white',
            borderRadius: 22,
            padding: 8,
            elevation: 5,
          }}
        >
          <Navigation size={17} color="white" fill="white" />
        </View>
      </Marker>
    </Map>
  );
});
