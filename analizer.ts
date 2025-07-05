#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

// Get current directory (for ES modules)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __filename = fileURLToPath(import.meta.url);

// --- Configuration ---
const CONFIG = {
  // Locales directory (relative to project root)
  localesDir: path.join(process.cwd(), "src", "locales"),
  // Alternative common paths for locales
  alternativeLocalesPaths: [
    path.join(process.cwd(), "src", "i18n", "locales"),
    path.join(process.cwd(), "src", "assets", "locales"),
    path.join(process.cwd(), "public", "locales"),
    path.join(process.cwd(), "locales"),
  ],
  // Source directories to scan for translations usage
  sourceDirs: [path.join(process.cwd(), "src")],
  // File extensions to scan
  fileExtensions: /\.(tsx|ts|jsx|js)$/,
  // Default locale (base for comparison)
  defaultLocale: "en",
  // Other locales to compare (focusing on ES and EN)
  otherLocales: ["es"],
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

// Helper to colorize console output
const colorize = (text: string, color: keyof typeof colors): string =>
  `${colors[color]}${text}${colors.reset}`;

interface LocaleData {
  [key: string]: unknown;
}

interface KeyStatus {
  key: string;
  inCode: boolean;
  inEN: boolean;
  inES: boolean;
}

interface AnalysisResult {
  defaultLocaleKeys: Set<string>;
  otherLocaleKeys: { [locale: string]: Set<string> };
  usedKeys: Set<string>;
  allLocaleKeys: Set<string>;
  availableLocales: string[];
  keyStatuses: KeyStatus[];
  localesDir: string;
}

// Helper to recursively get all keys from a nested object
function getKeys(obj: unknown, prefix = ""): Set<string> {
  const keys = new Set<string>();

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return keys;
  }

  const objRecord = obj as Record<string, unknown>;

  for (const key in objRecord) {
    if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof objRecord[key] === "object" &&
        objRecord[key] !== null &&
        !Array.isArray(objRecord[key])
      ) {
        // Recursively get keys from nested objects
        getKeys(objRecord[key], fullKey).forEach((k) => keys.add(k));
      } else {
        keys.add(fullKey);
      }
    }
  }

  return keys;
}

// Helper to set a nested key in an object
function setNestedKey(
  obj: Record<string, unknown>,
  keyPath: string[],
  value: string
): void {
  let current = obj;

  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    if (
      !current[key] ||
      typeof current[key] !== "object" ||
      Array.isArray(current[key])
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keyPath[keyPath.length - 1]] = value;
}

// Helper to remove a key from nested object
function removeKey(obj: unknown, keyPath: string[]): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }

  const objRecord = obj as Record<string, unknown>;
  const currentKey = keyPath[0];

  if (keyPath.length === 1) {
    if (Object.prototype.hasOwnProperty.call(objRecord, currentKey)) {
      delete objRecord[currentKey];
      return true;
    }
    return false;
  } else {
    if (
      Object.prototype.hasOwnProperty.call(objRecord, currentKey) &&
      typeof objRecord[currentKey] === "object" &&
      !Array.isArray(objRecord[currentKey])
    ) {
      const removed = removeKey(objRecord[currentKey], keyPath.slice(1));

      // Clean up empty parent objects
      if (
        removed &&
        Object.keys(objRecord[currentKey] as Record<string, unknown>).length ===
          0
      ) {
        delete objRecord[currentKey];
      }

      return removed;
    }
    return false;
  }
}

