# نظام الحجز الجديد — الجدول الأسبوعي بقيادة الطالب

## الفكرة
بدل ما **الأستاذ** يفتح مواعيد محددة والطالب يختار منها، بقى **الطالب** هو اللي
يبني جدوله الأسبوعي المتكرّر بنفسه: يختار موضوع، وبعدين يحدّد الأيام والأوقات اللي
عايز يتدرّب فيها كل أسبوع (مثلاً الأحد 9، الاتنين 12، الأربعاء 3) — ضمن الأوقات
المتاحة للأستاذ. النظام بيولّد الحجوزات الفعلية للأسابيع الجاية أوتوماتيك، وكل حجز
بيخصم جلسة واحدة من رصيد الطالب.

## اللي اتضاف

### Backend
- **نماذج جديدة** (`apps/scheduling/models.py`):
  - `RecurringAvailability` — نافذة توفّر الأستاذ الأسبوعية (يوم + من/إلى). لو الأستاذ
    ماعندوش أي نافذة، بيتعامل معاه كأنه متاح طول الأسبوع (الافتراضي "available all the time").
  - `StudentScheduleSlot` — اختيار الطالب المتكرّر الواحد (يوم + وقت + موضوع + مدة).
    مقيّد باختيار واحد فعّال لكل (طالب، يوم، وقت).
  - حقل `schedule_slot` على `Booking` يربط الحجز المولّد باختياره الأصلي.
  - Migration: `apps/scheduling/migrations/0006_*`.
- **قواعد نقية** (`domain/rules/scheduling.py`): `time_within_windows`،
  `upcoming_dates_for_weekday`.
- **خدمات** (`apps/scheduling/services.py`):
  - `set_instructor_recurring_availability` / `list_instructor_recurring_availability`
  - `set_student_schedule` (يتحقّق إن الوقت داخل نافذة الأستاذ) / `list_student_schedule`
  - `generate_bookings_from_schedule` — بيولّد الحجوزات (افتراضياً أسبوعين قدام) بإعادة
    استخدام `create_booking`، فيخصم الأرصدة وينشئ غرفة الجلسة والإشعارات، ويقف بنظافة
    لما الرصيد يخلص، وidempotent (ما بيعملش حجز مكرّر).
- **API** (`api/`):
  - `GET/PUT /student/schedule/` — قراءة/حفظ الجدول + توليد الحجوزات.
  - `POST /student/schedule/generate/` — إعادة توليد (للتحديث الدوري).
  - `GET /student/schedule/windows/?topicId=…` — نوافذ توفّر أستاذ الموضوع.
  - `GET/PUT /instructor/recurring-availability/` — الأستاذ يضبط نوافذه الأسبوعية.

### Frontend
- صفحة جديدة `src/pages/student/WeeklySchedulePage.tsx` (مسار `/student/schedule`،
  ولينك "My Schedule" في القائمة الجانبية): اختيار موضوع + شبكة أسبوعية (أيام × ساعات)
  لاختيار المواعيد المتكرّرة ضمن أوقات الأستاذ، حفظ، وعرض الجلسات القادمة المولّدة.
- إضافات في `src/api/booking.ts`، `src/api/types.ts`، `src/hooks/index.ts`،
  `src/query/queryClient.ts`.

## التشغيل
```bash
# Backend
cd backend
python manage.py migrate        # يطبّق migration 0006
python manage.py runserver

# Frontend
npm install
npm run dev
```

## الاختبارات
- Backend: `backend/api/tests/test_student_schedule_api.py` (9 اختبارات — التوليد،
  حدود الرصيد، idempotency، التحقّق من نوافذ الأستاذ، القراءة، توفّر الأستاذ).
- Frontend: `src/test/weekly-schedule.test.tsx`.

## ملاحظة عن التوليد الدوري
`generate_bookings_from_schedule` بيولّد أسبوعين قدام في كل مرة يتحفظ فيها الجدول أو
يتنادى `POST /student/schedule/generate/`. للتشغيل المستمر (توليد أسبوع جديد كل ما
يعدّي أسبوع) يُنصح بمهمة مجدولة (cron/celery) تنادي التوليد لكل طالب عنده جدول فعّال.
