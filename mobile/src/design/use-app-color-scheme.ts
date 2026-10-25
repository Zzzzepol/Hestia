import { useColorScheme } from 'react-native';

export function useAppColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  return systemScheme === 'dark' ? 'dark' : 'light';
}
