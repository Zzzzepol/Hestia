import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { colors as palette } from '@/theme/colors';
import { useAppColorScheme } from '@/design/use-app-color-scheme';
import { getSession } from '@/api';
import { ApiError } from '@/api/client';
import { getSupabaseClient } from '@/lib/supabase';
import { StartupLoader } from '@/components/startup-loader';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
  SplashScreen.setOptions({ duration: 180, fade: true });
}

export default function RootLayout() {
  return <QueryClientProvider client={queryClient}><SafeAreaProvider><RootNavigation /></SafeAreaProvider></QueryClientProvider>;
}

function RootNavigation() {
  const lastUserId = useRef<string | null>(null);
  const splashHidden = useRef(false);
  const laidOut = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' && nextId !== lastUserId.current) {
        queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
        if (event === 'SIGNED_OUT') queryClient.setQueryData(['session'], { members: [], userId: null, spaceId: null, theme: 'system', notifications: true, lowStockAlerts: true });
        else void queryClient.invalidateQueries({ queryKey: ['session'] });
      }
      lastUserId.current = nextId;
    });
    return () => subscription.unsubscribe();
  }, []);
  const system = useAppColorScheme();
  const { data, isLoading } = useQuery({ queryKey: ['session'], queryFn: getSession });
  const hideSplash = useCallback(() => {
    if (splashHidden.current || Platform.OS === 'web') return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => { if (laidOut.current && !isLoading) hideSplash(); }, [isLoading, hideSplash]);
  const scheme = data?.theme === 'light' || data?.theme === 'dark' ? data.theme : system;
  const colors = palette[scheme];
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={{
        ...navigationTheme,
        colors: {
          ...navigationTheme.colors,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          primary: colors.text,
          border: colors.border,
        },
      }}>
        <View style={{ flex: 1 }} onLayout={() => { laidOut.current = true; if (!isLoading) hideSplash(); }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
          {isLoading && <StartupLoader onReady={hideSplash} />}
        </View>
        <StatusBar style={isLoading || scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: {
  retry: (failures, error) => failures < 1 && !(error instanceof ApiError && (error.status === 503 || error.code === 'ABORTED')),
  staleTime: 10000,
} } });
