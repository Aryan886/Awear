import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCheck, Send, ShieldCheck } from 'lucide-react-native';
import { AirBadge, Button, Card, Chip, Label, Page, Row, Title } from '../components/ui';
import { useAppStore } from '../state/appStore';
import { SEED, ZONES } from '../config';
import { cleanestHour, fieldPm25 } from '../model/simulation';
import { getAir } from '../model/air';
import { time } from '../i18n';
import { colors } from '../theme';
import type { RootParams } from '../navigation';

function useCard(zoneId: string) {
  const snapshot = useAppStore((state) => state.snapshot);
  const scenario = useAppStore((state) => state.scenario);
  const schoolRush = useAppStore((state) => state.schoolRush);
  const zone = ZONES.find((item) => item.id === zoneId) ?? ZONES[0];
  const context = { scenario, schoolRush, seed: SEED };
  const date = new Date(snapshot.nowMs);
  return {
    zone,
    nowMs: snapshot.nowMs,
    air: getAir(fieldPm25(zone.center, date, context)),
    clean: cleanestHour(zone.center, date, context),
  };
}
function CardContent({ zoneId, audience }: { zoneId: string; audience: string }) {
  const { t } = useTranslation();
  const { zone, air, nowMs, clean } = useCard(zoneId);
  return (
    <View style={{ gap: 18 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AirBadge air={air} />
        <Label size={10} muted>
          {time(nowMs)}
        </Label>
      </Row>
      <Title size={23}>{zone.name}</Title>
      <View style={{ gap: 7 }}>
        <Label bold>{t('happening')}</Label>
        <Label size={13}>
          {t('happeningBody', { zone: zone.name, band: t(`band${air.band}`) })}
        </Label>
      </View>
      <View
        style={{ gap: 7, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 14 }}
      >
        <Label bold style={{ color: colors.primary }}>
          {t('doNow')}
        </Label>
        <Label size={13}>{t(`now_${audience}`)}</Label>
      </View>
      <View style={{ gap: 7 }}>
        <Label bold>{t('thisWeek')}</Label>
        <Label size={13}>{t(`week_${audience}`, { hour: time(clean.timeMs) })}</Label>
      </View>
      <View style={{ gap: 7 }}>
        <Label bold>{t('lastWeek')}</Label>
        <Label size={13} muted>
          {t('lastWeekBody')}
        </Label>
      </View>
      <Label size={9} muted>
        {t('aiCredit')}
      </Label>
    </View>
  );
}
export function ActionScreen({ route, navigation }: NativeStackScreenProps<RootParams, 'Action'>) {
  const { t } = useTranslation();
  const [audience, setAudience] = useState('school');
  return (
    <Page title={t('actionCard')}>
      <Row style={{ flexWrap: 'wrap' }}>
        {['rider', 'school', 'hospital', 'parent'].map((item) => (
          <Chip
            key={item}
            label={t(item)}
            selected={audience === item}
            onPress={() => setAudience(item)}
          />
        ))}
      </Row>
      <Card>
        <CardContent zoneId={route.params.zoneId} audience={audience} />
      </Card>
      <Button
        label={t('openTelegram')}
        onPress={() => navigation.navigate('Telegram', { zoneId: route.params.zoneId, audience })}
      />
    </Page>
  );
}
export function TelegramScreen({ route }: NativeStackScreenProps<RootParams, 'Telegram'>) {
  const { t } = useTranslation();
  const { nowMs } = useCard(route.params.zoneId);
  return (
    <Page title={t('telegram')}>
      <Card style={{ backgroundColor: '#E5F1FA' }}>
        <Row>
          <View style={{ padding: 12, borderRadius: 25, backgroundColor: '#348EC3' }}>
            <Send color="white" size={24} />
          </View>
          <Label bold size={17}>
            AWEAR Alerts
          </Label>
          <ShieldCheck size={16} color="#348EC3" />
        </Row>
        <Label size={11} muted>
          {t('previewOnly')}
        </Label>
      </Card>
      <View style={{ padding: 17, backgroundColor: '#E4EDF2', borderRadius: 24 }}>
        <View
          style={{
            backgroundColor: 'white',
            borderRadius: 18,
            borderBottomLeftRadius: 4,
            padding: 18,
            gap: 12,
          }}
        >
          <CardContent zoneId={route.params.zoneId} audience={route.params.audience} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Label size={10} muted>
              {time(nowMs)}
            </Label>
            <CheckCheck size={16} color="#348EC3" />
          </Row>
        </View>
      </View>
    </Page>
  );
}
