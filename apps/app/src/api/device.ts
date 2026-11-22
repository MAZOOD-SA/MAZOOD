// اسم مختصر للجهاز، يظهر في «أجهزتي» عشان المستخدم يعرف أي جهاز داخل حسابه.
// ما نرسل أي معرّف للجهاز، بس وصف عام مثل «iPhone» أو «Chrome · Windows».
import { Platform } from "react-native";

export function deviceName(): string {
  if (Platform.OS === "ios") return "iPhone";
  if (Platform.OS === "android") return "Android";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "متصفح";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
