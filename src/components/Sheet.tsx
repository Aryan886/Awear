import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { colors } from '../theme';
import { Label, Row } from './ui';

export function Sheet({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#1B1A2E66' }}>
        <Pressable accessibilityLabel={t('close')} onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            maxHeight: '88%',
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 18),
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              alignSelf: 'center',
              marginTop: 12,
            }}
          />
          <Row style={{ padding: 22, justifyContent: 'space-between' }}>
            <Label bold size={21} style={{ flex: 1 }}>
              {title}
            </Label>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              onPress={onClose}
              hitSlop={12}
            >
              <X color={colors.muted} size={22} />
            </Pressable>
          </Row>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 22, gap: 18, paddingBottom: 18 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
