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
    "danger": "#B93A26",
    "surfaceRaised": "#FFFFFF",
    "heroSurface": "#EAF1F8",
    "catTransport": "#1D63A8",
    "catTransportSoft": "#E3EEF9",
    "catMaintenance": "#7A3FB0",
    "catMaintenanceSoft": "#F1E8FA",
    "catMaterials": "#8A5A2B",
    "catMaterialsSoft": "#F5ECE2",
    "catSecurity": "#0E7381",
    "catSecuritySoft": "#DFF2F4",
    "catCleaning": "#B0306E",
    "catCleaningSoft": "#FBE7F0",
    "catCustoms": "#4A4FB5",
    "catCustomsSoft": "#E9EAF8",
    "catPest_control": "#5F6E12",
    "catPest_controlSoft": "#EEF2DA"
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
    "danger": "#F08A73",
    "surfaceRaised": "#132A41",
    "heroSurface": "#183A5A",
    "catTransport": "#7DB4EC",
    "catTransportSoft": "#364A5F",
    "catMaintenance": "#C39BEA",
    "catMaintenanceSoft": "#4B425E",
    "catMaterials": "#D9A877",
    "catMaterialsSoft": "#51463B",
    "catSecurity": "#5CC6D3",
    "catSecuritySoft": "#2C4F57",
    "catCleaning": "#EE8DBA",
    "catCleaningSoft": "#573E50",
    "catCustoms": "#9EA3F0",
    "catCustomsSoft": "#404460",
    "catPest_control": "#B8C85A",
    "catPest_controlSoft": "#475033"
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

export const breakpoints = {
  "tablet": 768,
  "desktop": 1200
} as const;

export const layout = {
  "contentMax": 640,
  "pageMax": 1200,
  "sidebar": 248,
  "sideColumn": 360,
  "touchMin": 44
} as const;

export const motion = {
  "reward": 700,
  "fast": 150
} as const;
