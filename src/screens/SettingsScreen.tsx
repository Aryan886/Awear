import React, { useRef, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Chip, Divider, Label, LinkRow, Page, Row } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { actions, useAppStore } from '../state/appStore';
import { MULTILINGUAL_ENABLED, VERSION } from '../config';
import { colors } from '../theme';
import type { RootParams } from '../navigation';

export function SettingsScreen({ navigation }: NativeStackScreenProps<RootParams, 'Settings'>) {
  const { t } = useTranslation();
  const preferences = useAppStore((state) => state.preferences);
  const connection = useAppStore((state) => state.connection);
  const ride = useAppStore((state) => state.ride);
  const [sheet, setSheet] = useState<'how' | 'about' | null>(null);
  const taps = useRef({ count: 0, lastMs: 0 });
  function versionTap() {
    const nowMs = Date.now();
    taps.current.count = nowMs - taps.current.lastMs < 1500 ? taps.current.count + 1 : 1;
    taps.current.lastMs = nowMs;
    if (taps.current.count >= 5) {
      taps.current.count = 0;
      navigation.navigate('Presenter');
    }
  }
  return (
    <Page title={t('settings')}>
      {MULTILINGUAL_ENABLED && (
        <Card>
          <Label bold>{t('language')}</Label>
          <Row style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
                ['mr', 'मराठी'],
              ] as const
            ).map(([language, label]) => (
              <Chip
                key={language}
                label={label}
                selected={preferences.language === language}
                onPress={() => actions.setPreferences({ language })}
              />
            ))}
          </Row>
        </Card>
      )}
      <Card>
        <Label bold>{t('sensitive')}</Label>
        <Label size={12} muted>
          {t('sensitiveBody')}
        </Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['none', 'asthma', 'children', 'elderly'] as const).map((sensitive) => (
            <Chip
              key={sensitive}
              selected={preferences.sensitive === sensitive}
              label={t(sensitive)}
              onPress={() => actions.setPreferences({ sensitive })}
            />
          ))}
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Label style={{ flex: 1 }}>{t('detailsDefault')}</Label>
          <Switch
            value={preferences.details}
            onValueChange={(details) => actions.setPreferences({ details })}
            trackColor={{ true: colors.primary, false: colors.line }}
          />
        </Row>
      </Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label bold style={{ flex: 1 }}>
            {t('helmetSetting')}
          </Label>
          <Switch
            value={preferences.helmet}
            disabled={!!ride}
            onValueChange={(helmet) => {
              void actions
                .setHelmetMode(helmet)
                .catch((error) => actions.report('Change helmet mode', error));
            }}
            trackColor={{ true: colors.primary, false: colors.line }}
          />
        </Row>
        <Label size={13}>AWEAR-3A7C</Label>
        <Label muted size={11}>
          {t('firmware')}
        </Label>
        <Button
          label={t(connection === 'connected' ? 'disconnect' : 'connect')}
          secondary
          disabled={!!ride}
          onPress={() =>
            connection === 'connected' ? actions.disconnect() : navigation.navigate('Connect')
          }
        />
      </Card>
      <Card>
        <LinkRow label={t('howDecides')} onPress={() => setSheet('how')} />
        <Divider />
        <LinkRow label={t('about')} onPress={() => setSheet('about')} />
      </Card>
      <Pressable testID="version" accessibilityRole="button" onPress={versionTap}>
        <Label size={11} muted style={{ textAlign: 'center' }}>
          {t('version', { value: VERSION })}
        </Label>
      </Pressable>
      <Sheet
        visible={sheet !== null}
        title={t(sheet === 'how' ? 'howDecides' : 'about')}
        onClose={() => setSheet(null)}
      >
        <Label>{t(sheet === 'how' ? 'howBody' : 'aboutBody')}</Label>
        {sheet === 'about' && (
          <View style={{ gap: 12 }}>
            <Label muted>{t('prototype')}</Label>
            <Label size={11}>{t('version', { value: VERSION })}</Label>
          </View>
        )}
      </Sheet>
    </Page>
  );
}
