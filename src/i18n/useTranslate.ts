import { useI18n } from "./I18nContext";

// Custom hook for translation
// It takes a key (string) and returns the translated string
// It can also handle nested keys like "common.greeting"
export const useTranslate = () => {
  const { dictionary } = useI18n();

  const t = (key: string): string => {
    // Simple key lookup
    // For nested keys, you would need more complex logic
    // Example: key "common.greeting" -> dictionary.common.greeting
    const keys = key.split(".");
    let value = dictionary;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Return key if translation is not found
        return key;
      }
    }
    return typeof value === "string" ? value : key;
  };

  return t;
};
