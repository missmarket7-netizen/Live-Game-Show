# Qaddaha Studio Question Sync Implementation Plan

> **For agentic workers:** تنفيذ مرحلي مع مراجعة مستقلة قبل الانتقال للمرحلة التالية؛ خطوات التحقق بصيغة checkbox.

**الهدف:** نقل تغييرات استديو قدها وPoC ماروو المطلوبة إلى فرع مبني على `origin/main`، والتحقق أن السؤال يأتي من بنك البرنامج عبر اللعبة ثم اللقطة المنقّاة فقط، دون تعديل مسارات اللعبة الأساسية أو تسريب الإجابة.

**المعمارية:** بدأ الفرع من SHA `f846b5241107800b6ec51df7f314eabd4fc17a9c`، ثم جرى تحديثه بعد تقدم `origin/main` وإعادة تأسيسه فوق `88682893262a9ef74f16801cea5a363d46a8c7a0`. يُنقل commit PoC والتغييرات المحلية ذات الصلة فقط؛ تبقى `/` و`/output` و`/studio` والمسارات القديمة عاملة، ويستهلك الاستديو الجديد `GET /api/output-snapshot` دون قراءة بنك الأسئلة أو إنشاء جولة ثانية. الكتابة إلى حالة إعدادات الاستديو تبقى محمية بمصادقة المشغّل وحدّ المعدل.

**التقنيات:** Git worktree/branch، Node.js، Express، HTML/CSS/JavaScript، اختبارات `node:test` و`npm run test:quality`.

**المواصفة:** `/home/ubuntu/upload/pasted_content.txt`؛ الخطة السابقة: `docs/superpowers/plans/2026-11-23-qaddaha-virtual-studio.md`.

## Global Constraints

- لا تكسر `public/app.js` منطق الجولة الأساسي.
- الاستديو لا يستدعي `/api/questions` أو `/api/generate` بنفسه لعرض السؤال.
- مصدر السؤال والنتيجة = لوحة اللعبة → snapshot منقّى → `/api/output-snapshot` → `/studio` و`/output`.
- الإجابة تبقى مخفية في اللقطة حتى الكشف أو انتهاء المؤقت المتوقف.
- لا أسرار في `public/` أو Git؛ لا force-push إلى `main`.
- لا دمج إلى `main` ولا نشر إنتاجي دون اجتياز الفحوص وتحديد المالك مزود الاستضافة واسم الخدمة.
- لا تغييرات في قواعد النقاط أو المؤقت أو كشف الإجابة أو SSE أو حماية المشغّل أو no-repeat/cycle state.
- تُرحّل الملفات المساعدة فقط إذا كانت موجودة ومشاراً إليها، ولا تُنشأ مراجع إلى ملفات مفقودة.

## Review Focus

1. حالة بلا جولة/بلا سؤال تبقى انتظارًا واضحًا حتى ينشر التطبيق لقطة صالحة؛ اختبر 204 ثم بدء الجولة من البنك.
2. لا تظهر `answer` أو `correctIndex` أو `explanation` في أي لقطة أو استجابة عامة قبل الكشف؛ اختبر قبل وبعد الكشف وانتهاء المؤقت.
3. أسئلة الاختيارات والأعلام والصور تستخدم بنك اللعبة نفسه ووسائط محلية موجودة فقط؛ اختبر كل أنواع البنوك ومراجع الأصول.
4. `/studio-v2` لا يستدعي مسارات الأسئلة، و`/studio-control-v2` لا يكتب دون مفتاح المشغّل؛ اختبر مسارات القراءة والكتابة والـrate-limit.
5. تظل مسارات اللعبة القديمة و`cycle_state` وSSE سليمة بعد نقل التغييرات؛ شغّل الجودة على فرع الأساس ثم على الفرع النهائي، ولا تُخْفِ أي فشل بيئي.

---

### Task 1: تثبيت خط الأساس ونقل الملفات على فرع حديث

**Files:**
- Branch: `feature/qaddaha-studio-v2-sync` من `origin/main` عند SHA أعلاه.
- Carry: ملفات commit `8699489` فقط عبر cherry-pick، مع التغييرات المحلية ذات الصلة في `world-challenges-live/`.
- Preserve: شجرة العمل الأصلية `/home/ubuntu/projects/live-game-show` وجميع التغييرات غير الملتزمة فيها.

**Interfaces:** يظل PoC محليًا في `maroo-poc/` ولا يدخل ضمن صفحة الإنتاج؛ مخرج الأسئلة يظل تابعًا للعبة الحالية.

- [x] تثبيت قائمة الملفات المحلية المراد نقلها ومقارنتها مع `origin/main`؛ استبعاد أي تعديلات غير مرتبطة دون حذفها من الشجرة الأصلية.
- [x] cherry-pick لـ`8699489` في الفرع الجديد، ونقل ملفات الاستديو الجديدة/التعديلات المعنية إلى worktree المزامنة.
- [x] مراجعة diff نهائيًا للتأكد من بقاء cycle/no-repeat والمسارات القديمة وألا توجد ملفات وسيطة مفقودة.

### Task 2: عقد لقطة السؤال واستهلاك الاستديو