// Find the locales directory
async function findLocalesDirectory(): Promise<string | null> {
  // Check default path first
  try {
    await fs.access(CONFIG.localesDir);
    return CONFIG.localesDir;
  } catch {
    // Try alternative paths
    for (const altPath of CONFIG.alternativeLocalesPaths) {
      try {
        await fs.access(altPath);
        return altPath;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// Load a locale file
async function loadLocale(
  locale: string,
  localesDir: string
): Promise<LocaleData | null> {
  const filePath = path.join(localesDir, `${locale}.json`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as LocaleData;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      // File doesn't exist, skip silently
      return null;
    } else {
      console.error(
        colorize(`Error reading/parsing locale file "${locale}":`, "red"),
        nodeError.message
      );
      return null;
    }
  }
}

// Scan source files for translation key usage
async function scanSourceFiles(dirs: string[]): Promise<Set<string>> {
  const usedKeys = new Set<string>();

  // Enhanced regex patterns for different i18n usage patterns
  const patterns = [
    // Standard t() function calls
    /(?:^|[^a-zA-Z0-9_])t\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    // useTranslation hook with t() calls
    /(?:^|[^a-zA-Z0-9_])t\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g,
    // i18n.t() calls
    /i18n\.t\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    // Translation with namespaces
    /(?:^|[^a-zA-Z0-9_])t\s*\(\s*['"`]([^'"`]+:[^'"`]+)['"`]\s*\)/g,
  ];

  async function traverseDirectory(currentDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip common build/dependency directories
          if (
            !["node_modules", "dist", "build", ".git", ".next"].includes(
              entry.name
            )
          ) {
            await traverseDirectory(fullPath);
          }
        } else if (entry.isFile() && CONFIG.fileExtensions.test(entry.name)) {
          try {
            const content = await fs.readFile(fullPath, "utf-8");

            // Apply all patterns to find translation keys
            for (const pattern of patterns) {
              let match;
              while ((match = pattern.exec(content)) !== null) {
                const key = match[1];
                // Remove namespace prefix if present (e.g., "common:hello" -> "hello")
                const cleanKey = key.includes(":") ? key.split(":")[1] : key;
                usedKeys.add(cleanKey);
              }
            }
          } catch (error) {
            console.error(
              colorize(`Error reading file ${fullPath}:`, "red"),
              error
            );
          }
        }
      }
    } catch (error) {
      console.error(
        colorize(`Error traversing directory ${currentDir}:`, "red"),
        error
      );
    }
  }

  for (const dir of dirs) {
    await traverseDirectory(dir);
  }

  return usedKeys;
}

// Main analysis function
async function analyzeLocales(): Promise<AnalysisResult | null> {
  console.log(
    colorize("\n🔍 Analyzing i18n locales and source code...", "cyan")
  );

  // Find locales directory
  const localesDir = await findLocalesDirectory();
  if (!localesDir) {
    console.error(colorize("❌ Locales directory not found!", "red"));
    console.log("Searched in:");
    [CONFIG.localesDir, ...CONFIG.alternativeLocalesPaths].forEach((p) =>
      console.log(`  - ${p}`)
    );
    return null;
  }

  console.log(colorize(`📁 Found locales directory: ${localesDir}`, "green"));

  // Load default locale (EN)
  const defaultLocaleData = await loadLocale(CONFIG.defaultLocale, localesDir);
  if (!defaultLocaleData) {
    console.error(
      colorize(
        `❌ Default locale file ${CONFIG.defaultLocale}.json not found!`,
        "red"
      )
    );
    return null;
  }

  // Load other locales (ES)
  const otherLocaleData: { [key: string]: LocaleData } = {};
  const otherLocaleKeys: { [key: string]: Set<string> } = {};
  const availableLocales: string[] = [];

  for (const locale of CONFIG.otherLocales) {
    const data = await loadLocale(locale, localesDir);
    if (data) {
      otherLocaleData[locale] = data;
      otherLocaleKeys[locale] = getKeys(data);
      availableLocales.push(locale);
    }
  }

  const defaultLocaleKeys = getKeys(defaultLocaleData);
  const allLocaleKeys = new Set([
    ...defaultLocaleKeys,
    ...Object.values(otherLocaleKeys).flatMap((keys) => [...keys]),
  ]);

  // Scan source files
  console.log(
    colorize("🔍 Scanning source files for translation usage...", "cyan")
  );
  const usedKeys = await scanSourceFiles(CONFIG.sourceDirs);

  // Create key status array
  const allUniqueKeys = new Set([...allLocaleKeys, ...usedKeys]);
  const keyStatuses: KeyStatus[] = Array.from(allUniqueKeys).map((key) => ({
    key,
    inCode: usedKeys.has(key),
    inEN: defaultLocaleKeys.has(key),
    inES: otherLocaleKeys["es"]?.has(key) || false,
  }));

  // Sort keys alphabetically
  keyStatuses.sort((a, b) => a.key.localeCompare(b.key));

  return {
    defaultLocaleKeys,
    otherLocaleKeys,
    usedKeys,
    allLocaleKeys,
    availableLocales,
    keyStatuses,
    localesDir,
  };
}

