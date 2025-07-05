import React from "react";
import { useI18n } from "../i18n/I18nContext"; // Adjust path if needed
import { useTranslate } from "../i18n/useTranslate"; // Adjust path if needed

export const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale } = useI18n();
  const t = useTranslate();

  return (
    <div style={{ marginBottom: "20px" }}>
      <span>{t("change_language")}: </span>
      <button
        onClick={() => setLocale("en")}
        disabled={locale === "en"}
        style={{
          marginRight: "10px",
          fontWeight: locale === "en" ? "bold" : "normal",
        }}
      >
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
