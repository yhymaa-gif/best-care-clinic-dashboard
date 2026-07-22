# إعداد الحماية وتسجيل الدخول

فعّل الحماية من إعدادات Netlify بإضافة المتغيرات التالية، ولا تضعها داخل GitHub:

```text
AUTH_ENABLED=true
AUTH_SESSION_SECRET=<قيمة عشوائية طويلة لا تقل عن 32 حرفًا>
AUTH_BOOTSTRAP_USERNAME=<اسم أول مدير>
AUTH_BOOTSTRAP_PHONE=+9665XXXXXXXX
APP_ORIGIN=https://bestcaredentalclinicsdash.netlify.app
UNIFONIC_APP_SID=<من حساب Unifonic>
UNIFONIC_SENDER_ID=BESTCARE
UNIFONIC_API_KEY=<من حساب Unifonic إن كان مطلوبًا>
```

بعد ضبطها، يُستخدم مسار `/api/auth` لتسجيل الدخول وإدارة المستخدمين. رمز التحقق صالح خمس دقائق، وعدد المحاولات محدود، والجلسة تنتهي بعد ثلاث ساعات من الخمول.

قبل التفعيل على الإنتاج، اختبر أولًا على Deploy Preview وتأكد من نجاح إرسال الرسائل. لا تفعّل `AUTH_ENABLED` قبل إضافة مستخدم المدير الأول ومفاتيح مزود الرسائل.

تطبيق PWA الحالي قابل للتثبيت على iPhone وAndroid. تحويله إلى تطبيق متجر أصلي (Capacitor) مرحلة لاحقة ولا يتطلب تغيير طبقة المزامنة.
