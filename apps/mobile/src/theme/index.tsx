import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePref } from '@hanjibung/core';

import { dark, light, spaceTone, type Palette, type SpaceTone } from './colors';

export const fonts = {
  regular: 'IBMPlexSansKR_400Regular',
  medium: 'IBMPlexSansKR_500Medium',
  semibold: 'IBMPlexSansKR_600SemiBold',
  bold: 'IBMPlexSansKR_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export interface Theme {
  scheme: 'light' | 'dark';
  c: Palette;
  tone: (color: string) => SpaceTone;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ pref, children }: { pref: ThemePref; children: ReactNode }) {
  const system = useColorScheme();
  const scheme: 'light' | 'dark' = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo<Theme>(
    () => ({ scheme, c: scheme === 'dark' ? dark : light, tone: (color: string) => spaceTone(color, scheme) }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('ThemeProvider가 필요합니다');
  return t;
}
