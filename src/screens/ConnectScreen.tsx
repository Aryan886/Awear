import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Breathing,
  Button,
  Card,
  CheckItem,
  HelmetArt,
  Label,
  Page,
  Title,
} from '../components/ui';
import { actions, useAppStore } from '../state/appStore';
import type { RootParams } from '../navigation';

export function ConnectScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const connection = useAppStore((state) => state.connection);
  useEffect(() => {
    if (connection !== 'connected') return;
    const timer = setTimeout(() => {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace('Tabs');
    }, 800);
    return () => clearTimeout(timer);
  }, [connection, navigation]);
  return (
    <Page>
      <View style={{ alignItems: 'center', marginVertical: 24 }}>
        <Breathing>
          <HelmetArt size={270} />
        </Breathing>
      </View>
      <Title size={33}>{t('connectTitle')}</Title>
      <Label muted>{t('connectBody')}</Label>
      {connection !== 'disconnected' && (
        <Card>
          {(['searching', 'pairing', 'connected'] as const).map((key, index) => (
            <CheckItem
              key={key}
              label={t(key)}
              complete={connection === 'connected' || index === 0}
              active={connection === 'connecting' && index === 1}
            />
          ))}
        </Card>
      )}
      <Button
        testID="connect-helmet"
        label={t('connect')}
        disabled={connection !== 'disconnected'}
        onPress={() => {
          actions.setPreferences({ helmet: true });
          actions.connect();
        }}
      />
      <Button
        label={t('demoHelmet')}
        secondary
        disabled={connection !== 'disconnected'}
        onPress={() => {
          actions.setPreferences({ helmet: true });
          actions.connect();
        }}
      />
    </Page>
  );
}
