# تدقيق الأصول والصوت والنشر والتوافق

- **المستودع المفحوص:** `/home/ubuntu/projects/Live-Game-Show-repo/world-challenges-live`
- **نطاق التدقيق:** الأصول، الصوت، النشر، والتوافق.
- **تاريخ الفحص:** 2026-11-05
- **سياسة التغيير:** لم تُعدّل أي ملفات إنتاج. شملت الإجراءات قراءة الملفات، فحصًا ساكنًا، `node --check`، `npm audit`، وتشغيلًا مؤقتًا للخادم على منفذ محلي.

## الملخص التنفيذي

التطبيق يبدأ محليًا ويستجيب لـ `/api/health` ويحمّل 1229 سؤالًا، كما أن ملفات الصوت والصور الموجودة فعليًا قابلة للوصول عبر Express. لكن توجد فجوات مؤكدة في حزمة النشر والتوافق: إعداد Netlify يوجّه `/api/*` إلى Function غير موجودة، وملف Vercel لا يعرّف بوضوح إعادة كتابة لطلبات الملفات الثابتة غير الموجودة، بينما fallback العام في Express يعيد `index.html` بحالة 200 حتى عند طلب أصل مفقود؛ وهذا يخفي أخطاء الأصول ويؤدي إلى محتوى HTML بدل PNG. ملف manifest يعلن أيقونات غير موجودة، وservice worker لا يَخزّن معظم ملفات JS/CSS/الصوت ولا يستخدم استراتيجية تحديث/فشل مناسبة.

يوجد أيضًا خطر أمني مؤكد في سلسلة التبعيات، وملف `.env` متتبع في Git ويحتوي قيمًا غير فارغة لمفاتيح API. لا أعرض القيم السرية هنا. التخزين الدائم غير مفعّل في بيئة الفحص، والخادم نفسه يحذر من فقدان حالة دورة الأسئلة عند كل deploy إذا لم يُضبط Turso أو Volume.

## المشكلات المؤكدة

### 1. إعداد Netlify غير متكامل مع المشروع — شدة عالية

`netlify.toml` يحدد `publish = "public"` وredirect من `/api/*` إلى `/.netlify/functions/api/:splat`، لكن لا يوجد مجلد `netlify/functions` ولا ملف Function في المستودع. كما أن `package.json` لا يحتوي build أو Netlify Function entrypoint. نتيجة ذلك أن نشر Netlify وفق هذا الملف لا يملك backend API المقصود (`/api/questions`, `/api/generate`, `/api/health`)، ويخالف تعليمات `DEPLOY.md` التي تصف Netlify بأنه frontend فقط.

**الدليل:** `netlify.toml:1-13`; قائمة الملفات لا تحتوي `netlify/functions`; المسارات الفعلية في `server/server.js:929-1208` موجودة داخل Express فقط.

### 2. أصول معلنة أو مستخدمة غير موجودة فعليًا — شدة متوسطة

الملف `public/manifest.json` يشير إلى `/icon-192.png` و`/icon-512.png`، ولا يوجد أي من الملفين تحت `public/`. كذلك يستخدم الكود `/images/gift-whale.png` في `app.js:1363` و`ui-dom-patch.js:95` كصورة أساسية لعجلة/هدية، ولا يوجد هذا الملف؛ يوجد فقط `/images/gift-wheel.png` كـ fallback. كما أن `public/index.html` يعلن favicon بصيغة PNG `/images/logo.png` (وهو موجود)، لذلك المشكلة محصورة بالأيقونات المعلنة وgift-whale.

**الدليل:** `find public -type f`؛ `manifest.json:10-13`; `public/app.js:1363`; `public/ui-dom-patch.js:95`. فحص المطابقة البرمجي أظهر `MISSING images/gift-whale.png` و`MISSING icon-192.png` (وبالتالي icon-512 أيضًا عند فحص الملفين).

### 3. fallback العام يخفي الأصول المفقودة بحالة HTTP 200 — شدة متوسطة

في `server/server.js:1215-1230` يتم تركيب `express.static` ثم fallback يرسل `INDEX_FILE` لأي GET غير API/live. لذلك طلب أصل غير موجود مثل `/images/gift-whale.png` أو `/icon-192.png` يرجع HTML التطبيق بحالة 200 بدل 404. هذا يجعل المتصفح يفشل في تحميل الصورة، ويجعل CDN/المتصفح أو اختبارات الصحة تعتقد أن الأصل موجود. في التشغيل المحلي، probing أعاد 200 لهذه المسارات رغم عدم وجود الملفات؛ وبالاستدلال من مسار fallback، المحتوى هو `index.html` وليس PNG.

### 4. service worker غير مكتمل وقد يسبب stale assets أو تجربة offline مكسورة — شدة متوسطة

