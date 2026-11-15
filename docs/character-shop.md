# Character shop

Run `backend/sql/character_shop.sql` in the project's Supabase SQL Editor, then reload the landing page. No new environment variables or Express endpoints are needed: the shop uses the existing authenticated Supabase client.

The Shop button sits next to the username. Guests are directed to login. The dialog shows the account's current coin balance, character portraits, prices, ownership and All / Owned / Not owned filters. Pepper, Mint and Sage are free for every account. Initial prices: Phong 500, Khá Bảnh 800, Trump 1000, Faker 1200, Ronaldo 1500 coins. Edit `public.shop_characters.price` to change prices after setup; rerunning the migration preserves edited prices.

Purchases use `auth.uid()` and database prices. A profile row lock serializes purchases, and inserting ownership and subtracting coins happen in one transaction. Repeating an owned purchase does not charge again. Free characters are considered owned automatically. Missing profile, missing setup, insufficient funds and request errors are displayed in the dialog; the UI does not invent a balance or ownership when loading fails.

Manual validation after applying SQL:

1. Open Shop while logged out; verify login is required.
2. Log in, open Shop and compare the balance with `profiles.coins`.
3. Verify the three free chefs appear in Owned and the other five appear in Not owned for a new account.
4. With fewer than 500 coins, verify Phong cannot be purchased. Set test funds through the SQL Editor, close and reopen the shop, then buy Phong.
5. Verify the balance drops by exactly 500, Phong moves to Owned, and both remain correct after refreshing.
6. Try purchasing the same character simultaneously from two tabs; verify a single ownership record and a single deduction.
7. Check Escape, the close button, backdrop clicks, keyboard focus and a narrow phone viewport.

Character pickers now restrict access to owned characters in single player, local co-op and online lobbies. Guests get Pepper, Mint and Sage; both local players use the signed-in account's collection. Purchased access is verified from Supabase when entering selection/game pages; when unavailable only free chefs are allowed. Old unowned story choices require reselection without losing story progress, and direct offline game routes validate the lineup too. Tutorial falls back to Pepper for an unowned saved preference.

Online selection also checks ownership on the server. Saved room choices and socket rosters are sanitized before use. Run the updated backend locally or deploy it for these server checks to take effect. No additional SQL beyond the shop setup is required. Offline restrictions run in the browser and are not protection against a modified game client. Before real-money use, existing permissions for updating `profiles.coins` must also be audited.

## Demo coin top-ups

Run `backend/sql/coin_topup.sql` after `character_shop.sql`. Open Shop, click **+ Top up coins**, select a package and confirm the demo top-up. The interface explicitly says no payment is taken. Illustrative packages: 100 coins / 10,000 VND; 220 / 20,000; 600 / 50,000; 1,300 / 100,000. The database owns the amounts and awards the coins; the browser sends only the package ID and request ID.

The balance and latest five demo top-ups update after success. Top-ups and purchases share the profile row lock. Repeating the same request ID credits only once; reuse with another package is rejected. An unresolved request ID is kept in session storage per account so reopening the dialog or reloading the same tab can retry safely. Database history and balance persist across sessions.

Validate against Supabase after applying SQL: top up each package and compare the balance delta with the ledger; retry an identical request and verify no extra credit; try an invalid package and unauthenticated request; buy a character after a top-up; check two concurrent tabs; disable demo mode and verify new requests fail without changing balance. Local build/lint do not validate these database operations.

Disable free demo grants before connecting real payment:

```sql
update public.coin_topup_settings set demo_enabled = false where id = true;
```

Real payment still requires a selected payment provider and server-verified payment notifications. Never turn `demo_coin_topup` into a real-payment success callback.
