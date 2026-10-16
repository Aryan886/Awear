import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, type FontSource } from 'expo-font';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Home, Map, Route } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import i18n from './src/i18n';
import { actions, useAppStore } from './src/state/appStore';
import { HelmetState } from './src/helmet/protocol';
import { colors } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { MapScreen } from './src/screens/MapScreen';
import { RoutesScreen } from './src/screens/RoutesScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { PresenterScreen } from './src/screens/PresenterScreen';
import { ActionScreen, TelegramScreen } from './src/screens/ActionScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RideBar, SessionPanels } from './src/components/SessionPanels';
import type { RootParams, TabParams } from './src/navigation';
import { MULTILINGUAL_ENABLED } from './src/config';

const appFonts: Record<string, FontSource> = {
  Jakarta: require('./assets/fonts/PlusJakartaSans.ttf'),
};
if (MULTILINGUAL_ENABLED) appFonts.Devanagari = require('./assets/fonts/NotoSansDevanagari.ttf');

const Stack = createNativeStackNavigator<RootParams>();
const Tabs = createBottomTabNavigator<TabParams>();
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: 'white',
    text: colors.ink,
    border: colors.line,
  },
};

function MainTabs() {
  const { t, i18n: language } = useTranslation();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.smoke,
        tabBarStyle: {
          borderTopColor: colors.line,
          elevation: 0,
          height: 74,
          paddingTop: 9,
          paddingBottom: 10,
        },
        tabBarLabelStyle: {
          fontFamily: language.language === 'en' ? 'Jakarta' : 'Devanagari',
          fontSize: 10,
          marginTop: 4,
        },
        animation: 'fade',
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t('home'), tabBarIcon: ({ color }) => <Home color={color} size={21} /> }}
      />
      <Tabs.Screen
        name="Map"
        component={MapScreen}
        options={{ title: t('map'), tabBarIcon: ({ color }) => <Map color={color} size={21} /> }}
      />
      <Tabs.Screen
        name="Routes"
        component={RoutesScreen}
        options={{
          title: t('routes'),
          tabBarIcon: ({ color }) => <Route color={color} size={21} />,
        }}
      />
      <Tabs.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          title: t('alerts'),
          tabBarIcon: ({ color }) => <Bell color={color} size={21} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export default function App() {
  const ready = useAppStore((state) => state.ready);
  const preferences = useAppStore((state) => state.preferences);
  const showRideBar = useAppStore(
    (state) =>
      !!state.ride ||
      (state.preferences.helmet &&
        state.connection !== 'connected' &&
        state.telemetry?.state === HelmetState.Running),
  );
  const [initialConnect, setInitialConnect] = useState(false);
  const [fontsLoaded, fontError] = useFonts(appFonts);
  useEffect(() => {
    void actions.hydrate();
    return actions.startRuntime();
  }, []);
  useEffect(() => {
    void i18n.changeLanguage(preferences.language);
  }, [preferences.language]);
  useEffect(() => {
    if (fontError) actions.report('Bundled font load; system fallback', fontError);
  }, [fontError]);
  useEffect(() => {
    actions.setForeground(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', (state) =>
      actions.setForeground(state === 'active'),
    );
    return () => listener.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {!ready || (!fontsLoaded && !fontError) ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !preferences.onboarding ? (
          <OnboardingScreen
            onFinish={(helmet) => {
              setInitialConnect(helmet);
              actions.setPreferences({ onboarding: true, helmet });
            }}
          />
        ) : (
          <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
            <NavigationContainer theme={navigationTheme}>
              <Stack.Navigator
                initialRouteName={initialConnect ? 'Connect' : 'Tabs'}
                screenOptions={{
                  headerShown: false,
                  freezeOnBlur: true,
                  contentStyle: { backgroundColor: colors.background },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="Tabs" component={MainTabs} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Connect" component={ConnectScreen} />
                <Stack.Screen name="Presenter" component={PresenterScreen} />
                <Stack.Screen name="Action" component={ActionScreen} />
                <Stack.Screen name="Telegram" component={TelegramScreen} />
              </Stack.Navigator>
            </NavigationContainer>
            <SafeAreaView
              edges={['bottom']}
              style={{ backgroundColor: showRideBar ? colors.deep : 'white' }}
            >
              <RideBar />
            </SafeAreaView>
            <SessionPanels />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}
