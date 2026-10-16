import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Settings2, Wind } from 'lucide-react-native';
import Svg, { Circle, Path, Rect, Line } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, shadow } from '../theme';
import { BAND_COLORS, type Air, type Band } from '../model/air';
import { number } from '../i18n';
import { actions } from '../state/appStore';
import type { RootParams } from '../navigation';

export function Label({
  children,
  style,
  muted = false,
  size = 14,
  bold = false,
  ...props
}: {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
  size?: number;
  bold?: boolean;
} & Omit<React.ComponentProps<typeof Text>, 'style'>) {
  const { i18n } = useTranslation();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: i18n.language === 'en' ? 'Jakarta' : 'Devanagari',
          fontSize: size,
          lineHeight: size * (i18n.language === 'en' ? 1.5 : 1.65),
          fontWeight: bold ? '700' : '400',
          color: muted ? colors.muted : colors.ink,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Title({ children, size = 28 }: { children: React.ReactNode; size?: number }) {
  return (
    <Label size={size} bold style={{ letterSpacing: -0.8, color: colors.deep }}>
      {children}
    </Label>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon = true,
  testID,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  secondary?: boolean;
  disabled?: boolean;
  icon?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        try {
          const result = onPress();
          if (result instanceof Promise)
            void result.catch((error) => actions.report(`UI action: ${label}`, error));
        } catch (error) {
          actions.report(`UI action: ${label}`, error);
        }
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.tint : colors.primary,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Label
        bold
        size={15}
        style={{ color: secondary ? colors.primary : 'white', flex: 1, textAlign: 'center' }}
      >
        {label}
      </Label>
      {icon && <ArrowUpRight size={19} color={secondary ? colors.primary : 'white'} />}
    </Pressable>
  );
}
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      <Label size={12} bold style={{ color: selected ? 'white' : colors.muted }}>
        {label}
      </Label>
    </Pressable>
  );
}
export function LinkRow({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { paddingVertical: 14, justifyContent: 'space-between' }]}
    >
      <Label style={{ flex: 1 }}>{label}</Label>
      {value && <Label muted>{value}</Label>}
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}
export function AirBadge({
  air,
  compact = false,
}: {
  air: Pick<Air, 'band' | 'aqi'>;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Row style={{ gap: 6, flexWrap: 'wrap' }}>
      <View
        style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: BAND_COLORS[air.band] }}
      />
      <Label size={compact ? 12 : 14} bold>
        {t(`band${air.band}`)}
      </Label>
      {!compact && (
        <Label size={12} muted>
          AQI {air.aqi}
        </Label>
      )}
    </Row>
  );
}
export function AirTile({ air, inside = false }: { air: Air; inside?: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 18,
        backgroundColor: `${BAND_COLORS[air.band]}12`,
        padding: 14,
        gap: 4,
      }}
    >
      <Label muted size={11}>
        {t(inside ? 'inside' : 'outside')}
      </Label>
      <Label size={30} bold style={{ color: BAND_COLORS[air.band], fontVariant: ['tabular-nums'] }}>
        {air.aqi}
      </Label>
      <AirBadge air={air} compact />
    </View>
  );
}
export function SafeLevel({ pm25 }: { pm25: number }) {
  const { t } = useTranslation();
  return (
    <Label muted size={12}>
      {pm25 > 60 ? t('safeMultiple', { value: number(pm25 / 60, 1) }) : t('withinSafe')}
    </Label>
  );
}
export function Page({
  children,
  title,
  scroll = true,
}: {
  children: React.ReactNode;
  title?: string;
  scroll?: boolean;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootParams>>();
  const body = (
    <View style={{ paddingHorizontal: 22, gap: 18, paddingBottom: 28 }}>
      {title && <Title>{title}</Title>}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Row
        style={{
          paddingHorizontal: 22,
          paddingTop: 8,
          paddingBottom: 18,
          justifyContent: 'space-between',
        }}
      >
        <Row style={{ gap: 12 }}>
          {navigation.canGoBack() && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('back')}
              hitSlop={12}
              onPress={() => navigation.goBack()}
            >
              <ArrowLeft color={colors.deep} size={22} />
            </Pressable>
          )}
          <Pressable
            testID="awear-logo"
            accessibilityRole="button"
            accessibilityLabel={t('presenter')}
            delayLongPress={1500}
            onLongPress={() => navigation.navigate('Presenter')}
          >
            <Label size={24} bold style={{ letterSpacing: 3, color: colors.primary }}>
              AWEAR
              <Label size={24} style={{ color: colors.clean }}>
                ·
              </Label>
            </Label>
          </Pressable>
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings')}
          hitSlop={12}
          onPress={() => navigation.navigate('Settings')}
          style={{ backgroundColor: 'white', padding: 10, borderRadius: 16 }}
        >
          <Settings2 color={colors.deep} size={20} />
        </Pressable>
      </Row>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}
