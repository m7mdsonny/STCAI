# Investor Structure: Market, Revenue, Unit Economics, Moat

## 1. Market Size Estimation

- **TAM (Total Addressable)**: Industrial and commercial sites with CCTV in target regions (Egypt, GCC, Africa). Estimate 500k+ sites with 2M+ cameras; assume 20% could adopt AI risk (fire/theft) → 100k sites.
- **SAM (Serviceable Addressable)**: Sites with RTSP cameras and budget for SaaS: manufacturing, warehouses, logistics, retail. Estimate 30k–50k sites in 5 years in focus regions.
- **SOM (Serviceable Obtainable)**: Year 3 target: 1,000–2,000 paying sites (3–5% SAM); Year 5: 5,000–10,000 sites with geographic expansion.

**Sources**: Industry reports (industrial automation, fire safety, video surveillance); local trade bodies; insurance data.

## 2. Revenue Projection (3 Years)

| Year | Sites (paying) | ARPU (USD, blended) | Subscription | Setup + hardware | Total revenue (USD) |
|------|----------------|---------------------|--------------|-------------------|---------------------|
| Y1 | 50 | 1,800 | 90k | 60k | 150k |
| Y2 | 350 | 2,000 | 700k | 250k | 950k |
| Y3 | 1,200 | 2,200 | 2.64M | 400k | 3.04M |

*Assumptions: Ramp from pilots; Egypt + GCC first; ARPU rises with mix to Professional/Enterprise.*

## 3. Unit Economics

| Metric | Target |
|--------|--------|
| **CAC** (Customer Acquisition Cost) | < 15% of LTV |
| **LTV** (5-year retention assumption) | 5 × ARPU ≈ 10k USD (Professional) |
| **LTV:CAC** | > 3:1 |
| **Gross margin (SaaS)** | 70–80% |
| **Gross margin (hardware)** | 20–30% |
| **Payback** | < 18 months |

## 4. Margin Breakdown

- **Recurring**: Cloud cost 15–20%; support 10–15%; sales & G&A allocated; net margin on recurring 40–50% at scale.
- **Setup**: Installation and hardware cost 50–60%; net margin 40–50%.
- **Blended**: As recurring share grows, overall margin improves.

## 5. Scaling Cost Model

- **Cloud**: Grows sub-linearly with sites (batching, caching); ~0.5–1k USD/site/year at 1k sites.
- **Support**: Tiered; Enterprise dedicated cost in contract.
- **Sales**: Direct + channel; channel reduces CAC but shares margin.
- **R&D**: Edge + cloud + mobile; fixed until scale; then 15–20% of revenue.

## 6. Exit Strategy

- **Acquisition**: Strategic (security, industrial automation, insurance tech, or regional leader) in 5–7 years.
- **Metrics for exit**: ARR, site count, retention, gross margin, geographic footprint.
- **Alternative**: Sustainable growth and profitability; dividend or secondary.

## 7. Technology Moat

- **Edge AI stack**: Rust ingestion + Python ONNX; tuned for <500 ms and offline; hard to replicate without focus.
- **License and offline trial**: 14-day trial without internet; device binding; anti-tamper; differentiates from cloud-only players.
- **Industrial logic**: Zones, schedules, escalation, risk scoring; domain depth in fire + theft.
- **Data**: Risk and event data per site; improves benchmarks and future models (with consent).

## 8. Competitive Barrier

- **Integration depth**: Siren, relay, MQTT, Modbus, alarm panel; industrial deployment experience.
- **Trust**: Security and threat model; compliance and insurance use cases.
- **Network**: Pilot references, insurance partnerships, channel; strengthens brand and distribution.
