# Industrial AI Risk Intelligence Platform

**Global, production-grade industrial platform for fire/smoke AI detection, anti-theft monitoring, and real-time hardware automation.**

---

## System Philosophy

| Principle | Requirement |
|-----------|-------------|
| **Edge AI** | All inference runs on edge; no video leaves site for detection |
| **Offline-first** | Edge operates 100% offline; 14-day trial without internet |
| **Latency** | Local siren trigger < 500ms from event |
| **Cloud role** | Licenses, accounts, analytics, notifications, mobile control |
| **Identity** | OTP login; max 5 phone numbers per license |
| **Scale** | Multi-tenant SaaS; 10,000+ industrial sites |

---

## Repository Structure

```
STC AI VAP/
├── README.md                    # This file
├── docs/                        # Architecture, schemas, API, security, business
├── edge/                        # Edge: Rust ingestion + Python inference
│   ├── ingestion/               # Cargo.toml, src/main.rs, Dockerfile
│   └── inference/               # requirements.txt, inference_worker.py
├── cloud/                       # Cloud: API (Go), docker-compose, .env.example
│   └── api/                     # go.mod, cmd/api/main.go, Dockerfile
├── mobile/                      # Flutter: pubspec.yaml, lib/main.dart, lib/api/client.dart
└── .github/workflows/           # edge.yml, cloud.yml
```

---

## High-Level Data Flow

```
Cameras (RTSP) → Edge Ingestion (Rust) → AI Workers (Python/ONNX GPU)
       → Event & Risk Engine → Local Hardware (Siren/Relay)
       → TLS Sync → SaaS Cloud → Mobile Apps
```

---

## Quick Links

- **[دليل التثبيت خطوة بخطوة (Edge + Cloud + Mobile)](docs/INSTALLATION.md)** — من التثبيت حتى التشغيل النهائي
- [Global System Architecture](docs/architecture/01-global-system-architecture.md)
- [Edge Core Engine](docs/edge/01-edge-core-spec.md)
- [Cloud SaaS Platform](docs/architecture/02-cloud-saas-architecture.md)
- [Database Schemas](docs/schemas/README.md)
- [API Specifications](docs/api/README.md)
- [Security & Threat Model](docs/security/01-threat-model.md)
- [12-Month Roadmap](docs/business/04-12-month-roadmap.md)

---

---

## ✅ جاهز للتشغيل والبيع (Ready for operation and sale)

| المكون | الحالة |
|--------|--------|
| **Cloud API** | OTP حقيقي + JWT + حماية المسارات + CORS، حفظ أحداث/مواقع/ترخيص من DB، Sync بحل device من api_key |
| **Mobile** | تسجيل دخول OTP، مواقع، أحداث، arm/disarm، سيرن، ترخيص، رسائل خطأ |
| **Edge Sync** | حلقة مزامنة (config، license، telemetry)، مفتاح جهاز من السحابة |
| **توثيق** | [DEPLOYMENT.md](docs/DEPLOYMENT.md) نشر، [CUSTOMER-ONBOARDING.md](docs/CUSTOMER-ONBOARDING.md) إعداد عميل |

**تجربة سريعة:**  
1) تشغيل السحابة: `cd cloud && docker compose up -d db redis && go run ./cmd/api` (مع DATABASE_URL و JWT_SECRET).  
2) تطبيق الموبايل: رقم +201012345678، كود OTP: **1234**.  
3) **سيرفر الحافة (واجهة كاملة + 14 يوم بدون ترخيص):** `cd edge/server && pip install -r requirements.txt && python run.py` ثم فتح **http://localhost:8000** — Dashboard، كاميرات (موديولات حريق/دخان/مكافحة سرقة)، أحداث، إعدادات، ترخيص.  
4) مزامنة الحافة مع السحابة: `SYNC_BASE_URL=http://localhost:8080` و `SYNC_DEVICE_KEY=dev-key` ثم تشغيل `edge/sync`.

*Designed for global deployment. No prototype assumptions.*
