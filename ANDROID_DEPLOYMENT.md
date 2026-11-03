# دليل بناء وتجهيز تطبيق يافع ون (Yafa One) لأجهزة Android

يوضح هذا المستند البنية الفنية لتطبيق "يافع ون" (Yafa One) والخطوات العملية لتحويله إلى تطبيق Android مستقل بصيغة APK.

## 1. الطبيعة الفنية للمشروع
مشروع "يافع ون" هو تطبيق ويب متكامل ومتقدم مبني باستخدام:
- **Next.js 16 (App Router)** للواجهات والخادم.
- **Payload CMS 4** لإدارة البيانات والمحتوى والمستخدمين.
- **Tailwind CSS v4** للتصميم والتنسيق المتجاوب.

نظرًا لأن بيئة التطوير الحالية هي حاوية خادم Node.js سحابية (Linux Web Container)، فإن **حزم Android SDK و Java/Gradle** غير متوفرة محلياً لإنشاء ملفات `.apk` مباشرة في الخادم. ومع ذلك، تم التحقق من نجاح بناء الإنتاج (`npm run build`) بنجاح تام وبدون أي أخطاء.

---

## 2. خطوات إنشاء ملف APK فعلي عبر Capacitor (Android)

لتحويل تطبيق "يافع ون" إلى تطبيق أندرويد حقيقي (`app-debug.apk`)، اتبع الخطوات التالية على جهاز محلي يحتوي على Android Studio:

### الخطوة الأولى: تثبيت Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "يافع ون" "com.yafaone.app" --web-dir .next
```

### الخطوة الثانية: إضافة منصة أندرويد
```bash
npm install @capacitor/android
npx cap add android
```

### الخطوة الثالثة: بناء الويب ومزامنة أندرويد
```bash
npm run build
npx cap sync android
```

### الخطوة الرابعة: فتح مشروع Android Studio وبناء APK
```bash
npx cap open android
```
داخل Android Studio:
1. اذهب إلى القائمة **Build**.
2. اختر **Build Bundle(s) / APK(s)** ثم **Build APK(s)**.
3. سيتم حفظ ملف الـ APK الناتج في المسار المطلوب:
   `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3. إعدادات التوقيع النظيف (Release APK)
لإنشاء نسخة توزيع رسمية (`release-apk`) لتاريخ النشر على Google Play Store:
1. قم بتوليد مفتاح توقيع آمن (Keystore):
   ```bash
   keytool -genkey -v -keystore yafa-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias yafa-alias
   ```
2. احفظ المفتاح في مكان آمن **ولا تقم برفعه مطلقاً إلى مستودع GitHub العام**.
3. قم بتكوين `build.gradle` الخاص بأندرويد لاستخدام مفتاح التوقيع عند بناء النسخة النهائية.