`public/sw.js` يخزن ثمانية مسارات فقط (`/`, `/index.html`, `/style.css`, `/app.js`, `/manifest.json`, `/favicon.svg`) ولا يشمل ملفات JS الإضافية التي يحمّلها HTML (`flag-renderer.js`, `arena-extras.js`, `frame-clean.js`, `captain-sounds.js`, `flag-view.js`) ولا الصور أو الصوت. اسم الكاش ثابت `wcq-v1` ولا يوجد listener لـ `activate` لحذف الإصدارات القديمة، ولا معالجة رفض `cache.addAll` أو fallback offline لطلبات GET. بما أن HTML يطلب ملفات versioned query strings مثل `style.css?v=105` و`app.js?v=102`، فإن القائمة المخزنة لا تطابق دائمًا هذه الطلبات. النتيجة المحتملة هي شاشة جزئية أو صوت/صور مفقودة عند offline أو بعد deploy.

**الدليل:** `public/sw.js:1-19`; `public/index.html:163-168`.

### 5. ثغرات مؤكدة في شجرة التبعيات — شدة حرجة/عالية

`npm audit --omit=dev` وجد 4 ثغرات: `proxy-addr@2.0.7` حرجة، `body-parser@1.20.6` عالية، `follow-redirects@1.16.1` عالية، و`qs@6.15.3` متوسطة. الإصدارات المتأثرة موثقة مباشرة في `package-lock.json`؛ `express` مثبت على `4.22.2` لكن dependency tree ما زال يسحب الإصدارات المتأثرة. هذا ليس مجرد احتمال نظري في حالة proxy-addr/body-parser لأن التطبيق يعرض خادم Express مباشرة ويقبل JSON حتى 2MB.

**الدليل:** مخرجات `npm audit --omit=dev --json`: `proxy-addr` CVSS 9.1، `body-parser` CVSS 7.5، `follow-redirects` CVSS 5.9، و`qs` advisories متعددة؛ الإصدارات: `proxy-addr 2.0.7`, `body-parser 1.20.6`, `follow-redirects 1.16.1`, `qs 6.15.3`.

### 6. سر API متتبع في Git — شدة حرجة

