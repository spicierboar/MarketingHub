# P0 owner — step away guide

**One launch. Full chain. No manual handoffs.**

## Start (only thing you do)

1. Open a new Cursor agent chat titled **`M16-P0-Foundation`**
2. Paste the entire contents of **`docs/parallel/M16-P0-foundation-prompt.md`**
3. Close the laptop

M16 will merge foundation work, then **automatically spawn M17 + M18 + M19** in parallel.  
When all three finish, one of them spawns **M00** to integrate and push.

Full mechanics: **`docs/parallel/P0-ORCHESTRATION.md`**

## Come back when

- An agent message says **"P0 complete"**, or
- `docs/parallel/PROGRESS.md` shows `p0_complete = yes`

## Then (30 min)

Run the **Owner pilot checklist** at the bottom of `PROGRESS.md`:

1. Agency admin → `/sales/new-client` → test company + client member
2. Client magic link → lands on `/client`
3. Client request → agency drafts → client approves in portal
4. Auto-publish sim path (audit / queue; live flags stay OFF)
5. Token `/approve/[token]` still works
6. `/signup` shows invite-only

## Never during the chain

- Paste migration **0028**
- Set `PUBLISHING_LIVE=true` or `ADS_LIVE=true`
- Manually launch M17/M18/M19 (M16 does this)

## If something stalls

Check `PROGRESS.md` **P0 orchestration state** — which flag is not `yes` yet?  
Re-launch only the **stuck** agent using its prompt file in `docs/parallel/`.
