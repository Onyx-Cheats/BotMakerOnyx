# TODO

- [x] Publish the supplied ZIP as a website and preserve its ONYX dashboard, navigation, assets, responsive layout, and command-building controls.
- [x] Add the Telegram server, encrypted BotFather-token storage, HTTPS webhook verification, and per-bot private management links; remove Manus sign-in.
- [x] Implement existing-token upsert, toast results, the immutable `MADE WITH @onyxbotsofficial` `/start` footer, and the 20 documented command variables with **Use** buttons.
- [x] Keep the approved Autoscale mode; Always On was refused because owner membership is required, so the server may sleep while idle and cold-start.
- [x] Publish the latest dashboard fixes and verify production pages, route manifest, and server health.
- [ ] Make `@Botmarkerso_bot` itself a beginner-friendly bot builder: `/start` shows an emoji-rich inline menu for **Create a bot**, **My bots**, and **Help**; `/newbot` guides the user through bot name, welcome text (or `/default`), then BotFather token; `/cancel` stops the flow. Accept creation/token input only in private chat, clearly explain how to get a token from `@BotFather`, and never process or persist group-chat tokens.
- [ ] When a user submits a valid BotFather token in the private wizard, validate it, create or update that bot on this server using encrypted storage and a production HTTPS webhook, preserve the bot ID for an existing token, and send that user their private management link. Do not echo or log the token; best-effort delete the token message after handling it.
- [ ] Make **My bots** list only the current Telegram user's bots, with status/analytics and a way to issue a fresh private management link that invalidates the previous link; never send another user's bot link or any private link to a group.
- [ ] Register clear Telegram command-menu entries and callback buttons; add only additive, expiring, hashed wizard state that never stores raw tokens or raw creator IDs. Keep advanced per-bot settings on the secure dashboard link.
- [ ] Enable builder mode only for the already-connected `@Botmarkerso_bot` through the additive migration, publish the new checkpoint, and verify the production server and menu without creating fake bots or using a test token.
