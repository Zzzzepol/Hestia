import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { colors as palette } from '@/theme/colors';
import { useAppColorScheme } from '@/design/use-app-color-scheme';
import { getSession } from '@/api';
import { getSupabaseClient } from '@/lib/supabase';

export default function RootLayout() {
  return <QueryClientProvider client={queryClient}><SafeAreaProvider><RootNavigation /></SafeAreaProvider></QueryClientProvider>;
}

function RootNavigation() {
  const lastUserId = useRef<string | null>(null);
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
  const { data } = useQuery({ queryKey: ['session'], queryFn: getSession });
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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10000 } } });
