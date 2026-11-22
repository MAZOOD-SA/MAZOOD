// وين يروح المستخدم بعد الدخول، حسب نوع حسابه.
import type { Role } from "@/data/store";

export function homeRouteFor(role: Role | null): "/home" | "/provider" | "/admin" {
  if (role === "provider") return "/provider";
  if (role === "staff") return "/admin";
  return "/home";
}
