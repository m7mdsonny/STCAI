# 12-Month Execution Roadmap

## Overview by Quarter

| Quarter | Theme | Milestones |
|---------|--------|------------|
| **Q1** | Edge MVP + 3 pilot factories | Edge stable; fire + siren; 3 sites live; trial flow |
| **Q2** | SaaS launch + mobile | Cloud multi-tenant; OTP + JWT; Flutter app; license engine; sync |
| **Q3** | Paid clients + analytics | First paying customers; risk analytics; insurance report; escalation |
| **Q4** | Scaling + regional expansion | 50+ sites; Egypt/GCC sales; channel; advanced intelligence |

---

## Q1: Edge MVP + 3 Pilot Factories

### Engineering

- **Video ingestion (Rust)**: RTSP multi-camera; configurable FPS; memory cap; reconnect.
- **AI inference (Python/ONNX)**: Fire/smoke model; batch; per-camera threshold; ROI optional.
- **Event engine**: Multi-frame validation; risk score; dedup; priority.
- **Hardware**: Relay/siren driver; <500 ms path; audit log.
- **Local store**: SQLite (encrypted); events, snapshots, clips; rotation.
- **Sync (minimal)**: TLS; config pull; event push; license check (trial 14 days).

### Product / Ops

- **Pilot selection**: 3 factories (Egypt or GCC); existing RTSP cameras; signed pilot agreement.
- **Installation**: Deploy edge unit per site; connect cameras; configure zones.
- **Trial**: 14-day full functionality; no payment; collect feedback and metrics.

### Hiring

- 1× Rust/embedded engineer (or senior full-stack with Rust).
- 1× ML engineer (ONNX, model tuning).
- Optional: 1× field/ops for pilots.

### Budget (indicative)

- Cloud (staging): 2k USD.
- Edge hardware (3 units + spares): 5k USD.
- Travel/on-site: 3k USD.
- **Q1 total**: ~10k USD (excluding salaries).

### Revenue target

- 0 (pilots are free); goal: 2 of 3 pilots commit to paid by end Q2.

### Risks

- Camera compatibility; mitigate with 2–3 camera brands tested in lab.
- Pilot delay; mitigate with backup pilot list.

---

## Q2: SaaS Launch + Mobile

### Engineering

- **Cloud**: Multi-tenant APIs (auth, tenant, site, event, license); PostgreSQL; Redis cache.
- **Auth**: OTP send/verify (SMS provider); JWT; max 5 phones per license enforced.
- **License engine**: Trial 14 days; activation key; device binding; feature flags.
- **Edge sync**: Full sync API; config push; event ingest; telemetry.
- **Mobile (Flutter)**: OTP login; multi-site list; event list; snapshot + 10s clip; acknowledge; escalate; remote siren; arm/disarm; license status.
- **Web (minimal)**: Admin: tenant, sites, license, users (or postpone to Q3).

### Product / Ops

- **Launch**: Staging → production; first paying conversion from pilots.
- **Documentation**: API docs; provisioning guide; runbook.

### Hiring

- 1× Backend engineer (cloud APIs, DB).
- 1× Flutter developer (mobile).
- Optional: 1× DevOps (or shared).

### Budget (indicative)

- Cloud (prod): 5k USD.
- SMS (OTP): 1k USD.
- **Q2 total**: ~6k USD (excluding salaries).

### Revenue target

- 3–10 paying sites (from pilots + first outbound); ARR 15–40k USD.

### Risks

- SMS delivery (Egypt/GCC); mitigate with local provider and fallback.
- Mobile store approval; mitigate with TestFlight/Play internal first.

---

## Q3: Paid Clients + Analytics

### Engineering

- **Event service**: Scale; partitioning; push to mobile (FCM).
- **Risk analytics**: Daily site risk score; aggregation; dashboard API.
- **Insurance report**: PDF/export (compliance report from risk + events).
- **Escalation**: Configurable rules; SMS escalation; in-app escalate.
- **Theft module**: Intrusion/loitering model; zones; schedule; release to Professional tier.

### Product / Ops

- **Sales**: Convert remaining pilots; outbound to 20–50 leads; 14-day demo offers.
- **Support**: Email + phone for Professional; knowledge base.
- **Case studies**: 2–3 written; video from 1 pilot.

### Hiring

- 1× Sales (Egypt or GCC).
- Optional: 1× Customer success/support.

### Budget (indicative)

- Cloud: 8k USD.
- Sales/marketing: 10k USD.
- **Q3 total**: ~18k USD.

### Revenue target

- 25–50 paying sites; ARR 80–150k USD.

### Risks

- Churn if onboarding weak; mitigate with success playbook and check-ins.

---

## Q4: Scaling + Regional Expansion

### Engineering

- **Scale**: Event partitioning; read replicas; Prometheus/Grafana; DR runbook.
- **Advanced intelligence**: Event timeline replay; risk heatmap; predictive fire trend (v1); remote model update.
- **ERP integration**: Webhook or API for event feed (Enterprise); optional.
- **Security**: Audit of threat model; pen test; key rotation policy documented.

### Product / Ops

- **Geography**: Egypt + GCC focus; first channel partner or distributor.
- **Insurance**: 1 partnership (referral or co-brand) in progress.
- **Pricing**: Egypt/GCC/Africa pricing live; add-ons (SMS, extra cameras) in billing.

### Hiring

- 1× DevOps/SRE (or increase backend capacity).
- 1× Sales or channel manager (GCC if Egypt covered).

### Budget (indicative)

- Cloud: 12k USD.
- Sales/marketing: 15k USD.
- Security/audit: 5k USD.
- **Q4 total**: ~32k USD.

### Revenue target

- 50–80 paying sites; ARR 150–250k USD.

### Risks

- Regional regulation; mitigate with local legal check.
- Channel conflict; mitigate with clear partner rules and pricing.

---

## Year 1 Summary

| Metric | Target |
|--------|--------|
| **Paying sites** | 50–80 |
| **ARR** | 150–250k USD |
| **Team** | 6–8 (engineering, sales, ops) |
| **Pilots converted** | 2–3 of 3 |
| **Product** | Edge + Cloud + Mobile + Fire + Theft + Risk + Insurance report |

---

## Milestone Checklist (Year 1)

- [ ] Q1: Edge MVP with fire detection and siren <500 ms.
- [ ] Q1: 3 pilot factories live on 14-day trial.
- [ ] Q2: Cloud multi-tenant live; OTP + JWT; license engine.
- [ ] Q2: Flutter app: login, events, snapshot/clip, arm/disarm, remote siren.
- [ ] Q2: First paying customers (pilot conversion).
- [ ] Q3: Risk analytics and insurance report live.
- [ ] Q3: Theft module (Professional) released.
- [ ] Q3: 25–50 paying sites.
- [ ] Q4: 50–80 paying sites; Egypt + GCC.
- [ ] Q4: One insurance or channel partnership.
- [ ] Q4: Scaling and DR validated.
