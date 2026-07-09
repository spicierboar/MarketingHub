# Full implementation plan — SRS · product vision · go-live

**Owner decision (2026-07-09):** All SRS / product-vision / go-live items are **non-negotiable**. P0 is **Wave 0 only**.

**Related:** `docs/parallel/FULL-ORCHESTRATION.md` · `docs/BUSINESS-ROADMAP.md` · `docs/OWNER-LIVE-CUTOVER.md`

## Waves

| Wave | Content | Agents | Live flags |
|------|---------|--------|------------|
| **W0** | Portal · sales · auto-publish | M16–M00 | OFF |
| **W1** | Reports · intel panel · calendar assist · `0028` | M20–M23 | OFF |
| **W2** | Live publish · ads · analytics · public API | M24–M27 | OFF (code) |
| **W3** | CRM · email · SMS · reviews | M30–M33 | OFF |
| **W4** | Website CMS · funnel/A/B · automation · loyalty | M34–M37 | OFF |
| **W5** | Full RAG · recs · AI-MOS auto · campaign builder | M40–M43 | OFF |
| **W6** | Owner go-live Phases 3–4 + M45 verify | OWNER-OPS | **FLIP** |
| **W7** | Bookings · local SEO · exec dash · API · security · video · learning | M50–M55 | post-W6 |

**Done when:** `full_complete=yes` on `main` · live pilot on `https://mangotickle.com.au`

**Locks:** OAuth-only · no password storage · FB/IG/GBP/TikTok v1 platforms.

Previously deferred items (CRM, API, video studio, continuous learning, live flags) are assigned to waves above — not dropped.