// Display results table
function displayResultsTable(results: AnalysisResult): void {
  console.log(colorize("\n📊 Translation Keys Status", "bright"));
  console.log("=".repeat(60));

  // Table header
  console.log("Key".padEnd(35) + "Code".padEnd(8) + "EN".padEnd(8) + "ES");
  console.log("-".repeat(60));

  // Table rows
  results.keyStatuses.forEach((status) => {
    const keyCol =
      status.key.length > 32 ? status.key.substring(0, 29) + "..." : status.key;
    const codeSymbol = status.inCode ? "✓" : "✗";
    const enSymbol = status.inEN ? "✓" : "✗";
    const esSymbol = status.inES ? "✓" : "✗";

    const codeCol = status.inCode
      ? colorize(codeSymbol, "green")
      : colorize(codeSymbol, "red");
    const enCol = status.inEN
      ? colorize(enSymbol, "green")
      : colorize(enSymbol, "red");
    const esCol = status.inES
      ? colorize(esSymbol, "green")
      : colorize(esSymbol, "red");

    // Build the row with proper spacing
    const row =
      keyCol.padEnd(35) +
      codeCol.padEnd(8 + (codeCol.length - codeSymbol.length)) +
      enCol.padEnd(8 + (enCol.length - enSymbol.length)) +
      esCol;

    console.log(row);
  });

  console.log("-".repeat(60));
  console.log(`Total keys: ${results.keyStatuses.length}`);
}

// Create readline interface
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Ask user for confirmation
async function askConfirmation(
  rl: readline.Interface,
  message: string
): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(colorize(message, "yellow"), (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Ask user for input
async function askInput(
  rl: readline.Interface,
  message: string
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(colorize(message, "cyan"), (answer) => {
      resolve(answer.trim());
    });
  });
}

// Add missing keys to locale files
async function addMissingKeys(results: AnalysisResult): Promise<void> {
  const keysInCodeOnly = results.keyStatuses.filter(
    (s) => s.inCode && (!s.inEN || !s.inES)
  );

  if (keysInCodeOnly.length === 0) {
    console.log(
      colorize("\n✅ No missing keys found in locale files.", "green")
    );
    return;
  }

  console.log(
    colorize(
      `\n📝 Found ${keysInCodeOnly.length} keys in code that are missing from locale files:`,
      "yellow"
    )
  );
  keysInCodeOnly.forEach((status) => {
    const missing = [] as string[];
    if (!status.inEN) missing.push("EN");
    if (!status.inES) missing.push("ES");
    console.log(`  - ${status.key} (missing in: ${missing.join(", ")})`);
  });

  const rl = createReadlineInterface();

  try {
    const proceed = await askConfirmation(
      rl,
      "\nDo you want to add these keys to the locale files? (y/n): "
    );

    if (!proceed) {
      console.log(colorize("Operation cancelled.", "yellow"));
      return;
    }

    for (const status of keysInCodeOnly) {
      const defaultValue = await askInput(
        rl,
        `Enter translation for "${status.key}" (or press enter for placeholder): `
      );
      const translation = defaultValue || `[${status.key}]`;

      // Add to EN.json if missing
      if (!status.inEN) {
        const enData = (await loadLocale("en", results.localesDir)) || {};
        setNestedKey(
          enData as Record<string, unknown>,
          status.key.split("."),
          translation
        );
        await fs.writeFile(
          path.join(results.localesDir, "en.json"),
          JSON.stringify(enData, null, 2),
          "utf-8"
        );
      }

      // Add to ES.json if missing
      if (!status.inES) {
        const esData = (await loadLocale("es", results.localesDir)) || {};
        setNestedKey(
          esData as Record<string, unknown>,
          status.key.split("."),
          translation
        );
        await fs.writeFile(
          path.join(results.localesDir, "es.json"),
          JSON.stringify(esData, null, 2),
          "utf-8"
        );
      }
    }

    console.log(
      colorize(
        `\n✅ Added ${keysInCodeOnly.length} keys to locale files.`,
        "green"
      )
    );
  } finally {
    rl.close();
  }
}

