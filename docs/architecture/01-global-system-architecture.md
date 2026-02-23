# Global System Architecture

## 1. System Context

```mermaid
C4Context
  title System Context - Industrial AI Risk Intelligence
  Person(operator, "Site Operator", "Acknowledges alerts, arms/disarms")
  Person(admin, "Tenant Admin", "Manages sites, users, licenses")
  System(edge, "Edge Core", "Video ingestion, AI inference, events, siren/relay")
  System(cloud, "SaaS Cloud", "Licenses, users, analytics, push, API")
  System(mobile, "Mobile App", "OTP login, alerts, clips, remote control")
  System(cameras, "RTSP Cameras", "Existing industrial cameras")
  System(hw, "Hardware", "Siren, relays, PLC, MQTT")

  Rel(cameras, edge, "RTSP streams")
  Rel(edge, hw, "Trigger siren/relay <500ms")
  Rel(edge, cloud, "TLS sync: events, telemetry, health")
  Rel(cloud, edge, "Config, license check, OTA")
  Rel(admin, cloud, "Dashboard, license, users")
  Rel(operator, mobile, "Alerts, acknowledge, arm/disarm")
  Rel(mobile, cloud, "API, push")
  Rel(cloud, mobile, "Push, API responses")
```

## 2. Global Data Flow

```mermaid
flowchart LR
  subgraph Site["Industrial Site"]
    C[RTSP Cameras]
    I[Video Ingestion Rust]
    A[AI Inference Python/ONNX]
    E[Event Engine]
    H[Hardware Automation]
    DB[(Local SQLite)]
    C --> I --> A --> E --> H
    E --> DB
    H --> DB
  end

  subgraph Cloud["SaaS Cloud"]
    API[API Gateway]
    License[License Engine]
    Events[Event Service]
    Notify[Notification Service]
    API --> License
    API --> Events
    API --> Notify
  end

  subgraph Client["Clients"]
    Mobile[Mobile App]
    Web[Web Dashboard]
  end

  E <-.->|TLS Sync| API
  Mobile --> API
  Web --> API
```

## 3. Deployment Topology

```mermaid
flowchart TB
  subgraph "Tenant A - Company 1"
    S1A[Site 1 Edge]
    S2A[Site 2 Edge]
  end

  subgraph "Tenant B - Company 2"
    S1B[Site 1 Edge]
  end

  subgraph "SaaS Cloud Region"
    LB[Load Balancer]
    GW[API Gateway]
    AUTH[Auth Service]
    TENANT[Tenant Service]
    LICENSE[License Service]
    EVENT[Event Service]
    NOTIFY[Notify Service]
    TELEMETRY[Telemetry Service]
    LB --> GW
    GW --> AUTH
    GW --> TENANT
    GW --> LICENSE
    GW --> EVENT
    GW --> NOTIFY
    GW --> TELEMETRY
  end

  S1A --> GW
  S2A --> GW
  S1B --> GW
```

## 4. Edge Stack (Single Site)

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Video ingestion | Rust | RTSP pull, decode, frame queue, multi-camera, HW decode, memory cap |
| AI inference | Python + ONNX Runtime GPU | Batch inference, ROI, thresholds, hot reload |
| Event engine | Rust/Python | Multi-frame validation, risk score, zones, schedule, dedup |
| Hardware | Rust/C | Relay, siren, MQTT, Modbus, <500ms path |
| Local store | SQLite (encrypted) | Clips, snapshots, audit, rotation |
| Sync client | Rust | TLS to cloud, backoff, certificate pinning |

## 5. Cloud Stack (Multi-Tenant)

| Concern | Implementation |
|---------|----------------|
| API | REST + WebSocket (real-time); API Gateway + rate limit |
| Auth | JWT; OTP via SMS; device binding; max 5 phones per license |
| Tenancy | Tenant ID on every entity; row-level isolation |
| License | 14-day trial offline; device ID binding; anti-clock tamper; feature flags |
| Events | Ingest from edge; aggregate; push to mobile; escalation |
| Telemetry | Device health, latency, model version; Prometheus |

## 6. Mobile Stack

| Item | Choice |
|------|--------|
| Framework | Flutter |
| Auth | OTP (phone); JWT in secure storage |
| Real-time | FCM + WebSocket fallback |
| Features | Multi-site, snapshot, 10s clip, ack, escalate, remote siren, arm/disarm |

---

*Next: [Cloud SaaS Architecture](02-cloud-saas-architecture.md)*
