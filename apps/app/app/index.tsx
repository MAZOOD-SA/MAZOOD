// نقطة البداية: إذا المستخدم داخل يروح للرئيسية، وإلا لشاشة الدخول.
import { Redirect } from "expo-router";
import { useStore } from "@/data/store";

export default function Index() {
  const { state, ready } = useStore();
  // لين نعرف هل فيه جلسة محفوظة ما نوجّه المستخدم لأي مكان.
  if (!ready) return null;
  return <Redirect href={state.signedIn ? "/home" : "/login"} />;
}
