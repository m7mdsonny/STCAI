# Cost Optimization

## 1. Cloud Cost Levers

| Area | Levers |
|------|--------|
| **Compute** | Right-size instances; spot/preemptible for async workers; scale-to-zero for batch jobs |
| **DB** | Reserved capacity for baseline; read replicas only when needed; partition and archive old events |
| **Storage** | Events: hot (30 days) on fast storage; cold (1 year) on object storage; lifecycle policies |
| **Network** | Edge sync: compress payloads; batch events; region-local endpoints to avoid cross-region egress |
| **Push/SMS** | FCM free; SMS cost per OTP/escalation; cap per tenant; use OTP only when needed |

## 2. Edge Cost (Per Unit)

- **Hardware**: Industrial PC or NUC + GPU; relay board; one-time.
- **Power**: 24/7; estimate per site for OpEx.
- **No per-event cloud compute for detection**: AI on edge reduces cloud cost.

## 3. Scaling Cost Model (Rough)

| Scale | Main cost drivers | Notes |
|-------|-------------------|-------|
| 100 sites | 1–2 API nodes, 1 DB, low storage | Single region |
| 1,000 sites | 3–5 API nodes, DB + replica, Redis, more storage | Consider event partitioning |
| 10,000 sites | 10+ API nodes, sharded or partitioned DB, multi-AZ, multi-region | License and event services scale linearly |

## 4. SaaS Margin

- **Gross margin target**: 70–80% (recurring revenue minus cloud, support, SMS).
- **Hardware margin**: 20–30% on devices if sold directly.
- **Add-ons**: SMS credits, extra cameras, extra sites — higher margin.

## 5. Optimization Checklist

- [ ] Event table partitioning and archive policy.
- [ ] License and config cached in Redis to reduce DB load.
- [ ] Async analytics and reports (queue + batch).
- [ ] Edge: batch sync; compress snapshots/clips or upload only on demand.
- [ ] Reserved/commitment for baseline compute and DB.
