# Mobile Application Specification (Flutter)

## 1. Technology

- **Framework**: Flutter (iOS + Android).
- **State**: Provider or Riverpod; clean separation of API and local state.
- **Networking**: REST client (Dio or http); secure token storage (flutter_secure_storage).

## 2. Features

| Feature | Description |
|---------|-------------|
| **OTP login** | Phone number → send OTP → verify → JWT; max 5 phones per license enforced server-side |
| **Multi-site support** | List sites user can access; filter by role (admin sees all, others by user_site_access) |
| **Real-time push** | FCM; new event → notification; tap → event detail |
| **Event preview** | Snapshot image; optional 10-second clip playback (stream or download) |
| **Acknowledge alert** | POST /events/:id/acknowledge; update UI |
| **Escalate alert** | POST /events/:id/escalate; optional note |
| **Remote siren trigger** | POST /sites/:id/siren (Professional+); duration_sec |
| **Arm / disarm site** | POST /sites/:id/arm, /disarm; reflect in UI |
| **Risk score display** | Per-site or daily risk from API |
| **License status** | GET /license/status; show tier, expiry, limits |

## 3. Security

- **Token storage**: JWT and refresh in flutter_secure_storage; clear on logout.
- **API**: TLS only; certificate pinning optional for high-security deployments.
- **Device binding**: Optional; send device_fingerprint on login; backend can limit devices per user.
- **Sensitive data**: No logging of tokens or OTP; secure storage only.

## 4. Offline Behavior

- **List caching**: Cache site and event list for last 24h; show cached when offline with “last updated” label.
- **Actions**: Arm/disarm and siren require network; show error if offline.
- **Login**: Requires network (OTP).

## 5. Non-Functional

- **Performance**: Lazy load event list; pagination; thumbnail first for snapshots.
- **Accessibility**: Labels, contrast; support TalkBack / VoiceOver.
- **Localization**: Prepare for Arabic + English (RTL for Arabic).