يوجد `.env` متتبع (`git ls-files` يعيده) ويحتوي قيمًا غير فارغة لـ `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, و`GROQ_API_KEY`. لا توجد `.gitignore` في جذر المشروع. حتى دون عرض القيم أو إثبات صلاحيتها، وجود ملف secrets متتبع في تاريخ المستودع يمثل كشفًا مؤكدًا ويستوجب تدوير المفاتيح وإزالتها من التاريخ إن كانت حقيقية. تشغيل `npm start` يقرأ هذه الأسرار عبر `dotenv/config`.

**الدليل:** `git ls-files -s .env .env.example`؛ `.env` متتبع وحجمه 78 بايت؛ فحص المتغيرات أظهر الحقول الثلاثة `NONEMPTY`؛ لا يوجد `.gitignore`.

## المخاطر المحتملة والفجوات

1. **فقدان حالة عدم التكرار بعد deploy:** التشغيل المحلي أكد `persistent:false`, `turso:false`, `volume:false`، والخادم أصدر تحذيرًا صريحًا. Render يعرّف `PORT=10000` لكنه لا يعرّف Turso أو disk، وRailway يعلن Volume في الكود فقط دون تكوين Volume في `railway.json`. قد تُفقد `cycle_state` وgenerated questions عند إعادة التشغيل/النشر.
2. **عدم توافق تعليمات النشر:** `DEPLOY.md` يصف Vercel وNetlify كـ frontend فقط، بينما `vercel.json` يبني `server/server.js` عبر `@vercel/node` ويعيد `/api` إليه. هذا التناقض قد يؤدي لاختيار منصة/توقعات خاطئة، خصوصًا مع اعتماد الخادم على ملفات محلية وعمليات `fs` وبدء listener.
3. **مخاطر الصوت في المتصفحات:** `captain-sounds.js` ينشئ `new Audio('/sounds/'+key+'.mp3')` بعد click، وهو مناسب غالبًا لسياسة autoplay، لكنه لا يضع `crossOrigin` أو preload ولا يتحقق من `play()` قبل بدء مؤقت 35 ثانية. عند فشل التحميل أو حظر التشغيل يوجد fallback جزئي، لكن لا توجد مراقبة أو واجهة للمضيف تفيد بأن الصوت فشل. `app.js` يستخدم Web Audio مع preload تسلسلي (`reduce`)، ما قد يسبب تأخيرًا واضحًا قبل أول مؤثر على الشبكات البطيئة.
4. **إهدار/بطء تحميل الأصول:** يوجد عدد كبير من flags والصور والصوت، لكن لا توجد بصمات/ضغط/headers مخصصة في إعداد Express أو إعدادات المنصات. كما أن `sw.js` لا يقوم preload فعليًا لهذه الملفات. هذا قد يرفع زمن بدء اللايف واستهلاك الشبكة، خصوصًا على الهاتف.
5. **توافق SSE والمنصات الوسيطة:** `/live/events` يرسل SSE دون heartbeat دوري أو `X-Accel-Buffering: no`. بعض proxies قد تخزن/تقطع stream الخامل، و`clients` يحتفظ بالاتصالات حتى `close` فقط. لم يُثبت هذا كعطل في تشغيل محلي قصير.
6. **حماية endpoints:** لا تظهر middleware للمصادقة أو rate limiting أو CSRF على `/api/generate`, `/api/save-questions`, `/api/reset-cycle` أو endpoints live. قد يسمح النشر العام باستهلاك مفاتيح AI أو تغيير بنك الأسئلة/حالة الدورة. لم أجرِ اختبارًا هجوميًا.
7. **اختلاف cache-busting:** HTML يثبت query versions مختلفة لكل asset (`style.css?v=105`, `arena-extras.css?v=104`, scripts بإصدارات متعددة)، بينما service worker يخزن مسارات غير versioned فقط؛ يمكن أن تختلط نسخة HTML مع JS/CSS من cache.

## اختبارات نفذت ونتائجها

- `node --check public/*.js server/*.js`: نجح لكل الملفات المفحوصة، دون أخطاء syntax.
- تشغيل `PORT=18765 npm start` لمدة قصيرة: نجح؛ `/api/health` أعاد 200 و`status: ok` و`bankCount: 1229`.
- `/api/health` أكد عدم وجود Turso أو Railway volume في البيئة الحالية.
- فحص الأصول: ملفات الصوت الموجودة مثل `/sounds/nancy.mp3` و`/sounds/` الأساسية موجودة، لكن `gift-whale.png` وmanifest icons غير موجودة. probing عبر Express أعاد 200 للأصول المفقودة بسبب fallback، وليس بسبب وجودها.
- `npm audit --omit=dev`: 1 critical، 2 high، 1 moderate.
- لم تُعدّل ملفات الإنتاج؛ حالة Git أظهرت ملفات تقارير خارج المشروع كملفات غير متتبعة قبل كتابة هذا التقرير.

## التوصيات المرتبة

1. **فورًا:** تدوير كل مفاتيح API الموجودة في `.env`، إزالة `.env` من Git والتاريخ، إضافة `.gitignore` مناسب، واستخدام secrets للمنصة.
2. **فورًا:** ترقية/تثبيت dependency tree إلى إصدارات تعالج `proxy-addr`, `body-parser`, `follow-redirects`, و`qs`، ثم إعادة تشغيل `npm audit` واختبارات smoke.
3. **قبل نشر Netlify:** إما إزالة إعداد Netlify من خيارات النشر أو إضافة Function فعلية متوافقة؛ لا تترك redirect إلى Function غير موجودة. الأفضل لهذا التطبيق نشر Express على Railway/Render مع backend فعلي.
4. **إصلاح الأصول:** إضافة icon-192/icon-512 حقيقيين أو حذفهما من manifest، واستبدال `gift-whale.png` بمسار موجود أو إضافة الأصل المقصود. يجب جعل طلبات `/images`, `/sounds`, `/flags`, `/guess`, `/name` غير الموجودة ترجع 404 بدل إرسال index.html.
5. **تحسين service worker:** versioned cache names، `activate` cleanup، precache للقائمة الفعلية، استراتيجية network-first للـ HTML وstale-while-revalidate للأصول، ومعالجة فشل precache/offline.
6. **التخزين:** ربط Turso في Railway/Render عبر secrets أو إضافة persistent disk موثق ومختبر؛ ثم اختبار restart/deploy للحفاظ على cycle state وgenerated questions.
7. **التكامل والأمان:** إضافة rate limit/auth للمسارات التي تستهلك AI أو تغيّر الحالة، وتحديد CORS/headers وقيود حجم/مهلة upstream. أضف heartbeat وheaders مناسبة لـ SSE.
8. **الصوت والأداء:** preload انتقائي للأصوات الأساسية بعد gesture المستخدم، تسجيل فشل تحميل الصوت، إضافة `preload`/cache headers مناسبة، وقياس أول تشغيل على هاتف وشبكة بطيئة.
9. **التوثيق:** توحيد `DEPLOY.md` مع الملفات الفعلية، وإضافة smoke test آلي يفحص `manifest`، كل script tag، الأصول المشار إليها، `/api/health`، وSSE بعد كل build/deploy.

## التقييم النهائي

**الشدة الإجمالية: حرجة (Critical)** بسبب الأسرار المتتبعة وثغرة `proxy-addr` الحرجة، مع مشكلات نشر وأصول تؤثر مباشرة على قابلية التشغيل. التطبيق ليس فاشلًا بالكامل: التشغيل المحلي الأساسي ناجح، وملفات الصوت الرئيسية موجودة، لكن لا يُنصح بنشر الحالة الحالية علنًا قبل معالجة الأسرار والتبعيات ومسار Netlify/fallback والأيقونات والتخزين الدائم.
