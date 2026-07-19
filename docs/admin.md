برمت لرحلة الإدارة
# المهمة

أنت تعمل كمهندس برمجيات Full-Stack ومسؤول عن تنفيذ **رحلة الإدارة الكاملة داخل منصة OneClub**.

لا تنفذ مجرد صفحات CRUD منفصلة.

يجب تنفيذ رحلة إدارية مترابطة End-to-End تجعل لوحة الإدارة مركزًا لتشغيل المنصة، ومتابعة الطلاب والمدرسين والمدفوعات والجلسات والمشكلات والتقارير والعمليات اليومية.

يجب الالتزام بالمعمارية الحالية للمشروع، وإعادة استخدام ما هو موجود، وعدم إعادة كتابة النظام دون ضرورة.

---

# الدور والمسؤولية

أنت المنفذ التقني.

قبل كتابة أي كود يجب أن:

- تفحص المشروع كاملًا.
- تحدد ما هو منفذ فعليًا.
- تحدد ما يعتمد على Mock Data.
- تحدد ما يعتمد على Stub Providers.
- تحدد الفجوات بين التوثيق والكود.
- تعيد استخدام الـ Models والـ APIs والـ Use Cases الحالية.
- تحافظ على Clean Architecture.
- تطبق الصلاحيات في Backend.
- تكتب اختبارات حقيقية.
- لا تدّعي اكتمال أي جزء دون دليل.

لا تنتقل إلى مرحلة جديدة قبل تقديم تقرير المرحلة الحالية وإغلاقها.

---

# سياق المشروع

اسم المشروع:

OneClub

نوع المنتج:

منصة لتعلم المحادثة الإنجليزية من خلال مدرس بشري، بينما يعمل الذكاء الاصطناعي كمساعد قبل الجلسة وبعدها.

الأدوار الأساسية:

- Student
- Instructor
- Administrator

التقنيات المتوقعة:

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Router

## Backend

- Python
- Django
- Django REST Framework
- MySQL
- Celery
- Redis

## Architecture

- Modular Monolith
- Clean Architecture
- DDD Lite
- API First
- Scenario-Driven Development
- Provider Abstraction
- Background Jobs

---

# الهدف الرئيسي

تنفيذ السيناريو التشغيلي الكامل للإدارة:

