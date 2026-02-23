# Hardware Automation Specification

## 1. Latency Budget (< 500 ms)

| Stage | Target | Notes |
|-------|--------|-------|
| Event decision → HW command | < 50 ms | In-process or local IPC |
| Command → relay/siren driver | < 100 ms | GPIO/Serial/MQTT |
| Physical actuation | < 350 ms | Depends on hardware |
| **Total (p99)** | **< 500 ms** | Measured and logged |

## 2. Supported Interfaces

### Relay / GPIO

- Direct control of industrial relay boards (e.g. 24 V).
- Siren connected to relay; edge sends “close” for alarm.
- Config: `siren: { type: "relay", pin: 1 }` or board-specific addressing.

### MQTT

- Publish to topic e.g. `site/{site_id}/siren` with payload `ON`/`OFF` or `{"duration_sec": 30}`.
- Integrates with smart relays and building automation.

### Modbus RTU / TCP

- Coils or holding registers for relay control.
- Config: slave id, register, port; industrial PLC compatibility.

### GSM Fallback

- Optional GSM module: on critical event, send SMS to configured numbers if cloud push fails or as backup.
- Not used for primary <500 ms path; for redundancy.

### Alarm Panel

- Dry contact (relay) to conventional alarm panel input.
- Or protocol adapter (e.g. Contact ID over IP) for central station.

## 3. Command Set

| Command | Parameters | Effect |
|---------|------------|--------|
| siren_on | duration_sec | Turn siren on for N seconds |
| siren_off | — | Turn siren off immediately |
| relay_on | relay_id | Set relay on |
| relay_off | relay_id | Set relay off |
| arm | — | Enable detection and automation (from config) |
| disarm | — | Disable siren trigger; detection may continue for logging |

## 4. Safety

- **Fail-safe**: On edge crash or power loss, relay state should default to “off” (no siren) unless hardware is wired for fail-secure.
- **Timeout**: Siren auto-off after duration_sec to avoid endless alarm.
- **Audit**: Every command logged with event_id, latency_ms, success.

## 5. Remote Siren (from Cloud)

- Mobile or web calls `POST /v1/sites/:id/siren` → cloud pushes command to edge (e.g. via sync or push channel).
- Edge receives “siren_on” with duration_sec; executes same path as local event.
- Requires license feature `remote_siren` (Professional+).
