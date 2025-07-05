import "./App.css";
import { I18nProvider } from "./i18n/I18nContext";
import { useTranslate } from "./i18n/useTranslate";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

function AppWithI18n() {
  return (
    <I18nProvider initialLocale="en">
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const t = useTranslate();

  return (
    <>
      <h1 className="my-8">i18n analyzer</h1>

      <LanguageSwitcher />

      <p>{t("current_language")}</p>
      <p>
        {t("greeting")}, {t("welcome")}
      </p>

      <p>{t("test")},</p>
    </>
  );
}

export default AppWithI18n;
