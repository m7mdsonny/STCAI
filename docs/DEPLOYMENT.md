# RiskIntel - دليل النشر والتشغيل (Deployment)

## المتطلبات

- **السحابة**: PostgreSQL 16، Redis (اختياري)، Go 1.22+
- **Edge**: Rust 1.75+، Python 3.10+ (للـ inference)، وحدة GPU (اختياري)
- **Mobile**: Flutter 3.2+

---

## 1. نشر السحابة (Cloud)

### 1.1 قاعدة البيانات

```bash
# إنشاء DB
createdb riskintel
export DATABASE_URL=postgresql://user:pass@host:5432/riskintel

# تطبيق الـ schemas (بالترتيب)
psql $DATABASE_URL -f docs/schemas/01-cloud-tenant-identity.sql
psql $DATABASE_URL -f docs/schemas/02-cloud-license.sql
psql $DATABASE_URL -f docs/schemas/03-cloud-events-analytics.sql
# ثم من cloud/init-db:
psql $DATABASE_URL -f cloud/init-db/04-seed.sql
psql $DATABASE_URL -f cloud/init-db/05-edge-api-key.sql
psql $DATABASE_URL -f cloud/init-db/06-events-unique.sql
```

أو استخدم Docker مع مجلد `cloud/init-db` كـ init (يُنفَّذ تلقائياً عند أول تشغيل).

### 1.2 متغيرات البيئة (الإنتاج)

| المتغير | الوصف |
|---------|--------|
| `DATABASE_URL` | اتصال PostgreSQL |
| `JWT_SECRET` | مفتاح سري قوي (256-bit) لتوقيع JWT |
| `PORT` | منفذ الـ API (مثلاً 8080) |
| `REDIS_URL` | اختياري للـ cache لاحقاً |

### 1.3 تشغيل الـ API

```bash
cd cloud/api
go build -o api ./cmd/api
./api
```

أو عبر Docker: `docker build -t riskintel-api . && docker run -e DATABASE_URL -e JWT_SECRET -p 8080:8080 riskintel-api`

### 1.4 CORS

الـ API يسمح بـ `Origin` القادم في الطلب. للإنتاج ضع قائمة نطاقات محددة في حزمة `cors` إن لزم.

---

## 2. نشر Edge (الطرفية)

### 2.1 التوفير (Provisioning)

1. في السحابة: إنشاء Tenant → Site → إضافة Edge device مع `device_id` و`api_key`.
2. تثبيت المفتاح على الجهاز: متغيرات `SYNC_DEVICE_KEY` و`SYNC_BASE_URL` (أو ملف config آمن).

### 2.2 تشغيل المكونات

```bash
# 1) الـ Sync (اتصال بالسحابة)
export SYNC_BASE_URL=https://api.your-domain.com
export SYNC_DEVICE_KEY=<api_key_from_cloud>
cd edge/sync && cargo run --release

# 2) الـ Ingestion (عند جاهزية RTSP)
cd edge/ingestion && cargo run --release

# 3) الـ Inference
cd edge/inference && pip install -r requirements.txt && python inference_worker.py --model models/fire_v1.onnx
```

### 2.3 SQLite المحلي (الـ Edge)

```bash
mkdir -p edge/data
sqlite3 edge/data/riskintel.db < docs/schemas/04-edge-local.sql
```

استخدم مسار الـ DB في config الـ event engine أو الـ sync عند الربط لاحقاً.

---

## 3. التطبيق (Mobile)

1. ضبط **API base URL** في الكود أو عبر بيئة البناء (مثلاً `kApiBaseUrl` في `lib/main.dart`).
2. بناء الإصدار:
   ```bash
   cd mobile
   flutter pub get
   flutter build apk   # أو build ios
   ```
3. توزيع التطبيق: TestFlight / Play Internal أو متاجر التطبيقات.

---

## 4. التحقق بعد النشر

| الخطوة | الأمر / الإجراء |
|--------|------------------|
| صحة API | `curl https://your-api/health` → `ok` |
| تسجيل الدخول | إرسال OTP ثم التحقق برقم موجود في جدول `users` |
| المواقع | بعد تسجيل الدخول: GET `/v1/sites` مع JWT |
| Sync الطرفية | طلب GET `/v1/sync/config` مع `X-Device-Key` → 200 + config |

---

## 5. النسخ الاحتياطي والاستعادة

- **PostgreSQL**: نسخ احتياطي دوري (pg_dump أو PITR حسب البيئة).
- **Edge**: البيانات المحلية في SQLite؛ إعادة المزامنة من السحابة بعد الاستعادة.

راجع `docs/devops/03-monitoring-logging-dr.md` للتفاصيل.
