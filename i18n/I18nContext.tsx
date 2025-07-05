import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

// Define the types for our locales and dictionary
type Locale = "en" | "es";
// Define a recursive type for the dictionary to handle nested objects
type DictionaryValue = string | Dictionary;
type Dictionary = { [key: string]: DictionaryValue };

// Define the shape of the context value
interface I18nContextType {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
}

// Create the context with a default undefined value
const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Helper function to load dictionaries
const loadDictionary = async (locale: Locale): Promise<Dictionary> => {
  switch (locale) {
    case "en":
      return (await import("../locales/en.json")).default;
    case "es":
      return (await import("../locales/es.json")).default;
    default:
      // Log a warning for unsupported locales before falling back
      console.warn(`Unsupported locale "${locale}". Falling back to "en".`);
      return (await import("../locales/en.json")).default;
  }
};

// I18n Provider component
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

  // Load dictionary when locale changes
  useEffect(() => {
    const fetchDictionary = async () => {
      const dict = await loadDictionary(locale);
      setDictionary(dict);
    };
    fetchDictionary();
  }, [locale]);

  // Function to change locale and store preference (optional)
  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    // Optional: Save locale preference to localStorage
    // localStorage.setItem('locale', newLocale);
  };

  // Optional: Load locale preference from localStorage on mount
  // useEffect(() => {
  //   const savedLocale = localStorage.getItem('locale') as Locale | null;
  //   if (savedLocale && ['en', 'es'].includes(savedLocale)) {
  //     setLocaleState(savedLocale);
  //   }
  // }, []);

  const contextValue: I18nContextType = {
    locale,
    dictionary,
    setLocale,
  };

  return (
    <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
  );
};

// Custom hook to use the i18n context
// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
