import type { NavigatorScreenParams } from '@react-navigation/native';
export type TabParams = { Home: undefined; Map: undefined; Routes: undefined; Alerts: undefined };
export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Settings: undefined;
  Connect: undefined;
  Presenter: undefined;
  Action: { zoneId: string };
  Telegram: { zoneId: string; audience: string };
};
