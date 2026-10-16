import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Chip, Divider, Label, Page, Row } from '../components/ui';
import { actions, useAppStore } from '../state/appStore';
import { Flags, HelmetState, Opcode } from '../helmet/protocol';
import { colors } from '../theme';
import { number } from '../i18n';
import type { RootParams } from '../navigation';

export function PresenterScreen({ navigation }: NativeStackScreenProps<RootParams, 'Presenter'>) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('controls');
  const scenario = useAppStore((state) => state.scenario);
  const speed = useAppStore((state) => state.speed);
  const connection = useAppStore((state) => state.connection);
  const telemetry = useAppStore((state) => state.telemetry);
  const diagnostics = useAppStore((state) => state.diagnostics);
  const packets = useAppStore((state) => state.packetCount);
  const since = useAppStore((state) => state.connectionStartedMs);
  const debug = actions.debug();
  const packet = debug.telemetry;
  const connected = connection === 'connected';
  const running = telemetry?.state === HelmetState.Running;
  return (
    <Page title={t('presenter')}>
      <Label size={12} style={{ color: colors.primary }}>
        {t('simulationNotice')}
      </Label>
      <Row style={{ flexWrap: 'wrap' }}>
        {['controls', 'sources', 'telegram'].map((item) => (
          <Chip key={item} label={t(item)} selected={tab === item} onPress={() => setTab(item)} />
        ))}
      </Row>
      {tab === 'controls' && (
        <>
          <Card>
            <Label bold>{t('scenario')}</Label>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['busy', 'school', 'park', 'highway', 'clean'] as const).map((item) => (
                <Chip
                  key={item}
                  label={t(
                    item === 'school' ? 'schoolScenario' : item === 'park' ? 'parkScenario' : item,
                  )}
                  selected={scenario === item}
                  onPress={() => actions.setScenario(item)}
                />
              ))}
            </Row>
            <Label bold>{t('movementSpeed')}</Label>
            <Row>
              {([1, 4, 10] as const).map((value) => (
                <Chip
                  key={value}
                  label={`${value}×`}
                  selected={speed === value}
                  onPress={() => actions.setSpeed(value)}
                />
              ))}
            </Row>
          </Card>
          <Button
            label={t('startRide')}
            onPress={() => {
              if (actions.startDemoRide()) navigation.popTo('Tabs', { screen: 'Map' });
            }}
          />
          <Card>
            <Button label={t('spikeControl')} secondary onPress={actions.spike} />
            <Button label={t('schoolEntry')} secondary onPress={actions.enterSchool} />
            <Button
              label={t('schoolRush')}
              secondary
              onPress={() => {
                actions.schoolRush();
                navigation.navigate('Action', { zoneId: 'banyan' });
              }}
            />
            <Button label={t('clearAir')} secondary onPress={actions.clearAir} />
          </Card>
          <Card>
            <Button
              label={t(connected ? 'disconnect' : 'reconnect')}
              secondary
              disabled={connection === 'connecting'}
              onPress={() => (connected ? actions.disconnect() : actions.connect())}
            />
            <Button
              label={t('unexpectedDrop')}
              secondary
              disabled={!connected}
              onPress={() => actions.disconnect(false)}
            />
            <Button label={t('moduleButton')} secondary onPress={actions.pressButton} />
            <Button
              label={t('selfTest')}
              secondary
              disabled={!connected || running}
              onPress={actions.selfTest}
            />
            <Button
              label={t('calibrate')}
              secondary
              disabled={!connected}
              onPress={actions.calibrate}
            />
            <Button
              label={t('keepalive')}
              secondary
              disabled={!connected}
              onPress={actions.keepalive}
            />
            {(['insideSensor', 'outsideSensor'] as const).map((key, index) => (
              <Row key={key}>
                <View style={{ flex: 1 }}>
                  <Label size={12}>{t(key)}</Label>
                  <Label size={9} muted>
                    {t('sensorAvailable')}
                  </Label>
                </View>
                <Switch
                  value={!!(packet.flags & (1 << index))}
                  onValueChange={(value) =>
                    actions.setSensors(
                      index === 0 ? value : !!(packet.flags & 1),
                      index === 1 ? value : !!(packet.flags & 2),
                    )
                  }
                  trackColor={{ true: colors.primary, false: colors.line }}
                />
              </Row>
            ))}
          </Card>
          <Button label={t('reset')} secondary onPress={actions.reset} />
        </>
      )}
      {tab === 'sources' && (
        <>
          <Card>
            <Label bold>{t('transportSource')}</Label>
            <Label size={11}>{t('simulated')} · SimHelmetLink</Label>
            <Label size={12}>{t('protocol')}</Label>
            <Label size={11}>
              {t('insideSensor')}: {t('simulated')} · flag{' '}
              {packet.flags & Flags.insideSensor ? 1 : 0}
            </Label>
            <Label size={11}>
              {t('outsideSensor')}: {t('simulated')} · flag{' '}
              {packet.flags & Flags.outsideSensor ? 1 : 0}
            </Label>
            <Label size={11}>{t('fanTelemetry', { value: packet.fanPct })}</Label>
          </Card>
          <Card>
            <Label bold>{t('bundledRoads')}</Label>
            <Label size={12}>{t('roadsSource')}</Label>
            <Divider />
            <Label bold>{t('fieldSource')}</Label>
            <Label size={12}>{t('modelled')}</Label>
            <Label size={12}>{t('aiSource')}</Label>
            <Label size={12}>{t('historySource')}</Label>
            <Label size={12}>{t('telegramStatus')}</Label>
          </Card>
          <Card>
            <Label bold>{t('packetDetails')}</Label>
            <Label size={11} style={{ fontFamily: 'monospace' }}>
              {JSON.stringify(
                {
                  ...packet,
                  stateName: HelmetState[packet.state],
                  packets,
                  packetsPerSecond:
                    since && debug.modelMs > since
                      ? number(packets / ((debug.modelMs - since) / 1000), 1)
                      : '0',
                  lastCommand: debug.lastCommand ? Opcode[debug.lastCommand] : '—',
                  locateCount: debug.locateCount,
                },
                null,
                2,
              )}
            </Label>
          </Card>
          <Card>
            <Label bold>{t('diagnostics')}</Label>
            {diagnostics.length === 0 ? (
              <Label muted size={12}>
                {t('noDiagnostics')}
              </Label>
            ) : (
              diagnostics.map((line, index) => (
                <Label key={index} muted size={10}>
                  {line}
                </Label>
              ))
            )}
          </Card>
        </>
      )}
      {tab === 'telegram' && (
        <Card>
          <Label bold>{t('previewOnly')}</Label>
          <Label>{t('telegramStatus')}</Label>
          <Button
            label={t('openTelegram')}
            secondary
            onPress={() =>
              navigation.navigate('Telegram', { zoneId: 'banyan', audience: 'school' })
            }
          />
        </Card>
      )}
    </Page>
  );
}
