import React, { useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Card, HelmetArt, Label, Row, Title } from '../components/ui';
import { actions } from '../state/appStore';
import { colors } from '../theme';
import i18n from '../i18n';
import type { Language } from '../state/preferences';
import { MULTILINGUAL_ENABLED } from '../config';

export function OnboardingScreen({ onFinish }: { onFinish: (helmet: boolean) => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(MULTILINGUAL_ENABLED ? -1 : 0);
  const cards = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;
  function chooseLanguage(language: Language) {
    actions.setPreferences({ language });
    void i18n.changeLanguage(language);
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 26 }}>
        <Label size={25} bold style={{ color: colors.primary, letterSpacing: 4 }}>
          AWEAR·
        </Label>
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        {step === -1 ? (
          <View style={{ padding: 26, gap: 18 }}>
            <Title size={34}>{t('languageIntro')}</Title>
            <Label muted>{t('chooseLanguage')}</Label>
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
                ['mr', 'मराठी'],
              ] as const
            ).map(([language, label]) => (
              <Pressable
                key={language}
                accessibilityRole="button"
                onPress={() => chooseLanguage(language)}
              >
                <Card
                  style={{
                    borderWidth: 1,
                    borderColor: i18n.language === language ? colors.primary : colors.line,
                  }}
                >
                  <Label size={20} bold>
                    {label}
                  </Label>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : step < 3 ? (
          <ScrollView
            ref={cards}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setStep(Math.round(event.nativeEvent.contentOffset.x / width))
            }
          >
            {[1, 2, 3].map((index) => (
              <View
                key={index}
                style={{
                  width,
                  padding: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 22,
                }}
              >
                <HelmetArt size={250} stage={index} />
                <Title size={33}>{t(`onboard${index}Title`)}</Title>
                <Label muted size={16}>
                  {t(`onboard${index}Body`)}
                </Label>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ padding: 26, gap: 22, alignItems: 'stretch' }}>
            <View style={{ alignItems: 'center' }}>
              <HelmetArt size={220} />
            </View>
            <Title size={32}>{t('helmetChoice')}</Title>
            <Button label={t('withHelmet')} onPress={() => onFinish(true)} />
            <Button label={t('appOnly')} secondary onPress={() => onFinish(false)} />
          </View>
        )}
      </ScrollView>
      {step < 3 && (
        <View style={{ padding: 26, gap: 22 }}>
          {step >= 0 && (
            <Row style={{ justifyContent: 'center', gap: 7 }}>
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  style={{
                    width: index === step ? 24 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: index === step ? colors.primary : colors.line,
                  }}
                />
              ))}
            </Row>
          )}
          <Button
            label={t('next')}
            onPress={() => {
              if (step >= 0 && step < 2)
                cards.current?.scrollTo({ x: width * (step + 1), animated: true });
              setStep(step + 1);
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
