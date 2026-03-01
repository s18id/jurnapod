// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { buildMantineTheme, getStoredThemeVariant, setStoredThemeVariant, type ThemeVariant } from "./theme";

type ThemeContextValue = {
  variant: ThemeVariant;
  setVariant: (variant: ThemeVariant) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<ThemeVariant>(() => getStoredThemeVariant());

  useEffect(() => {
    setStoredThemeVariant(variant);
  }, [variant]);

  const theme = useMemo(() => buildMantineTheme(variant), [variant]);
  const value = useMemo(() => ({ variant, setVariant }), [variant]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const body = document.body;
    const background = theme.other?.bodyBackground ?? "#f6f6f6";
    const textColor = theme.other?.text ?? "#1b1b1b";
    body.style.margin = "0";
    body.style.background = background;
    body.style.color = textColor;
    body.style.fontFamily = theme.fontFamily ?? "ui-sans-serif";
    body.style.fontVariantNumeric = "tabular-nums";
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>
      <MantineProvider theme={theme} defaultColorScheme="light">
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeVariant(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeVariant must be used within ThemeProvider");
  }
  return context;
}