```text
Admin Login

↓

Operations Dashboard

↓

Review Critical Alerts

↓

Review Pending Payments

↓

Approve or Reject Payments

↓

Activate Student Subscription

↓

Monitor Today's Sessions

↓

Resolve Session Incidents

↓

Review Students

↓

Review Instructors

↓

Manage Availability and Assignments

↓

Monitor AI Jobs and Reports

↓

Manage Plans and Content

↓

Review Business Metrics

↓

Review Audit Logs

↓

Complete End-of-Day Operations
المرحلة صفر — فحص الوضع الحالي

قبل أي تنفيذ:

افحص بنية المشروع.
حدد جميع وحدات الإدارة الحالية.
حدد صفحات Admin الحالية.
حدد الـ APIs الحالية.
حدد نماذج قاعدة البيانات.
حدد Use Cases الموجودة.
حدد صلاحيات الإدارة.
حدد الاختبارات الحالية.
حدد البيانات الوهمية.
حدد التكاملات التجريبية أو الـ Stubs.
قارن التوثيق بالتنفيذ.
تحقق مما إذا كانت لوحة الإدارة الحالية تشغيلية أو مجرد Dashboard إحصائية.

قدّم تقريرًا أوليًا بهذا الشكل:

Current Admin Features

Existing Admin Screens

Existing Admin APIs

Existing Database Models

Existing Permissions

Existing Tests

Mock Implementations

Stub Implementations

Documentation Mismatches

Missing Operational Workflows

Security Risks

Recommended Implementation Order

لا تبدأ التنفيذ قبل تقديم هذا التقرير.

المرحلة الأولى — المصادقة والصلاحيات

تحقق من وجود Administrator Role حقيقي.

يجب تطبيق قواعد الصلاحيات التالية:

الإدارة تصل فقط إلى واجهات الإدارة.
الطالب لا يصل إلى Admin APIs.
المدرس لا يصل إلى Admin APIs.
الإدارة ترى البيانات وفق الصلاحية الممنوحة لها.
ليست كل حسابات الإدارة Super Admin.
الإجراءات الحساسة تحتاج صلاحيات دقيقة.
إخفاء الزر في Frontend لا يعتبر حماية.
جميع الصلاحيات تطبق في Backend وObject Level.

أنشئ أو تحقق من وجود صلاحيات مثل:

view_operations_dashboard
manage_students
manage_instructors
review_payments
approve_payments
reject_payments
manage_subscriptions
manage_bookings
manage_sessions
retry_ai_jobs
manage_plans
manage_content
view_business_metrics
manage_admin_users
view_audit_logs
manage_platform_settings

يجب دعم الفرق بين:

Super Admin
Operations Admin
Academic Admin
Finance Admin
Support Admin
Read-only Auditor

إذا لم يكن تعدد أنواع الإدارة ضمن MVP، حافظ على تصميم قابل للتوسع دون تعقيد زائد.

المرحلة الثانية — لوحة العمليات الرئيسية

أنشئ أو حدّث:

/admin/dashboard

يجب ألا تكون الصفحة مجرد أرقام.

يجب أن تعمل كـ Operations Center.

ملخص اليوم

اعرض:

عدد الطلاب النشطين.
عدد المدرسين النشطين.
جلسات اليوم.
الجلسات القادمة.
الجلسات الجارية.
الجلسات المكتملة.
الجلسات الملغاة.
الطلاب الذين لم يحضروا.
المدرسون الذين لم يحضروا.
المدفوعات المعلقة.
تقارير AI المعلقة.
المشكلات التشغيلية المفتوحة.
مؤشرات سريعة
إيرادات اليوم.
إيرادات الشهر.
الاشتراكات المفعلة.
الاشتراكات القريبة من الانتهاء.
الحجوزات اليوم.
معدل الحضور.
معدل الإلغاء.
معدل فشل تقارير AI.
الإجراءات السريعة
مراجعة المدفوعات.
إضافة مدرس.
فتح جلسات اليوم.
عرض التنبيهات.
إضافة خطة اشتراك.
إدارة المحتوى.
فتح سجل التدقيق.

كل بطاقة يجب أن تقود إلى قائمة مفلترة ذات صلة.

لا تستخدم Mock Data في المسار الإنتاجي.

المرحلة الثالثة — مركز التنبيهات والمشكلات

أنشئ:

/admin/operations/alerts

يجب أن يعرض المشكلات التي تحتاج تدخلًا.

أنواع التنبيهات:

Payment Waiting Too Long

Payment Review Failed

Subscription Activation Failed

Teacher Late

Student No-show

Instructor No-show

Session Failed to Start

Video Provider Failure

Transcript Failure

Recording Failure

AI Report Delayed

AI Report Failed

Email Delivery Failed

Storage Failure

Background Job Failure

Repeated Login Failure

Suspicious Admin Activity

كل تنبيه يحتوي على:

النوع.
الشدة.
وقت الإنشاء.
الكيان المرتبط.
الطالب أو المدرس المرتبط.
الحالة.
المسؤول المعين.
الإجراء المقترح.
سجل الأحداث.

حالات التنبيه:

Open
Acknowledged
In Progress
Resolved
Dismissed
Escalated

يجب تسجيل أي تغيير في Audit Log.

المرحلة الرابعة — إدارة المدفوعات

أنشئ أو حدّث:

/admin/payments
/admin/payments/:paymentId
قائمة المدفوعات

الفلاتر:

Pending
Approved
Rejected
Needs Review
Expired
Refunded
All

اعرض:

اسم الطالب.
الخطة.
المبلغ.
العملة.
تاريخ التحويل.
تاريخ رفع الإثبات.
وقت الانتظار.
حالة الدفع.
المسؤول الذي راجعه.
تفاصيل الدفع

اعرض:

الطالب.
الخطة المطلوبة.
المبلغ المتوقع.
المبلغ المرسل.
العملة.
إيصال الدفع.
مرجع التحويل إن وجد.
تاريخ الإرسال.
ملاحظات الطالب.
سجل المحاولات السابقة.
حالة الاشتراك الحالية.
إجراءات الإدارة
Approve

Reject

Request Clarification

Mark as Duplicate

Escalate for Review

عند الرفض يجب إدخال سبب.

عند الموافقة يجب تنفيذ معاملة واحدة آمنة:

Validate Payment

↓

Approve Payment

↓

Create or Activate Subscription

↓

Allocate Session Credits

↓

Create Audit Log

↓

Notify Student

يجب أن تكون العملية Transactional وIdempotent.

الضغط مرتين على Approve لا ينشئ اشتراكًا أو رصيدًا مكررًا.

المرحلة الخامسة — إدارة الطلاب

أنشئ أو حدّث:

/admin/students
/admin/students/:studentId
قائمة الطلاب

الفلاتر:

Active
Pending Payment
Subscription Expired
Placement Incomplete
No Sessions Booked
Suspended
Archived

اعرض:

الاسم.
البريد.
المستوى.
حالة Placement.
حالة الاشتراك.
الرصيد.
الجلسة القادمة.
آخر نشاط.
حالة الحساب.
صفحة الطالب

يجب أن تعرض:

الهوية والحساب
الاسم.
البريد.
الهاتف إذا كان موجودًا.
تاريخ التسجيل.
حالة التحقق.
حالة الحساب.
المسار الأكاديمي
هدف التعلم.
مستوى CEFR الحالي.
Placement result.
تاريخ التقييم.
الجلسات المكتملة.
تقارير الجلسات.
الواجبات.
التقدم.
الاشتراك
الخطة.
تاريخ البداية.
تاريخ الانتهاء.
الرصيد الكلي.
الرصيد المستخدم.
الرصيد المتبقي.
سجل التجديد.
المدفوعات
المدفوعات السابقة.
المدفوعات المعلقة.
حالات الرفض.
الإيصالات.
الجلسات
القادمة.
المكتملة.
الملغاة.
No-show.
المدرسون المرتبطون.
Timeline

اعرض سجلًا موحدًا:

Account Created

Email Verified

Onboarding Completed

Placement Started

Placement Completed

Payment Submitted

Payment Approved

Subscription Activated

Session Booked

Session Completed

AI Report Published

Subscription Renewed
الإجراءات المسموحة
تفعيل أو تعليق الحساب.
إعادة إرسال التحقق.
إعادة تعيين كلمة المرور عبر مسار آمن.
منح استثناء تشغيلي موثق.
تعديل الاشتراك ضمن صلاحية واضحة.
إضافة أو خصم رصيد مع سبب.
نقل الطالب إلى مدرس آخر إذا سمحت السياسة.
معالجة محاولة Placement وفق السياسة.

كل إجراء حساس يحتاج:

سبب.
تأكيد.
Audit Log.
إشعار عند الحاجة.
المرحلة السادسة — إدارة المدرسين

أنشئ أو حدّث:

/admin/instructors
/admin/instructors/:instructorId
قائمة المدرسين

اعرض:

الاسم.
حالة الحساب.
حالة الملف الشخصي.
Availability.
جلسات اليوم.
الطلاب الحاليون.
الجلسات المكتملة.
معدل الحضور.
معدل الإلغاء.
آخر نشاط.

الفلاتر:

Active
Inactive
Profile Incomplete
No Availability
Teaching Today
Suspended
صفحة المدرس

اعرض:

الملف الشخصي.
الخبرات.
اللغات.
التخصصات.
التوفر الأسبوعي.
الاستثناءات.
جلسات اليوم.
الجلسات القادمة.
الطلاب.
الإلغاءات.
No-show.
إحصائيات الأداء التشغيلي.
سجل الإجراءات.
الإجراءات
إرسال دعوة.
تفعيل الحساب.
تعليق الحساب.
تعديل الحالة.
مراجعة Availability.
إضافة Block Time وفق السياسة.
نقل حجوزات مستقبلية.
تعيين أو إزالة الطالب إذا كان النظام يدعم ذلك.
إعادة إرسال الدعوة.
إنهاء الوصول.

لا تعرض تقييمًا تربويًا عامًا دون مصدر وسياسة واضحة.

المرحلة السابعة — مراقبة الجلسات

أنشئ:

/admin/sessions
/admin/sessions/:sessionId
قوائم الجلسات

الفلاتر:

Upcoming
Ready
Running
Completed
Cancelled
Student No-show
Instructor No-show
Failed
Needs Review

اعرض:

الطالب.
المدرس.
الموعد.
الحالة.
مدة الجلسة.
حضور الطالب.
حضور المدرس.
حالة الفيديو.
حالة الترانسكريبت.
حالة التسجيل.
حالة تقرير AI.
تفاصيل الجلسة

اعرض:

Booking.
Session lifecycle.
المشاركون.
Join events.
Disconnect events.
Attendance summary.
Transcript status.
Recording status.
AI Report status.
Notifications.
Incident timeline.

الإدارة لا تدخل الجلسة كمشارك مخفي.

أي دخول إداري يجب أن يكون:

بصلاحية واضحة.
مرئيًا عند الحاجة.
مسجلًا.
متوافقًا مع سياسة الخصوصية.
إجراءات الإدارة
إلغاء الجلسة.
إعادة الجدولة.
تعيين حالة No-show.
تصحيح حالة تشغيلية وفق سياسة موثقة.
إعادة محاولة Report Job.
فتح Incident.
إرسال إشعار للطرفين.

منع التعديلات العشوائية على الجلسات المكتملة.

المرحلة الثامنة — إدارة الحجوزات

أنشئ أو حدّث:

/admin/bookings
/admin/bookings/:bookingId

يجب دعم:

البحث.
الفلترة.
الإلغاء.
إعادة الجدولة.
معالجة التعارض.
معالجة الحجز المكرر.
مراجعة الرصيد.
مراجعة سياسة الاسترداد.

عند إعادة الجدولة:

Validate New Slot

↓

Reserve New Slot

↓

Release Old Slot

↓

Update Booking

↓

Update Session

↓

Notify Student

↓

Notify Instructor

↓

Create Audit Log

يجب أن تكون العملية Transactional.

المرحلة التاسعة — إدارة الاشتراكات والخطط

أنشئ:

/admin/subscriptions
/admin/plans
/admin/plans/:planId
الاشتراكات

اعرض:

الطالب.
الخطة.
الحالة.
البداية.
النهاية.
الرصيد.
الاستخدام.
الدفع المرتبط.
التجديد.

الحالات:

Pending
Active
Expired
Suspended
Cancelled
Completed
الخطط

الحقول:

الاسم.
الوصف.
السعر.
العملة.
عدد الجلسات.
مدة الخطة.
مدة الجلسة.
حالة الخطة.
ترتيب العرض.

القواعد:

لا تحذف خطة مرتبطة باشتراكات تاريخية.
يمكن تعطيل الخطة بدل حذفها.
تغيير السعر لا يعدّل اشتراكات سابقة.
سجل تاريخ تغييرات الخطة.
العملة تأتي من إعدادات النظام وليست Hardcoded.
المرحلة العاشرة — إدارة Placement

أنشئ أو حدّث:

/admin/placements
/admin/placements/:placementId

اعرض:

الطالب.
حالة الاختبار.
المحاولة.
الجزء الكتابي.
الجزء المنطوق.
حالة المعالجة.
النتيجة.
مستوى CEFR.
الأخطاء التقنية.

حالات Placement:

Not Started
In Progress
Written Completed
Speaking In Progress
Processing
Completed
Failed
Needs Review

الإدارة لا تغيّر مستوى الطالب يدويًا بصورة عشوائية.

أي Override يجب أن:

يكون مسموحًا بالسياسة.
يحتاج سببًا.
يحفظ النتيجة الأصلية.
يسجل المسؤول.
يسجل التاريخ.
يظهر في Audit Log.

يجب وجود معالجة لحالات:

محاولة عالقة.
فشل الترانسكريبت.
فشل التقييم.
عدم وجود محاولات إضافية.
Admin-authorized retake إذا سمحت السياسة.
المرحلة الحادية عشرة — إدارة تقارير AI والوظائف الخلفية

أنشئ:

/admin/ai-jobs
/admin/ai-reports
/admin/ai-jobs/:jobId

الحالات:

Pending
Processing
Completed
Failed
Retrying
Dead Letter

اعرض:

نوع المهمة.
الكيان المرتبط.
Session ID.
Student.
عدد المحاولات.
آخر خطأ آمن.
وقت الإنشاء.
وقت التنفيذ.
وقت الفشل.
المزود بشكل داخلي فقط إذا كانت الصلاحية تسمح.

إجراءات الإدارة:

Retry.
Cancel إذا كان ذلك آمنًا.
Regenerate Report.
Open Incident.
View safe diagnostic metadata.

لا تعرض:

API Keys.
Secrets.
Chain of Thought.
Prompt داخلي كامل للمستخدمين غير التقنيين.
Transcript كامل داخل Logs.

يجب منع إنشاء أكثر من تقرير نشط لنفس الجلسة دون سياسة.

المرحلة الثانية عشرة — إدارة المحتوى الأكاديمي

أنشئ أو حدّث:

/admin/content/topics
/admin/content/questions
/admin/content/vocabulary
/admin/content/homework-templates
/admin/content/placement

الإدارة تستطيع:

إنشاء Topic.
تعديل Topic.
تعطيل Topic.
ترتيب المحتوى.
إدارة الأسئلة.
إدارة المفردات.
إدارة قوالب الواجب.
إدارة الأسئلة الثابتة لاختبار Placement.

قواعد Placement:

الأسئلة ثابتة.
AI لا يعدل الأسئلة.
AI لا يعيد ترتيب الأسئلة دون سياسة.
كل إصدار من الأسئلة يجب أن يكون Versioned.
المحاولات التاريخية ترتبط بنسخة الأسئلة التي استخدمتها.
المرحلة الثالثة عشرة — الإشعارات

أنشئ:

/admin/notifications
/admin/notification-templates

اعرض:

القناة.
المستلم.
النوع.
الحالة.
وقت الإرسال.
سبب الفشل.
عدد المحاولات.

القنوات:

Email
In-app
SMS Future
Push Future

أنواع مهمة:

Payment submitted.
Payment approved.
Payment rejected.
Subscription activated.
Booking confirmed.
Booking cancelled.
Booking rescheduled.
Session reminder.
Instructor late.
Student no-show.
AI Report ready.
Subscription expiring.

الإدارة تستطيع إعادة محاولة الإشعار الفاشل وفق سياسة.

المرحلة الرابعة عشرة — التقارير والتحليلات

أنشئ أو حدّث:

/admin/analytics

قسمها إلى:

Business Analytics
الإيرادات.
المدفوعات.
الاشتراكات النشطة.
التجديد.
متوسط الإيراد لكل طالب.
خطط الاشتراك الأكثر استخدامًا.
Operational Analytics
الجلسات اليومية.
معدل الإلغاء.
معدل No-show.
معدل الحضور.
تأخر المدرسين.
المشكلات التشغيلية.
زمن حل المشكلة.
Academic Analytics
إكمال Placement.
توزيع مستويات CEFR.
عدد الجلسات لكل طالب.
الواجبات.
التقدم العام.
تقارير الجلسات المكتملة.
Instructor Analytics
ساعات التدريس.
عدد الجلسات.
الحضور.
الإلغاءات.
No-show.
اكتمال الملاحظات.

لا تستخدم إحصاءات مضللة أو بيانات غير موثوقة.

اعرض تعريف كل Metric وطريقة حسابه.

المرحلة الخامسة عشرة — صحة النظام والمزودين

أنشئ:

/admin/platform/health

اعرض الحالة التشغيلية لـ:

API.
Database.
Redis.
Celery.
Email provider.
Storage provider.
Video provider.
Transcript provider.
AI provider.
Recording provider.

الحالات:

Healthy
Degraded
Unavailable
Unknown

اعرض:

آخر فحص.
زمن الاستجابة.
نسبة الفشل.
الوظائف المعلقة.
التنبيه المرتبط.

لا تعتمد على قيم Hardcoded.

إذا كانت بعض المزودات Stubs، يجب وضع علامة واضحة:

STUB
NOT PRODUCTION READY
المرحلة السادسة عشرة — سجل التدقيق

أنشئ أو حدّث:

/admin/audit-logs

سجل العمليات الحساسة:

الموافقة على الدفع.
رفض الدفع.
تعديل الاشتراك.
تعديل الرصيد.
تعليق حساب.
إعادة جدولة جلسة.
إلغاء جلسة.
تغيير صلاحية.
إعادة تقرير AI.
Override لنتيجة Placement.
تعديل خطة.
إدارة Admin آخر.

كل سجل يحتوي على:

Actor.
Action.
Target.
Previous State.
New State.
Reason.
Timestamp.
Correlation ID.
IP إذا كانت السياسة تسمح.
Device metadata وفق الخصوصية.

لا تسمح بتعديل Audit Logs من الواجهة.

المرحلة السابعة عشرة — إدارة المسؤولين والصلاحيات

أنشئ:

/admin/admin-users
/admin/roles

الإجراءات:

دعوة مسؤول.
تحديد الدور.
إضافة صلاحيات.
إزالة صلاحيات.
تعليق المسؤول.
إلغاء الوصول.
مراجعة آخر تسجيل دخول.
مراجعة العمليات الحساسة.

قواعد:

لا يسمح للمسؤول بإزالة آخر Super Admin.
لا يسمح للمستخدم بمنح صلاحيات أعلى من صلاحياته.
الإجراءات شديدة الحساسية تحتاج إعادة مصادقة أو تأكيدًا إضافيًا.
يفضل دعم MFA لحسابات الإدارة.
المرحلة الثامنة عشرة — الإعدادات العامة

أنشئ:

/admin/settings

الإعدادات الممكنة:

اسم المنصة.
العملة الأساسية.
المنطقة الزمنية.
نافذة الإلغاء.
سياسة استرداد الرصيد.
وقت السماح بالدخول.
سياسة No-show.
إعدادات الإشعارات.
مدة الاشتراك.
مدة الجلسة.
إعدادات Placement attempts.
Feature Flags.

لا تعرض أسرار المزودين مباشرة.

الإعدادات الحساسة يجب أن تأتي من Environment أو Secret Manager.

كل تغيير في إعدادات العمل يسجل في Audit Log.

المرحلة التاسعة عشرة — دعم الطلاب والمدرسين

أنشئ أو حدّث:

/admin/support
/admin/incidents

الحالات:

Open
In Progress
Waiting for Student
Waiting for Instructor
Resolved
Closed
Escalated

يجب دعم ربط المشكلة بـ:

Student.
Instructor.
Payment.
Booking.
Session.
Subscription.
AI Job.

اعرض Timeline موحدًا للمشكلة.

لا تحوّل نظام الدعم إلى ملاحظات غير منظمة.

المرحلة العشرون — نهاية اليوم

أنشئ مساحة أو تقريرًا بعنوان:

/admin/operations/end-of-day

اعرض:

إيرادات اليوم.
المدفوعات المعتمدة.
المدفوعات المعلقة.
جلسات اليوم.
الجلسات المكتملة.
الجلسات الملغاة.
حالات No-show.
تقارير AI الفاشلة.
الإشعارات الفاشلة.
المشكلات المفتوحة.
الاشتراكات التي لم تتفعل.
مهام تحتاج متابعة غدًا.

يجب أن يستطيع المسؤول معرفة:

هل انتهى اليوم دون مشكلات معلقة حرجة؟

المرحلة الحادية والعشرون — السيناريوهات البديلة والاستثنائية

يجب تنفيذ واختبار السيناريوهات التالية:

دفع صحيح
Payment Submitted
→ Admin Reviews
→ Approves
→ Subscription Activated
→ Credits Allocated
→ Student Notified
دفع مرفوض
Admin Reviews
→ Rejects with Reason
→ No Subscription Created
→ Student Notified
→ Audit Log Created
ضغط الموافقة مرتين
لا ينشأ اشتراك مكرر.
لا يتكرر الرصيد.
يعاد نفس الناتج الآمن.
إيصال مكرر
يكتشف أو يعلّم للمراجعة.
لا يتم التفعيل تلقائيًا.
جلسة فشلت
يظهر تنبيه.
تبقى البيانات محفوظة.
يستطيع المسؤول فتح Incident.
لا يتم تغيير الحضور دون دليل.
المدرس لم يحضر
تسجل الحالة.
يطبق نظام الإشعارات.
يحدد أثر الرصيد وفق السياسة.
يمكن إعادة الجدولة.
الطالب لم يحضر
تسجل الحالة.
تطبق قاعدة الرصيد.
ينشأ Audit Log.
تقرير AI فشل
الجلسة تبقى Completed.
المهمة تصبح Failed.
يمكن Retry.
لا ينشأ تقرير مكرر.
تعليق طالب لديه جلسات قادمة
يظهر تحذير.
يحدد النظام أثر التعليق.
لا تترك حجوزات يتيمة.
تعليق مدرس لديه جلسات مستقبلية
يمنع التعليق المباشر أو يطلب معالجة الجلسات.
يمكن نقل أو إلغاء الحجوزات وفق السياسة.
تعديل خطة مستخدمة
لا تتغير الاشتراكات التاريخية.
ينشأ إصدار أو يسجل التعديل.
محاولة وصول غير مصرح بها
ترجع 403.
لا تكشف البيانات.
تسجل المحاولة الحساسة.
فشل Notification
لا يرجع العملية الأساسية للخلف إذا كانت مكتملة.
تدخل الرسالة قائمة Retry.
فشل جزئي في الموافقة على الدفع
يجب Rollback للمعاملة.
لا يبقى Payment Approved دون Subscription صحيحة.
المرحلة الثانية والعشرون — Backend APIs

افحص الموجود أولًا، ثم أنشئ الناقص فقط.

النطاق المتوقع:

GET /api/v1/admin/dashboard

GET /api/v1/admin/alerts
PATCH /api/v1/admin/alerts/{id}

GET /api/v1/admin/payments
GET /api/v1/admin/payments/{id}
POST /api/v1/admin/payments/{id}/approve
POST /api/v1/admin/payments/{id}/reject
POST /api/v1/admin/payments/{id}/request-clarification

GET /api/v1/admin/students
GET /api/v1/admin/students/{id}
PATCH /api/v1/admin/students/{id}/status
POST /api/v1/admin/students/{id}/credits-adjustment

GET /api/v1/admin/instructors
GET /api/v1/admin/instructors/{id}
POST /api/v1/admin/instructors/invite
PATCH /api/v1/admin/instructors/{id}/status

GET /api/v1/admin/bookings
GET /api/v1/admin/bookings/{id}
POST /api/v1/admin/bookings/{id}/cancel
POST /api/v1/admin/bookings/{id}/reschedule

GET /api/v1/admin/sessions
GET /api/v1/admin/sessions/{id}
POST /api/v1/admin/sessions/{id}/resolve
POST /api/v1/admin/sessions/{id}/mark-no-show

GET /api/v1/admin/subscriptions
GET /api/v1/admin/subscriptions/{id}
PATCH /api/v1/admin/subscriptions/{id}

GET /api/v1/admin/plans
POST /api/v1/admin/plans
PATCH /api/v1/admin/plans/{id}

GET /api/v1/admin/placements
GET /api/v1/admin/placements/{id}
POST /api/v1/admin/placements/{id}/retake
POST /api/v1/admin/placements/{id}/override

GET /api/v1/admin/ai-jobs
GET /api/v1/admin/ai-jobs/{id}
POST /api/v1/admin/ai-jobs/{id}/retry

GET /api/v1/admin/notifications
POST /api/v1/admin/notifications/{id}/retry

GET /api/v1/admin/analytics

GET /api/v1/admin/platform/health

GET /api/v1/admin/audit-logs

GET /api/v1/admin/admin-users
POST /api/v1/admin/admin-users/invite
PATCH /api/v1/admin/admin-users/{id}

GET /api/v1/admin/settings
PATCH /api/v1/admin/settings

لا تنشئ Endpoint جديدًا إذا كان Endpoint موجود يؤدي الوظيفة نفسها.

المرحلة الثالثة والعشرون — قاعدة البيانات

افحص النماذج الحالية أولًا.

قد يحتاج النظام إلى:

AdminProfile
Role
Permission
Payment
PaymentReview
Subscription
CreditAdjustment
Booking
Session
SessionIncident
Alert
AIJob
NotificationDelivery
SupportTicket
AuditLog
PlatformHealthCheck
SystemSetting
FeatureFlag

متطلبات قاعدة البيانات:

Foreign keys صحيحة.
Constraints.
Unique constraints.
Indexes.
Timestamps.
Actor attribution.
Status fields موحدة.
عدم تعديل Migrations تاريخية منشورة.
إنشاء Migrations جديدة قابلة للمراجعة.
حماية السجلات المالية والتدقيقية من الحذف العشوائي.
المرحلة الرابعة والعشرون — Frontend Architecture

استخدم:

Feature-based modules.
Typed API client.
TanStack Query.
Route guards.
Permission-aware components.
Reusable tables.
Server-side pagination.
Filtering and sorting.
Reusable status badges.
Confirmation dialogs.
Optimistic updates فقط عندما تكون آمنة.
Centralized error handling.
Empty, loading and error states.

لا تستخدم:

Mock Data في صفحات الإنتاج.
Hardcoded currency.
Hardcoded roles.
Hardcoded statuses موزعة.
Business logic داخل JSX.
Fetch مباشر داخل كل Component.
إخفاء الأزرار كبديل للصلاحيات.
تحميل جميع البيانات دفعة واحدة دون Pagination.
المرحلة الخامسة والعشرون — الأمن

تحقق من:

JWT أو نظام المصادقة الحالي.
Role-based permissions.
Object-level permissions.
حماية Admin routes.
MFA للإدارة إن أمكن.
Re-authentication للعمليات الحساسة.
Rate limiting.
CSRF حسب أسلوب المصادقة.
Input validation.
File upload validation.
Receipt access authorization.
منع IDOR.
حماية PII.
Encryption in transit.
Secure secrets.
Audit logging.
Session expiration.
منع رفع ملفات خبيثة.
عدم كشف Stack traces أو provider secrets.

اختبر أن:

الطالب لا يستطيع اعتماد دفعة.
المدرس لا يستطيع فتح بيانات مالية.
Operations Admin لا يستطيع إدارة Super Admin.
Finance Admin لا يستطيع تعديل نتائج Placement.
Read-only Admin لا يستطيع تنفيذ Write Actions.
المرحلة السادسة والعشرون — Observability

أضف أو تحقق من:

Structured logs.
Correlation IDs.
Admin ID.
Payment ID.
Student ID.
Instructor ID.
Booking ID.
Session ID.
Job ID.
Metrics.
Error tracking.
Alerts.
Background job monitoring.

أحداث مهمة:

AdminLoggedIn
PaymentReviewed
PaymentApproved
PaymentRejected
SubscriptionActivated
CreditsAdjusted
StudentSuspended
InstructorInvited
InstructorSuspended
BookingCancelled
BookingRescheduled
SessionIncidentOpened
SessionNoShowMarked
AIJobRetried
PlacementRetakeGranted
PlanChanged
AdminPermissionChanged
SettingsChanged

لا تسجل:

كلمات المرور.
Tokens.
API Keys.
محتوى الإيصالات في Logs.
Transcript كامل.
بيانات حساسة غير لازمة.
المرحلة السابعة والعشرون — الاختبارات
Backend Unit Tests

اختبر:

Payment approval transaction.
Duplicate approval prevention.
Subscription activation.
Credit allocation.
Credit adjustment.
Role permissions.
Session state changes.
No-show rules.
AI retry.
Placement retake policy.
Audit log creation.
Backend Integration Tests

اختبر:

Dashboard API.
Payment review.
Student details.
Instructor management.
Session monitoring.
Booking cancellation.
Booking rescheduling.
Subscription management.
Plan updates.
AI jobs.
Platform health.
Audit logs.
Frontend Tests

اختبر:

Dashboard cards.
Alert list.
Payment review dialog.
Student page.
Instructor page.
Session details.
Permissions.
Empty states.
Loading states.
API failure states.
E2E Tests

أنشئ سيناريو حقيقيًا:

Login as Admin

↓

Open Operations Dashboard

↓

Open Pending Payment

↓

Review Receipt

↓

Approve Payment

↓

Verify Subscription Activated

↓

Verify Credits Allocated

↓

Verify Student Notification

↓

Open Student Profile

↓

Verify Timeline

↓

Open Today's Sessions

↓

Open Session Incident

↓

Resolve Incident

↓

Review Audit Log

أضف E2E للسيناريوهات التالية:

Reject payment.
Duplicate approval.
Suspend student.
Suspend instructor with future bookings.
Cancel session.
Reschedule booking.
Mark student no-show.
Retry failed AI report.
Unauthorized role access.
Read-only admin write attempt.
Settings change with Audit Log.

يجب ألا يعتمد إثبات التكامل بالكامل على MSW أو Mock APIs.

المرحلة الثامنة والعشرون — معايير القبول

لا تعتبر رحلة الإدارة مكتملة إلا إذا:

Operations Dashboard
يعرض بيانات حقيقية.
يعرض تنبيهات تحتاج إجراءً.
يوفر روابط تشغيلية للكيانات.
لا يعتمد على Mock Data.
Payments
يمكن المراجعة والموافقة والرفض.
الموافقة Transactional.
لا يوجد تكرار.
يتفعل الاشتراك.
يخصص الرصيد.
يصل الإشعار.
ينشأ Audit Log.
Students
يمكن فتح ملف الطالب كاملًا.
تظهر الرحلة الأكاديمية والمالية والتشغيلية.
الإجراءات الحساسة محمية.
Instructors
يمكن إرسال الدعوات.
يمكن مراجعة Availability.
يمكن معالجة التعليق والحجوزات القادمة.
Sessions
يمكن مراقبة الحالات.
يمكن حل المشكلات.
يمكن معالجة No-show والإلغاء وإعادة الجدولة.
AI Jobs
تظهر الحالات الحقيقية.
يمكن Retry بأمان.
لا توجد تقارير مكررة.
Security
تطبق الصلاحيات في Backend.
يمنع الوصول غير المصرح.
تسجل الإجراءات الحساسة.
Audit
كل إجراء حساس مسجل.
السجل غير قابل للتعديل من الواجهة.
Testing
Unit Tests تمر.
Integration Tests تمر.
E2E الحرجة تمر.
لا توجد اختبارات متخطاة دون تفسير.
لا توجد ادعاءات نجاح تعتمد على Mock فقط.
Definition of Done

لا تقل إن رحلة الإدارة مكتملة إلا إذا:

Backend مكتمل.
Frontend مكتمل.
Database migrations مكتملة.
APIs موثقة.
الصلاحيات مختبرة.
المسار الرئيسي يعمل End-to-End.
المسارات البديلة الحرجة تعمل.
السيناريوهات الاستثنائية تعمل.
المدفوعات لا تسبب تكرارًا.
سجل التدقيق يعمل.
التنبيهات مرتبطة ببيانات حقيقية.
لا توجد Mock Data في مسار الإنتاج.
لا تقدم Stub Provider كتجهيز إنتاجي.
لا توجد أخطاء Console حرجة.
لا توجد أخطاء Backend غير معالجة.
يوجد دليل اختبارات وصور ونتائج E2E.
التقرير النهائي المطلوب

بعد التنفيذ، قدم التقرير بهذا الشكل:

1. Executive Summary

ما الذي تم تنفيذه فعليًا؟

2. Initial State

ما الذي كان موجودًا قبل التنفيذ؟

3. Files Changed

اذكر جميع الملفات وسبب تعديلها.

4. Database Changes

اذكر النماذج والـ Migrations والقيود.

5. APIs

| Method | Endpoint | Permission | Purpose | Status |

6. Frontend Screens

| Route | Screen | Data Source | Status |

7. Permissions Matrix

| Role | Action | Allowed | Tested |

8. Business Rules

اذكر القواعد التي تم تنفيذها.

9. Tests

| Test Type | Command | Passed | Failed | Skipped |

10. Scenario Results

| Scenario | Result | Evidence |

استخدم فقط:

PASS
PARTIAL
FAIL
NOT TESTED
11. Mock and Stub Inventory

اذكر كل Mock أو Stub بقي.

12. Known Gaps

اذكر كل جزء غير مكتمل.

13. Release Blockers

اذكر المشكلات التي تمنع إطلاق الإدارة إنتاجيًا.

14. Security Findings

اذكر نتائج اختبار الصلاحيات والحماية.

15. Evidence

أرفق:

Screenshots.
URLs.
API examples.
Test output.
Logs غير حساسة.
E2E evidence.
16. Final Decision

اختر قرارًا واحدًا فقط:

GO
GO WITH CONDITIONS
NO-GO

لا تستخدم GO إذا لم تثبت رحلة الإدارة End-to-End.


## ترتيب التنفيذ المقترح

لا ترسل هذا البرومبت وتطلب تنفيذ كل شيء دفعة واحدة. قسّمه إلى مراحل رقابية:

```text
المرحلة 1: Current-State Audit + Permissions
المرحلة 2: Operations Dashboard + Alerts
المرحلة 3: Payments + Subscription Activation
المرحلة 4: Student Administration
المرحلة 5: Instructor Administration
المرحلة 6: Bookings + Sessions + Incidents
المرحلة 7: Placement + AI Jobs + Notifications
المرحلة 8: Plans + Content + Settings
المرحلة 9: Analytics + Platform Health + Audit Logs
المرحلة 10: Security + E2E + Final Release Audit

بعد كل مرحلة، يجب تقديم تقرير تنفيذ، ثم يكون القرار فقط: GO أو GO مع شروط أو NO-GO قبل الانتقال إلى المرحلة التالية.