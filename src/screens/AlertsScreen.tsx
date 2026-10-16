import React from 'react';
import { Pressable, View } from 'react-native';
import { Bell, ChevronRight, Wind } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, Label, Page, Row } from '../components/ui';
import { useAppStore } from '../state/appStore';
import { BAND_COLORS } from '../model/air';
import { ZONES } from '../config';
import { time } from '../i18n';
import { colors } from '../theme';
import type { RootParams } from '../navigation';

export function AlertsScreen() {
  const { t } = useTranslation();
  const alerts = useAppStore((state) => state.alerts);
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  return (
    <Page title={t('alertsTitle')}>
      {alerts.length === 0 && (
        <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Wind size={35} color={colors.primary} />
          <Label bold size={20}>
            {t('noAlerts')}
          </Label>
          <Label muted style={{ textAlign: 'center' }}>
            {t('noAlertsBody')}
          </Label>
        </Card>
      )}
      {alerts.map((alert) => {
        const zone = ZONES.find((item) => item.id === alert.zoneId);
        return (
          <Pressable
            key={alert.id}
            accessibilityRole={zone ? 'button' : 'text'}
            onPress={() => {
              if (zone) navigation.navigate('Action', { zoneId: zone.id });
            }}
          >
            <Card style={{ borderLeftWidth: 3, borderLeftColor: BAND_COLORS[alert.band] }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View
                  style={{
                    padding: 10,
                    backgroundColor: `${BAND_COLORS[alert.band]}14`,
                    borderRadius: 14,
                  }}
                >
                  <Bell color={BAND_COLORS[alert.band]} size={20} />
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Label bold>{t(`alert_${alert.type}`, { zone: zone?.name ?? '' })}</Label>
                  <Label muted size={12}>
                    {t(`${alert.type}Body`)}
                  </Label>
                  <Label muted size={10}>
                    {time(alert.timeMs)}
                  </Label>
                </View>
                {zone && <ChevronRight size={16} color={colors.muted} />}
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Page>
  );
}
