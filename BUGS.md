# BUGS & TODO

Unresolved issues to investigate. Newest at top.

## 2026-06-30 — Resolved

- **Header showed phantom "N unpacked" with nothing to pack** (emailed bug,
  show-unpacked-only mode). Root cause: orphaned items — a trip item whose
  `container_item_id` pointed to a deleted container (or whose `bag_id` dangled).
  Both list views hide such items, but the header counted every item. Fixed:
  container delete now cascade-deletes its children, bag delete now nulls items'
  `bag_id` (items fall back to "Wearing / No Bag"), and the header counts only
  renderable items as defense-in-depth. Tests added.
- **Password login may not work / empty box (code side).** Replaced the
  hand-rolled `clerk-js` mount with `@clerk/astro`'s `<SignIn>/<SignUp>`
  components (built-in loading + error states) on a single shared Clerk client,
  and removed the page-blanking hacks. NOTE: still needs runtime verification of
  a real sign-in, plus the dashboard-side config below.
- **Couldn't add items ("operation can't be completed") — CSRF on mobile /
  stale tokens.** State-changing requests carrying a Bearer token now skip the
  double-submit cookie check (Bearer auth isn't CSRF-able), fixing mobile
  browsers that drop the HttpOnly CSRF cookie; the client also refetches the
  token and retries once on a 403. This likely resolves Laura's "couldn't add
  items to master list" — verify on her device. Cookie-only requests still
  require CSRF.

## 2026-04-20 — Laura's feedback (still open)

- **Password login needs codes & takes too many screens.** Verification flow is
  heavier than expected. This is Clerk _dashboard_ configuration, not code:
  enable password sign-in, make the email code optional/secondary, lengthen
  sessions / "remember this device". (Owner: Gary, in Clerk dashboard.)
- **Couldn't add items to trip without a bag.** Verify the no-bag / unassigned
  flow in Add mode — items should be addable even when no bag is selected.
  (Not addressed yet; separate from the auth/CSRF work above. Re-test, and if it
  still fails capture the actual error/failing call.)
- **Couldn't drag items between bags.** Check drag-and-drop on her device
  (likely mobile) across bag cards; may be a touch-vs-pointer issue or a
  droppable-target bug. (Not addressed yet.)
- **packzen.com has no HTTPS (wrong domain).** The canonical domain is
  packzen.org; packzen.com either shouldn't be advertised or needs a proper
  redirect with a valid cert. Decide whether to acquire/redirect or retire it.

## Follow-ups / hardening

- **Clerk load timeout.** If clerk-js never loads (offline/ad-blocker), gated
  pages (dashboard, trips, all-items) wait indefinitely and stay blank. The
  public landing page now fails open, but a load timeout + retry UI on the
  protected pages would be a nice hardening.
- **Redundant client CSRF fetch.** Now that the server skips CSRF for Bearer
  requests, the client's `/api/csrf-token` fetch + `x-csrf-token` header are
  effectively no-ops for normal app traffic and could be removed later to
  simplify (kept for now as the cookie-auth fallback).
