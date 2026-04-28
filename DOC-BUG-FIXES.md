# DOC-BUG-FIXES

## DBF-001 — §11.4 / §19.2 RestrictedReply shape divergence

- **Issue:** [ANKA-80](/ANKA/issues/ANKA-80)
- **Implementing ticket:** [ANKA-75](/ANKA/issues/ANKA-75) (`svc:news` v0.1)
- **Symptom:** §11.4 declared `/calendar/restricted` and `/calendar/pre-news-2h`
  reply shape as `{ restricted: bool, reasons: string[] }`, while §19.2
  declared the same endpoints as `{ restricted: bool, reasons: { event,
  eta_seconds }[] }`. Two divergent canonical shapes for the same wire
  contract.
- **Resolution:** §19.2 wins. The richer object form is required by
  gateway rails 7 and 13 so the gateway can log/render the blocking
  event and ETA without re-querying news. §11.4 has been patched to
  reference `RestrictedReply` (canonical schema in `pkg:contracts/news`)
  and §19.2 carries an explicit pointer to the contract package.
- **Patch commit:** `docs(docs): reconcile §11.4 RestrictedReply shape with §19.2`
- **Reviewer:** BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix).
