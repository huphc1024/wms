import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { messages } from './messages.js';
import { extraVi } from './extraVi.js';

const STORAGE_KEY = 'sentry_admin_locale';

const LocaleContext = createContext(null);

function interpolate(template, vars) {
  if (!vars || typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : `{${key}}`
  ));
}

/** Build English-text → Vietnamese lookup from en/vi message pairs + extras. */
function buildEnToVi() {
  const map = new Map();
  for (const [key, en] of Object.entries(messages.en)) {
    const vi = messages.vi[key];
    if (typeof en === 'string' && typeof vi === 'string' && en !== vi) {
      map.set(en, vi);
    }
  }
  for (const [en, vi] of Object.entries(extraVi)) {
    map.set(en, vi);
  }
  return map;
}

const EN_TO_VI = buildEnToVi();

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'vi' || saved === 'en' ? saved : 'vi';
  });

  const setLocale = useCallback((next) => {
    const value = next === 'en' ? 'en' : 'vi';
    localStorage.setItem(STORAGE_KEY, value);
    setLocaleState(value);
  }, []);

  const t = useCallback((key, fallbackOrVars, maybeVars) => {
    const table = messages[locale] || messages.vi;
    let fallback = key;
    let vars;
    if (typeof fallbackOrVars === 'string') {
      fallback = fallbackOrVars;
      vars = maybeVars;
    } else if (fallbackOrVars && typeof fallbackOrVars === 'object') {
      vars = fallbackOrVars;
    }
    const raw = table[key] ?? messages.vi[key] ?? messages.en[key] ?? fallback;
    return interpolate(raw, vars);
  }, [locale]);

  /** Translate a hardcoded English UI string when locale is Vietnamese. */
  const tx = useCallback((english) => {
    if (locale !== 'vi' || english == null) return english;
    const s = String(english);
    if (EN_TO_VI.has(s)) return EN_TO_VI.get(s);
    // Status codes
    const statusKey = `status.${s}`;
    if (messages.vi[statusKey]) return messages.vi[statusKey];
    return s;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, tx }), [locale, setLocale, t, tx]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
