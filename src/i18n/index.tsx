import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BY_TEXT } from "./dictionary";

export type Lang = "en" | "ar";

// Translation dictionary. English is the source of truth; Arabic covers the app
// shell + high-traffic screens. Missing keys fall back to English, then the key.
const TRANSLATIONS: Record<string, { en: string; ar: string }> = {
  // nav
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.book": { en: "Book Session", ar: "حجز جلسة" },
  "nav.practice": { en: "Practice", ar: "التدريب" },
  "nav.community": { en: "Community", ar: "المجتمع" },
  "nav.reports": { en: "Session Reports", ar: "تقارير الجلسات" },
  "nav.settings": { en: "Settings", ar: "الإعدادات" },
  "nav.availability": { en: "Availability", ar: "الأوقات المتاحة" },
  "nav.sessions": { en: "My Sessions", ar: "جلساتي" },
  "nav.students": { en: "My Students", ar: "طلابي" },
  "nav.topics": { en: "Topics & Questions", ar: "المواضيع والأسئلة" },
  "nav.profile": { en: "My Profile", ar: "ملفي الشخصي" },
  "nav.payments": { en: "Payment Approval", ar: "اعتماد المدفوعات" },
  "nav.members": { en: "Members", ar: "الأعضاء" },
  "nav.business": { en: "Business", ar: "الأعمال" },
  "nav.platform": { en: "Platform", ar: "المنصة" },
  "nav.audit": { en: "Audit log", ar: "سجل التدقيق" },
  "nav.teaching": { en: "Teaching", ar: "التدريس" },
  "nav.sessionsAll": { en: "Sessions", ar: "الجلسات" },
  "nav.bookings": { en: "Bookings", ar: "الحجوزات" },
  "nav.plans": { en: "Plans", ar: "الخطط" },
  "nav.schedule": { en: "My Schedule", ar: "جدولي الأسبوعي" },
  "nav.progress": { en: "My Progress", ar: "تقدّمي" },
  "nav.aitutor": { en: "AI Tutor", ar: "المعلّم الذكي" },
  "nav.publicProfile": { en: "Public Profile", ar: "الملف العام" },
  "nav.adminInstructors": { en: "Instructors", ar: "المدرّسون" },
  "nav.logout": { en: "Log out", ar: "تسجيل الخروج" },
  // common
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "common.language": { en: "Language", ar: "اللغة" },
};


/** Translate-by-source-text. Overloaded so a string in yields a string out. */
interface TxFn {
  (text: string): string;
  (text: string | undefined): string | undefined;
}

interface I18nValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  /** Translate by exact English source text (no key needed). */
  tx: TxFn;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "oneclub_lang";

function readInitial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

function translateText(text: string | undefined, lang: Lang): string | undefined {
  if (text == null) return text;
  if (lang !== "ar") return text;
  return BY_TEXT[text] ?? text;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("lang", lang);
    el.setAttribute("dir", dir);
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    setLangState(l);
  };

  const t = (key: string) => TRANSLATIONS[key]?.[lang] ?? TRANSLATIONS[key]?.en ?? key;
  const tx = ((text: string | undefined) => translateText(text, lang)) as TxFn;

  return (
    <I18nContext.Provider value={{ lang, dir, t, tx, setLang, toggle: () => setLang(lang === "ar" ? "en" : "ar") }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  // Safe fallback so components work outside the provider (e.g. some tests).
  if (!ctx)
    return {
      lang: "en",
      dir: "ltr",
      t: (k) => TRANSLATIONS[k]?.en ?? k,
      tx: ((text: string | undefined) => text) as TxFn,
      setLang: () => {},
      toggle: () => {},
    };
  return ctx;
}