**Files:**
- Modify: `world-challenges-live/public/output-snapshot.js`
- Modify: `world-challenges-live/public/app.js`
- Create/modify: `world-challenges-live/public/studio-v2.html`, `studio-v2.css`, `studio-v2.js`, `studio-moment.js`
- Test: `world-challenges-live/scripts/test-output-snapshot.mjs`

**Interfaces:** `WCQOutputSnapshot.create(state, answerResolver)` ينشئ snapshot من حالة اللعبة؛ `normalize(raw)` يسمح فقط بالحقول المنقّاة والوسائط المحلية؛ المستهلك يقرأ `/api/output-snapshot` فقط.

- [x] تثبيت اختبارات `choice`, `free`, `flag`, `image-guess`، انتظار عدم وجود جولة، وإخفاء الحل قبل الكشف.
- [x] تحقق أحادي واختبار HTTP/Chromium أن السؤال من البنك يمر من لقطة اللعبة إلى DOM الاستديو، بلا answer قبل الكشف؛ زمن HTTP-to-DOM ≤2s.
- [x] تحقق أن الكشف أو انتهاء مؤقت متوقف يُظهر answer وفق السلوك القائم.
- [x] افحص آليًا أن ملفات الاستديو لا تتضمن طلبًا إلى `/api/questions` أو `/api/generate`.

### Task 3: حالة إعدادات الاستديو وحواجز الكتابة

**Files:**
- Create: `world-challenges-live/public/studio-v2-state.js`, `studio-control-v2.html`, `studio-control-v2.css`, `studio-control-v2.js`
- Modify: `world-challenges-live/server/server.js`, `server/operator-rate-limit.js`, `public/index.html`, `public/manus-routes.json`, `public/sw.js`, `package.json`
- Test: `scripts/test-studio-v2-state.mjs`, `scripts/test-operator-rate-limit.mjs`, `scripts/test-operator-auth-http.mjs`

**Interfaces:** `GET /api/studio-v2-state` قراءة عامة منقّاة؛ `POST /api/studio-v2-state` يمر عبر `protectOperatorApiWrites` و`operatorApiWriteRateLimiter`، ويطبع الحالة بواسطة `WCQStudioV2State.normalize`.

- [x] اختبر أن الكتابة ترفض الطلب بلا مفتاح/بمفتاح خاطئ/بعد حد المعدل، وأن القراءة لا تكشف مفتاحًا أو بيانات داخلية.
- [x] اختبر أن مخرج v2 لا يغير حالة اللعبة ولا يزيل أو يعيد تسمية أي مسار قديم.
- [x] تحقق من تحميل سكربتات العقد قبل المستهلك وتحديث app shell ومطابقة مفتاح snapshot دون كسر cache الموجود.

### Task 4: تحقق بنك الصور والفحوص النهائية

**Files:**
- Modify: `world-challenges-live/scripts/validate-banks.mjs`
- Test: `scripts/test-studio-v2-layout.mjs`, `scripts/run-studio-v2-layout.mjs`, `scripts/test-studio-v2-browser.mjs`, `scripts/test-maroo-poc.mjs`، و`npm run test:quality`

- [x] تحقق أن كل مرجع بصري فعلي في بنوك الأسئلة محلي وموجود، وأن الوسائط الخارجية أو traversal مرفوضة.
- [x] شغّل اختبار عقد PoC والفحوص الصياغية والتخطيط و`npm run test:quality` بالكامل؛ وثّق exit code والاختبارات التي نجحت أو فشلت، دون ادعاء نجاح كامل عند تعثر تنظيف Chromium.
- [x] مراجعة مستقلة لمسار بنك→لعبة→snapshot→استديو وحماية الأسرار قبل commit/PR.
- [x] أصلح سباق تنظيف Chromium؛ اختبار التخطيط نجح خمس مرات متتالية ثم اجتازت الجودة كاملة.
- [x] واءمت اختبار الصوت مع تنفيذ `origin/main` الحالي (`active` و`stopActive`) بعد تحديث الصوت، دون تعديل ملف تشغيل الصوت.
- [x] رتبت اللقطات باستخدام `sourceId` عشوائي و`sequence` متزايد؛ يقبل الاستديو تحديث الناشر نفسه فقط عند تعادل `sentAt` وتسلسل أعلى، ويرفض إعادة التسلسل المساوي والأقل والناشر المختلف؛ اختبار Chromium يغطي الحالات.
- [x] بعد الإصلاح، اجتازت `npm run test:quality` كاملة واختبار `node scripts/test-maroo-poc.mjs` وفحوص الصياغة و`git diff --check`.

### Task 5: تسليم Git مشروط

- [x] إنشاء commit واضح `f572565cc908c698100e33a9640e06dd963077b8` على `feature/qaddaha-studio-v2-sync`.
- [x] دفع الفرع والتحقق من تطابق SHA البعيد؛ فتح PR #1 إلى `main` مع SHA الأساس ونطاق التغييرات ونتائج الاختبارات والحدود التشغيلية: https://github.com/missmarket7-netizen/Live-Game-Show/pull/1.
- [x] إبقاء PR مفتوحًا دون دمج أو نشر إنتاجي؛ يتطلب النشر تحديد مزود الاستضافة واسم الخدمة من المالك.
