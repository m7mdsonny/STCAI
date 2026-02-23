# Event Flow Diagrams

## 1. End-to-End Event Flow (Edge → Cloud → Mobile)

```mermaid
sequenceDiagram
  participant Cam as Camera
  participant Ing as Ingestion
  participant AI as AI Inference
  participant Eng as Event Engine
  participant HW as Hardware
  participant DB as Local DB
  participant Sync as Sync Client
  participant Cloud as Cloud API
  participant Push as FCM
  participant App as Mobile App

  Cam->>Ing: RTSP frames
  Ing->>AI: Sampled frames
  AI->>AI: Detect (fire/smoke/etc)
  AI->>Eng: Detections (multi-frame)
  Eng->>Eng: Validate, risk, dedup
  Eng->>HW: Siren ON (<500ms)
  Eng->>DB: Store event, snapshot, clip
  Eng->>Sync: Queue event
  Sync->>Cloud: POST /sync/events
  Cloud->>Cloud: Store, aggregate
  Cloud->>Push: Notify user(s)
  Push->>App: Push payload
  App->>Cloud: GET /v1/events/:id (snapshot/clip)
  App->>Cloud: POST acknowledge
```

## 2. Edge Internal Event Path (Latency-Critical)

```mermaid
flowchart LR
  A[Frame ready] --> B[Inference]
  B --> C[Detection]
  C --> D{Multi-frame OK?}
  D -->|Yes| E[Event created]
  E --> F[Hardware command]
  F --> G[Siren/Relay]
  E --> H[Write DB]
  E --> I[Sync queue]
  D -->|No| J[Drop]
```

**Timing**: Frame → Inference (~50–100 ms) → Multi-frame (1–2 frames) → Command → Relay (~50 ms) → **Total < 500 ms**.

## 3. License Check and Feature Gating (Edge)

```mermaid
flowchart TD
  A[Edge startup / periodic] --> B[GET /sync/license]
  B --> C{State?}
  C -->|trial/active| D[Cache result]
  D --> E[Enable features per flags]
  E --> F[Allow sync]
  C -->|expired/revoked| G[Cache result]
  G --> H[Restrict: no sync or minimal]
  H --> I[Optional: grace period]
```

## 4. OTP Login and JWT (Mobile/Web)

```mermaid
sequenceDiagram
  participant U as User
  participant App as App
  participant API as Cloud API
  participant SMS as SMS Gateway

  U->>App: Enter phone
  App->>API: POST /auth/otp/send
  API->>API: Rate limit, max phones check
  API->>SMS: Send OTP
  API->>App: 200 OK
  U->>App: Enter OTP
  App->>API: POST /auth/otp/verify
  API->>API: Validate OTP, load tenant/user
  API->>App: JWT + refresh + user
  App->>App: Store tokens securely
  App->>API: GET /sites (Bearer JWT)
  API->>App: Sites list
```
