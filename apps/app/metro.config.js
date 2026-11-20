// إعداد Metro (اللي يجمّع كود التطبيق).
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// استيراد أيقونة وحدة من Tabler: "@tabler/icons-react-native/icons/IconTruck"
// يتحوّل لملف الأيقونة نفسه، عشان ما تنضم آلاف الأيقونات للموقع.
// (المكتبة ما تسمح بقراءة package.json مباشرة، فنوصل للمجلد من ملفها الرئيسي dist/cjs.)
const tablerIconsDir = path.join(path.dirname(require.resolve("@tabler/icons-react-native")), "../esm/icons");
const ICON_PREFIX = "@tabler/icons-react-native/icons/";
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(ICON_PREFIX)) {
    const name = moduleName.slice(ICON_PREFIX.length);
    if (!/^Icon[A-Za-z0-9]+$/.test(name)) throw new Error(`اسم أيقونة غير صالح: ${name}`);
    return { type: "sourceFile", filePath: path.join(tablerIconsDir, `${name}.mjs`) };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
