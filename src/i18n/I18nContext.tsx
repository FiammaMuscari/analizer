import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

type Locale = "en" | "es";
type DictionaryValue = string | Dictionary;
type Dictionary = { [key: string]: DictionaryValue };

interface I18nContextType {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const loadDictionary = async (locale: Locale): Promise<Dictionary> => {
  switch (locale) {
    case "en":
      return (await import("../locales/en.json")).default;
    case "es":
      return (await import("../locales/es.json")).default;
    default:
      console.warn(`Unsupported locale "${locale}". Falling back to "en".`);
      return (await import("../locales/en.json")).default;
  }
};

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLocale = "en",
}) => {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dictionary, setDictionary] = useState<Dictionary>({});

  useEffect(() => {
    const fetchDictionary = async () => {
      const dict = await loadDictionary(locale);
      setDictionary(dict);
    };
    fetchDictionary();
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
  };

  const contextValue: I18nContextType = {
    locale,
    dictionary,
    setLocale,
  };

  return (
    <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
