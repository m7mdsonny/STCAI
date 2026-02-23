# RiskIntel - إعداد عميل جديد (Customer Onboarding)

## الهدف

إعداد شركة (Tenant) جديدة مع موقع (Site)، مستخدمين، ترخيص، وجهاز طرفي (Edge) جاهز للعمل والبيع.

---

## الخطوات

### 1. إنشاء الـ Tenant والـ Site

في قاعدة البيانات (أو عبر لوحة إدارية مستقبلية):

```sql
INSERT INTO tenants (id, name, slug, region, tier, settings)
VALUES (gen_random_uuid(), 'اسم الشركة', 'slug-unique', 'EGYPT', 'PROFESSIONAL', '{}')
RETURNING id;
-- احفظ tenant_id

INSERT INTO sites (id, tenant_id, name, timezone, address, config)
VALUES (gen_random_uuid(), '<tenant_id>', 'المصنع الرئيسي', 'Africa/Cairo', 'العنوان', '{}')
RETURNING id;
-- احفظ site_id
```

### 2. إنشاء الترخيص (License)

```sql
INSERT INTO licenses (tenant_id, tier, state, trial_ends_at, max_devices, max_phones, feature_flags)
VALUES ('<tenant_id>', 'PROFESSIONAL', 'trial', now() + interval '14 days', 10, 5, '{"fire": true, "theft": true}');
```

للتحويل لاشتراك مدفوع: تحديث `state = 'active'` و`expires_at` وربط مفتاح التفعيل إن وُجد.

### 3. إضافة المستخدمين (هواتف مسموح لها)

حد أقصى 5 أرقام حسب الترخيص.

```sql
INSERT INTO users (tenant_id, phone, role, display_name)
VALUES ('<tenant_id>', '+201012345678', 'admin', 'أحمد محمد');
```

الأدوار: `admin`, `security`, `manager`, `viewer`.

### 4. إضافة جهاز Edge وربط المفتاح

```sql
INSERT INTO edge_devices (site_id, device_id, name, api_key, status)
VALUES ('<site_id>', 'EDGE-001', 'جهاز 1', 'مفتاح-سري-فريد', 'online');
```

- **device_id**: معرف ثابت للجهاز (مثلاً من المصنع).
- **api_key**: مفتاح يُعطى للعميل لتثبيته على الجهاز (متغير `SYNC_DEVICE_KEY`).

### 5. تسليم العميل

1. **التطبيق**: يشارك العميل رابط التثبيت (TestFlight / Play أو متجر).
2. **تسجيل الدخول**: الرقم المضاف في الخطوة 3؛ يطلب OTP (يرسل من الـ API أو مزود SMS).
3. **الجهاز الطرفي**: تسليم قيم `SYNC_BASE_URL` و`SYNC_DEVICE_KEY` عبر قناة آمنة؛ العميل يضبطها على الجهاز ويشغّل الـ sync.

### 6. تجربة 14 يوم (Trial)

- خلال الفترة لا حاجة لدفع.
- بعد الانتهاء: تجديد الترخيص أو التحويل لاشتراك مدفوع وتحديث `licenses`.

---

## ملخص بيانات البذر (Demo)

للبيئة التطويرية يوجد tenant جاهز:

- **الهاتف**: +201012345678  
- **كود OTP للتجربة**: 1234 (أي رقم يعمل مع هذا الكود في وضع التجربة)
- **مفتاح Edge**: dev-key (لجهاز EDGE-001)

في الإنتاج: إلغاء كود OTP التجريبي وربط إرسال OTP الحقيقي (SMS).
