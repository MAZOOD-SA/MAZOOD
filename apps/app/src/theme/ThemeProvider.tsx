// الوضع الفاتح والداكن. الألوان تجي من @mazood/brand (المولّدة من brand/tokens.json) فقط.
import { colors, type Palette, type ThemeName } from "@mazood/brand";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { loadPref, savePref } from "@/lib/prefs";

export type ThemeMode = "system" | "light" | "dark";

type ThemeValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  name: ThemeName;
  colors: Palette;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    loadPref("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") setModeState(v);
    });
  }, []);

  const name: ThemeName = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const palette = colors[name] as Palette;

  // في المتصفح: لون خلفية الصفحة نفسها يتبع الوضع (يبان عند السحب لأعلى أو أسفل).
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.body.style.backgroundColor = palette.surface;
      document.documentElement.style.colorScheme = name;
    }
  }, [palette, name]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      name,
      colors: palette,
      setMode: (m) => {
        setModeState(m);
        savePref("theme", m);
      },
    }),
    [mode, name, palette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme لازم يكون داخل ThemeProvider");
  return v;
}
