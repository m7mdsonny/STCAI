# دليل التثبيت والتشغيل — STC Solutions AI

**تثبيت سيرفر الحافة (Edge) والسحابة (Cloud) وتطبيق الموبايل خطوة بخطوة حتى التشغيل النهائي.**

---

## المتطلبات الأساسية

| المكون | المطلوب |
|--------|----------|
| **سيرفر الحافة** | Python 3.10+ ، pip |
| **السحابة** | Go 1.21+ و/أو Docker و Docker Compose |
| **الموبايل** | Flutter SDK 3.2+ (و Android Studio أو Xcode للتشغيل على جهاز/محاكي) |

---

# الجزء الأول: سيرفر الحافة (Edge)

## 1. التأكد من تثبيت Python

```powershell
# في PowerShell أو CMD
python --version
```
يجب أن تظهر نسخة 3.10 أو أحدث. إن لم يكن مثبتاً: حمّل من [python.org](https://www.python.org/downloads/).

---

## 2. فتح مجلد المشروع والانتقال لمجلد السيرفر

```powershell
cd "d:\STC\STC AI VAP\edge\server"
```
*(استبدل المسار بمسار مشروعك إن كان مختلفاً.)*

---

## 3. إنشاء بيئة افتراضية (اختياري لكن مُفضّل)

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```
*(في CMD استخدم: `venv\Scripts\activate.bat`)*

---

## 4. تثبيت الاعتماديات

```powershell
pip install -r requirements.txt
```

---

## 5. تشغيل سيرفر الحافة

```powershell
python run.py
```

يجب أن تظهر رسالة مثل: `Uvicorn running on http://0.0.0.0:8000`

---

## 6. التحقق من التشغيل

1. افتح المتصفح على: **http://localhost:8000**
2. يجب أن تظهر واجهة STC Solutions AI (لوحة التحكم، كاميرات، بث مباشر، أحداث، إعدادات، ترخيص).
3. عند أول تشغيل: تُنشأ قاعدة SQLite تلقائياً في `edge/data/riskintel.db` ويُضاف ترخيص تجريبي 14 يوماً وكاميرتان تجريبيتان.

**التحقق من الـ API:**
- افتح: **http://localhost:8000/api/health**  
  يجب أن ترى: `{"status":"ok","service":"edge"}`

---

## 7. إيقاف السيرفر

في نفس نافذة الطرفية: **Ctrl+C**

---

# الجزء الثاني: السحابة (Cloud)

يمكن التشغيل إما بـ **Docker** (قاعدة بيانات وRedis وAPI) أو بتشغيل **API بـ Go** مع قاعدة بيانات موجودة.

---

## الطريقة أ: تشغيل السحابة بـ Docker (مُوصى بها للتجربة الكاملة)

### 1. التأكد من تثبيت Docker و Docker Compose

```powershell
docker --version
docker compose version
```

### 2. الانتقال لمجلد السحابة

```powershell
cd "d:\STC\STC AI VAP\cloud"
```

### 3. تشغيل كل الخدمات (قاعدة البيانات، Redis، الـ API)

```powershell
docker compose up -d db redis
```
انتظر بضع ثوانٍ حتى تصبح Postgres جاهزة، ثم:

```powershell
docker compose up -d api
```

أو تشغيل كل شيء مرة واحدة:

```powershell
docker compose up -d
```

### 4. تهيئة قاعدة البيانات (أول مرة فقط)

عند أول `docker compose up` لـ **db**، مجلد `init-db` يُحمّل تلقائياً داخل الحاوية وتُنفَّذ السكربتات بالترتيب (01 حتى 06)، فيُنشأ الجدول والبيانات الأولية ومفتاح الجهاز للتجربة.

إن رغبت بتشغيل التهيئة يدوياً (مثلاً بعد حذف الحجم):

```powershell
docker compose exec db psql -U riskintel -d riskintel -f /docker-entrypoint-initdb.d/01-tenant.sql
# ثم 02، 03، 04، 05، 06 حسب الحاجة — أو أعد إنشاء الحاوية من الصفر.
```

في السيناريو العادي **لا تحتاج** خطوة يدوية؛ التهيئة تتم عند أول تشغيل لـ db.

### 5. التحقق من تشغيل السحابة

- **صحة الـ API:**  
  افتح **http://localhost:8080/health** أو **http://localhost:8080/v1/health**  
  يجب أن ترى `ok` أو `{"status":"ok"}`.
- **تجربة تسجيل الدخول من الموبايل:**  
  استخدم الرقم **+201012345678** وكود OTP **1234** (بيانات تجريبية من seed).

### 6. إيقاف السحابة

```powershell
cd "d:\STC\STC AI VAP\cloud"
docker compose down
```

---

## الطريقة ب: تشغيل الـ API محلياً بـ Go (بدون Docker للـ API)

مفيد عندما تريد تشغيل الـ API على جهازك مع الاتصال بقاعدة بيانات (مثلاً Postgres على Docker).

### 1. تثبيت Go

تحقق من التثبيت:
```powershell
go version
```
يُفضّل 1.21 أو أحدث.

### 2. تشغيل قاعدة البيانات و Redis فقط (إن تحتاج)

```powershell
cd "d:\STC\STC AI VAP\cloud"
docker compose up -d db redis
```

انتظر حتى تصبح Postgres جاهزة (حوالي 5 ثوانٍ).

### 3. ضبط متغيرات البيئة وتشغيل الـ API

```powershell
cd "d:\STC\STC AI VAP\cloud\api"
$env:DATABASE_URL = "postgresql://riskintel:riskintel@localhost:5432/riskintel"
$env:PORT = "8080"
$env:JWT_SECRET = "dev-secret-change-in-prod"
go run ./cmd/api
```

أو استخدم السكربت الجاهز من جذر المشروع:

```powershell
cd "d:\STC\STC AI VAP"
.\scripts\run-cloud-dev.ps1
```

(السكربت يشغّل db و redis ثم يشغّل الـ API محلياً.)

### 4. التحقق

افتح **http://localhost:8080/v1/health** — يجب أن ترى `{"status":"ok"}`.

---

# الجزء الثالث: تطبيق الموبايل (Flutter)

## 1. تثبيت Flutter

- حمّل Flutter من [flutter.dev](https://flutter.dev/docs/get-started/install).
- أضف Flutter إلى الـ PATH وتحقق:

```powershell
flutter doctor
```

أصلح أي تحذيرات (مثل ترخيص Android أو Xcode حسب نظامك).

---

## 2. الانتقال لمجلد المشروع وتثبيت الاعتماديات

```powershell
cd "d:\STC\STC AI VAP\mobile"
flutter pub get
```

---

## 3. ضبط عنوان الـ API

- التطبيق يقرأ عنوان الـ API من الإعدادات المحفوظة، والافتراضي في الكود: **http://localhost:8080**.
- على **محاكي أندرويد**: غالباً تحتاج استخدام عنوان الجهاز (مثلاً `http://10.0.2.2:8080` لمحاكي أندرويد على نفس الجهاز).
- على **جهاز حقيقي**: استخدم IP جهازك الذي يشغّل الـ Cloud، مثلاً `http://192.168.1.100:8080`.

يمكن تغيير العنوان لاحقاً من داخل التطبيق: **الإعدادات (أيقونة الترس) → API base URL → Save**.

---

## 4. تشغيل التطبيق

**على محاكي أندرويد أو جهاز متصل:**

```powershell
flutter run
```

**لاختيار جهاز معيّن:**

```powershell
flutter devices
flutter run -d <device_id>
```

---

## 5. تسجيل الدخول (بيانات تجريبية)

- **رقم الهاتف:** +201012345678  
- **كود OTP:** 1234  

(هذه القيم موجودة في بيانات الـ seed في السحابة.)

---

# التشغيل النهائي والتحقق الشامل

## ترتيب التشغيل الموصى به

1. **تشغيل السحابة (Cloud)**  
   - إما: `cd cloud && docker compose up -d`  
   - أو: تشغيل db و redis ثم `go run ./cmd/api` من `cloud/api` مع `DATABASE_URL` و `PORT`.

2. **تشغيل سيرفر الحافة (Edge)**  
   - `cd edge/server && pip install -r requirements.txt && python run.py`  
   - المتصفح: **http://localhost:8000**

3. **تشغيل تطبيق الموبايل**  
   - `cd mobile && flutter run`  
   - ضبط عنوان الـ API من الإعدادات إن لزم (مثلاً 10.0.2.2:8080 للمحاكي).

---

## التحقق النهائي

| الخطوة | الإجراء | النتيجة المتوقعة |
|--------|---------|------------------|
| 1 | فتح http://localhost:8000 | واجهة Edge: Dashboard، كاميرات، أحداث، إعدادات، ترخيص |
| 2 | فتح http://localhost:8080/v1/health | `{"status":"ok"}` |
| 3 | فتح تطبيق الموبايل → تسجيل الدخول | إدخال +201012345678 و OTP 1234 ثم الدخول للواجهة الرئيسية |
| 4 | من الموبايل: عرض المواقع والأحداث | قائمة مواقع (مثل Factory Alpha) وأحداث إن وُجدت |
| 5 | من واجهة Edge: License → إدخال مفتاح الجهاز | إدخال مفتاح من السحابة (مثل dev-key) وربط المزامنة |

---

## استكشاف الأخطاء

| المشكلة | الحل المقترح |
|---------|--------------|
| Edge: `ModuleNotFoundError` | تشغيل الأوامر من داخل `edge/server` والتأكد من تفعيل الـ venv و`pip install -r requirements.txt`. |
| Cloud: اتصال بقاعدة البيانات فاشل | التأكد من تشغيل `docker compose up -d db` وضبط `DATABASE_URL` بشكل صحيح (مثلاً localhost:5432 عند التشغيل من الجهاز). |
| الموبايل: لا يتصل بالـ API | تغيير عنوان الـ API من الإعدادات (مثلاً 10.0.2.2:8080 للمحاكي، أو IP الجهاز عند الاختبار على جهاز حقيقي). |
| OTP غير صحيح | التأكد من تشغيل الـ seed (04-seed.sql) واستخدام +201012345678 و 1234. في وضع التطوير يمكن رؤية كود OTP في لوج السحابة. |

---

*آخر تحديث: وفق بنية المشروع الحالية (Edge server + UI، Cloud API + init-db، Mobile Flutter).*
