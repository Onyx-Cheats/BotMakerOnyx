# Onyx Bot Builder — guided Telegram creator plan

## Approved product behavior

Turn the already-connected `@Botmarkerso_bot` into a beginner-friendly bot-creation assistant. Its `/start` presents an emoji-rich inline menu with **Create a bot**, **My bots**, and **Help**. `/newbot` runs a short guided flow for bot name, editable welcome text (or `/default`), then a BotFather token; `/cancel` stops it. The bot-creation conversation is private-chat only. In groups, do not process or persist tokens and direct users to the bot's private chat.

A submitted token is validated with Telegram `getMe`, passed directly to the existing encrypted upsert/webhook flow, and never written to wizard state or logs. Token-like input is also rejected from name and welcome steps. Best-effort delete the incoming token message after processing. Re-entering an existing token updates that bot, preserves its ID, redeploys it, and rotates its management link. Return the link only to the creating user's private chat. `/mybots` lists only bots associated with that Telegram account and can issue a fresh private management link; link rotation invalidates the previous one. Child bots retain the editable `/start` message, fixed `MADE WITH @onyxbotsofficial` footer, commands, analytics, and full web dashboard.

## Security, persistence, and runtime

Use an HMAC of the parent-bot ID and Telegram user ID for creator ownership; never store raw Telegram user/chat IDs for this purpose. Persist only wizard step/name/welcome text, keyed by parent bot plus creator hash, with a short expiry. BotFather tokens exist only in the incoming update and request memory, then are encrypted with the existing AES-256-GCM key and bot/owner associated data. Do not echo tokens. Never expose a bot's private link in group chat or to another creator.

Use an additive migration for builder enablement, explicit public origin, and expiring wizard state. Store the production HTTPS origin on bots so webhook registration from the parent bot can safely create child-bot webhooks without deriving a public URL from an internal request host. Backfill the known published origin and enable builder mode only for the already-connected `@Botmarkerso_bot` by exact Telegram username; do not enable other existing bots. Register Telegram command menus and callback queries. Retain webhook-update dedupe rows for eight days and prune them periodically, preserving recent in-flight updates. Keep creation/upsert/redeployment on the existing Express/MySQL service; the database is shared by development and production, so avoid fake bot rows and destructive tests.

## Project structure

- `server/index.mjs`: builder-mode routing, private-chat wizard dispatch, owner-scoped bot listing/link rotation, and existing webhook/database operations.
- `server/builder.mjs` and `server/builder-runtime.mjs`: privacy-preserving owner hashes, safe defaults/validation, private wizard state machine, Telegram menu/callbacks, and owner-only dashboard actions.
- `server/telegram.mjs` and `server/crypto.mjs`: Telegram Bot API requests and existing encrypted token, HMAC, and secret helpers.
- `db/migrations/004_telegram_builder.sql`: additive origin/builder fields, query index, and short-lived token-free wizard-state table.
- `test/`: isolated tests for owner hashing, private-chat enforcement, callback parsing, token redaction, safe defaults, and management links without real BotFather tokens or shared-database test writes.
- `README.md`, `TODO.md`: document setup steps, private-chat token warning, and available builder commands.

Preserve the existing ONYX visual dashboard, per-bot private management links, encrypted token storage, fixed `/start` branding, and approved Autoscale hosting. Always On remains membership-gated; do not add keep-alive traffic. The migration enables only the existing parent bot, then publish the updated hybrid website/server.