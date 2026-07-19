import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
  "nav.logout": { en: "Log out", ar: "تسجيل الخروج" },
  // common
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "common.language": { en: "Language", ar: "اللغة" },
};

// Text-keyed dictionary: translate by the exact English source string. This lets
// shared components (PageHeader, states, …) translate app-wide with no per-page
// wiring. English rendering is unchanged (tx returns the source text in `en`),
// so tests that match English text keep passing.
const BY_TEXT: Record<string, string> = {
  // ── page titles / subtitles ──────────────────────────────────────────────
  "A warmer way to learn to speak": "طريقة أدفأ لتعلّم التحدث",
  "AI prepares and analyses — but the conversation is always with a friendly, vetted human.":
    "الذكاء الاصطناعي يجهّز ويحلّل — لكن المحادثة دائمًا مع إنسان ودود ومُعتمد.",
  "Real people lead every session": "أشخاص حقيقيون يقودون كل جلسة",
  "Four steps, then you're speaking": "أربع خطوات، ثم تبدأ التحدث",
  "Questions, answered": "أسئلة، وإجاباتها",
  "“I finally found someone to practise with”": "«أخيرًا وجدت من أتدرّب معه»",
  "OneClub isn't another course to finish. It's a place to talk — and to feel a little braver every time.":
    "OneClub ليست دورة أخرى لإنهائها. إنها مكان للتحدث — ولتشعر بشجاعة أكبر في كل مرة.",
  "Your next conversation is one click away.": "محادثتك القادمة على بُعد نقرة واحدة.",
  "Here's your conversation practice at a glance.": "إليك لمحة سريعة عن تدريبك على المحادثة.",
  "Book a session": "احجز جلسة",
  "Pick a topic — you'll preview the discussion questions before choosing a time.":
    "اختر موضوعًا — ستعاين أسئلة النقاش قبل اختيار الوقت.",
  "Choose a topic to practise with an instructor.": "اختر موضوعًا لتتدرّب مع مُعلّم.",
  "Practice": "التدريب",
  "Keep improving between your live sessions.": "واصل التحسّن بين جلساتك المباشرة.",
  "Community": "المجتمع",
  "Join a live group class and practise with other learners.":
    "انضم إلى صف جماعي مباشر وتدرّب مع متعلّمين آخرين.",
  "Session reports": "تقارير الجلسات",
  "Session report": "تقرير الجلسة",
  "Your AI feedback from completed sessions.": "ملاحظات الذكاء الاصطناعي من جلساتك المكتملة.",
  "Settings": "الإعدادات",
  "Manage your profile, goal, and subscription.": "أدر ملفك الشخصي وهدفك واشتراكك.",
  "Availability": "الأوقات المتاحة",
  "Open the times when students can book live sessions with you.":
    "افتح الأوقات التي يمكن للطلاب حجز جلسات مباشرة معك فيها.",
  "My sessions": "جلساتي",
  "My students": "طلابي",
  "Cancel or reschedule your booked sessions.": "ألغِ أو أعد جدولة جلساتك المحجوزة.",
  "Everyone you've taught — tap a student to prep.": "كل من علّمتهم — اضغط على طالب للتحضير.",
  "Pre-session prep — level, goal, and history.": "تحضير ما قبل الجلسة — المستوى والهدف والسجلّ.",
  "My profile": "ملفي الشخصي",
  "This is what students see when they book you.": "هذا ما يراه الطلاب عند حجزهم معك.",
  "Build a topic": "أنشئ موضوعًا",
  "You create the topic. AI suggests subtopics and questions — you decide what to keep.":
    "أنت تنشئ الموضوع. يقترح الذكاء الاصطناعي مواضيع فرعية وأسئلة — وأنت تقرّر ما تبقيه.",
  "Operations Center": "مركز العمليات",
  "Run the platform: approvals, sessions, and today's activity at a glance.":
    "أدر المنصة: الموافقات والجلسات ونشاط اليوم في لمحة.",
  "Payment approval": "اعتماد المدفوعات",
  "Every transfer is verified manually here — proofs are never auto-approved.":
    "يتم التحقق من كل تحويل يدويًا هنا — لا تُعتمد الإثباتات تلقائيًا أبدًا.",
  "Sessions monitor": "مراقبة الجلسات",
  "Every live session across the platform.": "كل جلسة مباشرة عبر المنصة.",
  "Members": "الأعضاء",
  "Manage students, teachers and admins.": "أدر الطلاب والمعلّمين والمشرفين.",
  "Business": "الأعمال",
  "Revenue, subscriptions and teaching output.": "الإيرادات والاشتراكات ومخرجات التدريس.",
  "Platform": "المنصة",
  "Provider health and the AI report queue.": "حالة المزوّد وطابور تقارير الذكاء الاصطناعي.",
  "Audit log": "سجل التدقيق",
  "Every manual admin action is recorded (append-only).":
    "يُسجَّل كل إجراء إداري يدوي (إضافة فقط).",
  "Join OneClub and start practising with real instructors.":
    "انضم إلى OneClub وابدأ التدرّب مع مُعلّمين حقيقيين.",
  "Forgot your password? It happens.": "نسيت كلمة المرور؟ يحدث ذلك.",
  "Your sessions, topics, and AI-assisted prep.":
    "جلساتك ومواضيعك والتحضير بمساعدة الذكاء الاصطناعي.",
  "What happens next": "ما الذي يحدث بعد ذلك",
  "We'll notify you": "سنُعلمك",
  "How your interview was evaluated": "كيف تم تقييم مقابلتك",
  "Review these before your session so you can practise with confidence.":
    "راجع هذه قبل جلستك لتتدرّب بثقة.",
  // ── report sections ──────────────────────────────────────────────────────
  "Grammar": "القواعد",
  "Vocabulary": "المفردات",
  "Fluency": "الطلاقة",
  "Pronunciation": "النطق",
  "Strengths": "نقاط القوة",
  "To work on": "بحاجة إلى تحسين",
  "Recommended topics": "مواضيع موصى بها",
  "Homework": "الواجب المنزلي",
  "Your strongest skills": "أقوى مهاراتك",
  "Areas needing improvement": "مجالات بحاجة إلى تحسين",
  "Your report is being prepared": "يتم تجهيز تقريرك",
  // ── empty / loading / error states ───────────────────────────────────────
  "No sessions": "لا توجد جلسات",
  "No sessions yet": "لا توجد جلسات بعد",
  "No students yet": "لا يوجد طلاب بعد",
  "No topics available yet": "لا توجد مواضيع متاحة بعد",
  "No goals available yet": "لا توجد أهداف متاحة بعد",
  "No reports yet": "لا توجد تقارير بعد",
  "No placement result yet": "لا توجد نتيجة تحديد مستوى بعد",
  "No group sessions scheduled yet": "لا توجد جلسات جماعية مجدولة بعد",
  "No actions recorded yet": "لم تُسجَّل أي إجراءات بعد",
  "Queue is clear 🎉": "الطابور فارغ 🎉",
  "Couldn’t load your report": "تعذّر تحميل تقريرك",
  "Couldn’t load this": "تعذّر تحميل هذا",
  "Couldn’t open this room": "تعذّر فتح هذه الغرفة",
  "Payment not approved": "لم تتم الموافقة على الدفع",
  "More information needed": "مطلوب مزيد من المعلومات",
  "View your placement result": "اعرض نتيجة تحديد مستواك",
  "Something went wrong.": "حدث خطأ ما.",
  // ── common actions / buttons ─────────────────────────────────────────────
  "Try again": "حاول مرة أخرى",
  "Refresh": "تحديث",
  "Save": "حفظ",
  "Cancel": "إلغاء",
  "Save notes": "حفظ الملاحظات",
  "Saving…": "جارٍ الحفظ…",
  "Accept report": "قبول التقرير",
  "Regenerate": "إعادة الإنشاء",
  "Regenerating…": "جارٍ إعادة الإنشاء…",
  "Submit rating": "إرسال التقييم",
  "Submitting…": "جارٍ الإرسال…",
  "Rate your session": "قيّم جلستك",
  "Instructor tools": "أدوات المعلّم",
  "Book a follow-up session": "احجز جلسة متابعة",
  "Sign in": "تسجيل الدخول",
  "Sign out": "تسجيل الخروج",
  "Log out": "تسجيل الخروج",
  "Notifications": "الإشعارات",
  "You're all caught up 🎉": "أنت على اطّلاع بكل شيء 🎉",
  "Confidence": "الثقة",
  "Session summary": "ملخّص الجلسة",
  "Focus for your next lesson": "التركيز في درسك القادم",
  "Participation": "المشاركة",
  "Weaknesses": "نقاط الضعف",
  "Next focus": "التركيز التالي",
};

interface I18nValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  /** Translate by exact English source text (no key needed). */
  tx: (text: string | undefined) => string | undefined;
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
  const tx = (text: string | undefined) => translateText(text, lang);

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
      tx: (text) => text,
      setLang: () => {},
      toggle: () => {},
    };
  return ctx;
}
