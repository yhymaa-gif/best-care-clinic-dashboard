# إعداد الحماية وتسجيل الدخول

فعّل الحماية من إعدادات Netlify بإضافة المتغيرات التالية، ولا تضعها داخل GitHub:

```text
AUTH_ENABLED=true
AUTH_SESSION_SECRET=<قيمة عشوائية طويلة لا تقل عن 32 حرفًا>
AUTH_BOOTSTRAP_USERNAME=<اسم أول مدير>
AUTH_BOOTSTRAP_PHONE=+9665XXXXXXXX
AUTH_BOOTSTRAP_EMAIL=yhymaa@hotmail.com

# خيار البريد الإلكتروني (Resend)
RESEND_API_KEY=re_XXXXXXXXXXXXXXXX
AUTH_EMAIL_FROM=Best Care Dashboard <onboarding@resend.dev>
APP_ORIGIN=https://bestcaredentalclinicsdash.netlify.app
UNIFONIC_APP_SID=<من حساب Unifonic>
UNIFONIC_SENDER_ID=BESTCARE
UNIFONIC_API_KEY=<من حساب Unifonic إن كان مطلوبًا>
```

بعد ضبطها، يظهر في شاشة الدخول خيار البريد الإلكتروني أو الجوال. البريد يستخدم Resend لإرسال رمز من 4 أرقام، صالح خمس دقائق، وعدد المحاولات محدود، والجلسة تنتهي بعد ثلاث ساعات من الخمول. للاختبار الأول يمكن استخدام `onboarding@resend.dev` كمرسل وإرسال الرسائل إلى بريد حساب Resend؛ وللإنتاج يجب توثيق نطاق العيادة في Resend ثم تغيير `AUTH_EMAIL_FROM`.

قبل التفعيل على الإنتاج، اختبر أولًا على Deploy Preview وتأكد من نجاح إرسال الرسائل. لا تفعّل `AUTH_ENABLED` قبل إضافة مستخدم المدير الأول ومفاتيح مزود الرسائل.

تطبيق PWA الحالي قابل للتثبيت على iPhone وAndroid. تحويله إلى تطبيق متجر أصلي (Capacitor) مرحلة لاحقة ولا يتطلب تغيير طبقة المزامنة.