// Delete keys from specific locale file
async function deleteKeysFromLocale(
  results: AnalysisResult,
  locale: "en" | "es"
): Promise<void> {
  const keysInLocaleOnly = results.keyStatuses.filter(
    (s) => (locale === "en" ? s.inEN : s.inES) && !s.inCode
  );

  if (keysInLocaleOnly.length === 0) {
    console.log(
      colorize(
        `\n✅ No unused keys found in ${locale.toUpperCase()}.json.`,
        "green"
      )
    );
    return;
  }

  console.log(
    colorize(
      `\n🗑️  Found ${
        keysInLocaleOnly.length
      } unused keys in ${locale.toUpperCase()}.json:`,
      "yellow"
    )
  );
  keysInLocaleOnly.forEach((status) => {
    console.log(`  - ${status.key}`);
  });

  const rl = createReadlineInterface();

  try {
    const proceed = await askConfirmation(
      rl,
      `\nDo you want to delete these keys from ${locale.toUpperCase()}.json? (y/n): `
    );

    if (!proceed) {
      console.log(colorize("Operation cancelled.", "yellow"));
      return;
    }

    const confirmDelete = await askConfirmation(
      rl,
      colorize(`⚠️  Are you sure? This action cannot be undone! (y/n): `, "red")
    );

    if (!confirmDelete) {
      console.log(colorize("Operation cancelled.", "yellow"));
      return;
    }

    const localeData = await loadLocale(locale, results.localesDir);
    if (!localeData) {
      console.log(
        colorize(`❌ Could not load ${locale.toUpperCase()}.json`, "red")
      );
      return;
    }

    let removedCount = 0;
    for (const status of keysInLocaleOnly) {
      const keyPath = status.key.split(".");
      if (removeKey(localeData, keyPath)) {
        removedCount++;
      }
    }

    await fs.writeFile(
      path.join(results.localesDir, `${locale}.json`),
      JSON.stringify(localeData, null, 2),
      "utf-8"
    );

    console.log(
      colorize(
        `\n✅ Removed ${removedCount} keys from ${locale.toUpperCase()}.json.`,
        "green"
      )
    );
  } finally {
    rl.close();
  }
}

// Main menu
async function showMainMenu(results: AnalysisResult): Promise<void> {
  const rl = createReadlineInterface();

  try {
    while (true) {
      console.log(colorize("\n🎯 Main Menu", "bright"));
      console.log("=".repeat(30));
      console.log("1. Show keys table");
      console.log("2. Add missing keys to locale files");
      console.log("3. Delete unused keys from EN.json");
      console.log("4. Delete unused keys from ES.json");
      console.log("5. Re-analyze project");
      console.log("6. Exit");
      console.log();

      const choice = await askInput(rl, "Select an option (1-6): ");

      switch (choice) {
        case "1":
          displayResultsTable(results);
          break;
        case "2":
          await addMissingKeys(results);
          break;
        case "3":
          await deleteKeysFromLocale(results, "en");
          break;
        case "4":
          await deleteKeysFromLocale(results, "es");
          break;
        case "5":
          rl.close();
          await main();
          return;
        case "6":
          console.log(colorize("\n👋 Goodbye!", "green"));
          return;
        default:
          console.log(colorize("Invalid option. Please try again.", "red"));
      }

      const continueMenu = await askConfirmation(
        rl,
        "\nReturn to main menu? (y/n): "
      );
      if (!continueMenu) {
        console.log(colorize("\n👋 Goodbye!", "green"));
        return;
      }
    }
  } finally {
    rl.close();
  }
}

// Main execution
async function main(): Promise<void> {
  console.log(colorize("🌍 Enhanced i18n Locale Analyzer", "bright"));
  console.log(colorize("===================================", "bright"));

  const results = await analyzeLocales();

  if (!results) {
    process.exit(1);
  }

  displayResultsTable(results);
  await showMainMenu(results);

  console.log(colorize("\n✨ Analysis complete!", "green"));
}

// Run the script
main().catch(console.error);
