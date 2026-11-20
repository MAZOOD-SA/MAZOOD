// نقطة البداية: إذا المستخدم داخل يروح للرئيسية، وإلا لشاشة الدخول.
import { Redirect } from "expo-router";
import { useStore } from "@/data/store";

export default function Index() {
  const { state } = useStore();
  return <Redirect href={state.signedIn ? "/home" : "/login"} />;
}
