import React from "react";
import { useI18n } from "../i18n/I18nContext"; // Adjust path if needed

export const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex justify-center gap-4 m-4">
      <button onClick={() => setLocale("en")} disabled={locale === "en"}>
        English
      </button>
      <button
        onClick={() => setLocale("es")}
        disabled={locale === "es"}
        style={{ fontWeight: locale === "es" ? "bold" : "normal" }}
      >
        Español
      </button>
    </div>
  );
};