export function Breathing({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    scale.value = reduced ? 1 : withRepeat(withTiming(1.012, { duration: 2000 }), -1, true);
  }, [reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
export function HelmetArt({ size = 220, stage = 1 }: { size?: number; stage?: number }) {
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 260 208">
      <Circle cx="130" cy="103" r="92" fill="#EEEBFA" />
      <Circle cx="130" cy="103" r="73" fill="#E4E0F6" />
      <Path
        d="M57 118C48 60 84 30 133 32c45 2 74 33 72 72l-25 48-89 12-34-46Z"
        fill="white"
        stroke={colors.primary}
        strokeWidth="3"
      />
      <Path
        d="m104 86 98 1-17 42-74-8-7-35Z"
        fill="#D8F5E8"
        stroke={colors.primary}
        strokeWidth="3"
      />
      <Path d="m59 121 49-10 12 30 59 2-5 25-86 5-29-52Z" fill={colors.primary} />
      <Rect x="48" y="112" width="46" height="29" rx="11" fill={colors.deep} />
      <Circle cx="70" cy="126" r="7" fill={colors.clean} />
      <Path
        d="M31 104H12m15 20H4m31 20H16"
        stroke={colors.smoke}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {stage > 0 && (
        <>
          <Path
            d="M127 102h44m-34 10h27"
            stroke={colors.clean}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Circle cx="220" cy="56" r="20" fill={colors.clean} />
          <Path
            d="m211 56 7 7 12-15"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}
export function ForecastChart({ values }: { values: { air: Air }[] }) {
  const maximum = Math.max(100, ...values.map((item) => item.air.aqi));
  const points = values.map((item, index) => [10 + index * 45, 70 - (item.air.aqi / maximum) * 55]);
  return (
    <Svg width="100%" height={88} viewBox="0 0 290 88">
      <Line x1="8" x2="282" y1="75" y2="75" stroke={colors.line} />
      <Path
        d={`M${points.map((point) => point.join(',')).join(' L')}`}
        fill="none"
        stroke={colors.primary}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <Circle
          key={index}
          cx={point[0]}
          cy={point[1]}
          r="4"
          fill={BAND_COLORS[values[index].air.band]}
          stroke="white"
          strokeWidth="2"
        />
      ))}
    </Svg>
  );
}
export function ScoreRing({ score }: { score: number }) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [displayScore, setDisplayScore] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setDisplayScore(target);
      return;
    }
    const start = performance.now();
    let frame: number;
    function update(now: number) {
      const progress = Math.min(1, (now - start) / 800);
      setDisplayScore(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);
  const circumference = 2 * Math.PI * 75;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 14 }}>
      <Svg width={184} height={184}>
        <Circle cx="92" cy="92" r="75" fill="none" stroke={colors.tint} strokeWidth="13" />
        <Circle
          cx="92"
          cy="92"
          r="75"
          fill="none"
          stroke={colors.primary}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * displayScore) / 100} ${circumference}`}
          rotation="-90"
          origin="92,92"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Label size={48} bold style={{ color: colors.deep }}>
          {displayScore}
        </Label>
        <Label size={12} muted>
          / 100
        </Label>
      </View>
    </View>
  );
}
export function Airflow({ fanPct }: { fanPct: number }) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.value =
      fanPct > 0 && !reduced
        ? withRepeat(withTiming(1, { duration: 2400 - fanPct * 16 }), -1, false)
        : 0;
  }, [fanPct, reduced, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 80 }],
    opacity: fanPct ? 0.4 + progress.value * 0.6 : 0.2,
  }));
  return (
    <Row
      style={{
        backgroundColor: colors.background,
        borderRadius: 16,
        padding: 12,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      <Wind color={colors.smoke} size={21} />
      <Animated.View style={[style, { flexDirection: 'row', gap: 8 }]}>
        {[1, 2, 3, 4, 5].map((value) => (
          <View
            key={value}
            style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.clean }}
          />
        ))}
      </Animated.View>
      <HelmetArt size={45} />
    </Row>
  );
}
export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line }} />;
}
export function CheckItem({
  label,
  complete,
  active,
}: {
  label: string;
  complete: boolean;
  active: boolean;
}) {
  return (
    <Row style={{ paddingVertical: 14, gap: 14 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: complete ? colors.primary : active ? colors.tint : colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {complete ? (
          <Check color="white" size={17} />
        ) : (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: active ? colors.primary : colors.line,
            }}
          />
        )}
      </View>
      <Label bold={active || complete}>{label}</Label>
    </Row>
  );
}
export function Legend() {
  const { t } = useTranslation();
  return (
    <Row style={{ flexWrap: 'wrap', gap: 10 }}>
      {BAND_COLORS.map((color, index) => (
        <Row key={color} style={{ gap: 4 }}>
          <View style={{ backgroundColor: color, width: 6, height: 6, borderRadius: 3 }} />
          <Label size={10}>{t(`band${index as Band}`)}</Label>
        </Row>
      ))}
    </Row>
  );
}
export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 14, ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    minHeight: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'white',
  },
});
