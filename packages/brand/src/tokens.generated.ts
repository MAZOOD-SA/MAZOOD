// ⚠️ ملف مولّد تلقائيًا من brand/tokens.json بالأمر: pnpm tokens
// لا تعدّله يدويًا. لتغيير الهوية: عدّل brand/tokens.json وbrand/tokens.css ثم شغّل الأمر.

export const colors = {
  "light": {
    "navy": "#0F2A44",
    "navy700": "#1E4466",
    "navyBlock": "#0F2A44",
    "amber": "#F2A900",
    "steel": "#5B6B7A",
    "concrete": "#EEF0F2",
    "surface": "#FFFFFF",
    "surfaceAlt": "#F4F6F8",
    "ink": "#0F2A44",
    "inkMuted": "#5B6B7A",
    "line": "#DDE2E7",
    "lineStrong": "#8696A5",
    "primary": "#0F2A44",
    "onPrimary": "#FFFFFF",
    "btnPrimaryBg": "#0F2A44",
    "btnPrimaryFg": "#FFFFFF",
    "btnPrimaryBorder": "#0F2A44",
    "accent": "#F2A900",
    "onAccent": "#0F2A44",
    "accentSoft": "#FDF3D6",
    "onAccentSoft": "#7A5600",
    "success": "#176B47",
    "successSoft": "#E3F4EC",
    "danger": "#B93A26"
  },
  "dark": {
    "navy": "#0F2A44",
    "navy700": "#1E4466",
    "navyBlock": "#2A5A86",
    "amber": "#F2A900",
    "steel": "#5B6B7A",
    "concrete": "#EEF0F2",
    "surface": "#0B1B2B",
    "surfaceAlt": "#12263A",
    "ink": "#EEF0F2",
    "inkMuted": "#A3B1BE",
    "line": "#24394F",
    "lineStrong": "#5E7489",
    "primary": "#F2A900",
    "onPrimary": "#0F2A44",
    "btnPrimaryBg": "transparent",
    "btnPrimaryFg": "#F2A900",
    "btnPrimaryBorder": "#F2A900",
    "accent": "#F2A900",
    "onAccent": "#0F2A44",
    "accentSoft": "#3A2E0A",
    "onAccentSoft": "#F2C14E",
    "success": "#4CC38A",
    "successSoft": "#12352A",
    "danger": "#F08A73"
  }
} as const;

export const spacing = {
  "1": 4,
  "2": 8,
  "3": 12,
  "4": 16,
  "6": 24,
  "8": 32
} as const;

export const radius = {
  "sm": 6,
  "md": 10,
  "lg": 16,
  "full": 999
} as const;

export const typography = {
  "display": {
    "fontSize": 40,
    "lineHeight": 48,
    "fontWeight": 700
  },
  "h1": {
    "fontSize": 28,
    "lineHeight": 36,
    "fontWeight": 700
  },
  "h2": {
    "fontSize": 20,
    "lineHeight": 28,
    "fontWeight": 600
  },
  "body": {
    "fontSize": 16,
    "lineHeight": 26,
    "fontWeight": 400
  },
  "bodySm": {
    "fontSize": 14,
    "lineHeight": 22,
    "fontWeight": 400
  },
  "label": {
    "fontSize": 14,
    "lineHeight": 20,
    "fontWeight": 600
  },
  "caption": {
    "fontSize": 12,
    "lineHeight": 18,
    "fontWeight": 400
  },
  "price": {
    "fontSize": 22,
    "lineHeight": 28,
    "fontWeight": 700
  }
} as const;

export const layout = {
  "breakpointTablet": 768,
  "breakpointDesktop": 1200,
  "sidebarExpanded": 264,
  "sidebarCollapsed": 76,
  "contentMax": 640,
  "tabbarHeight": 66,
  "touchMin": 44
} as const;

export const motion = {
  "durationFast": 150,
  "durationBase": 220
} as const;
