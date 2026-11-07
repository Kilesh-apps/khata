# Khata — how it works

A personal money ledger. Static PWA on GitHub Pages. No server, no database. The Content-Security-Policy only allows connections to this site and, for optional AI bill reading, api.anthropic.com.

## First-time setup

1. Create a **public** repo (GitHub Pages on a free account needs public). Only the code is public; your data never leaves the phone.
2. Upload every file in this folder to the repo root (not the folder itself) and commit.
3. Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.
4. Wait for the green ✓ in the Actions tab, then open `https://<user>.github.io/<repo>/` on the phone.
5. Android Chrome: ⋮ → Install app (or Add to Home screen). Open it from the home screen once while online, then it works offline.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole app. Data lives in `localStorage` on the phone. |
| `xlsx.js` | Builds the Excel export (formulas, charts, hidden backup sheet) and reads it back for restore. No libraries. |
| `tesseract*.js`, `eng.traineddata.gz` | Offline bill reader (tesseract.js 7, Apache-2.0, see `LICENSE-tesseract.md`). Kept next to `index.html` (no folders) so they can be uploaded from a phone. |
| `Code.gs` | Apps Script (version 3) for the optional Google Sheets sync and Drive backups. Not used by the app itself. |
| `sw.js` | Caches the app for offline use. **Bump `CACHE` (`khata-v28` → `khata-v29`) on every update.** |
| `manifest.webmanifest` | Install info, home-screen shortcuts, and the Android share target for bank SMS. |
| `icon-*.png` | App icons. |

## Storage keys

| Key | Contents |
|---|---|
| `khata.data` | Everything, as plain JSON (when no PIN is set). |
| `khata.enc` | Everything, AES-GCM encrypted (when a PIN is set). Key = PBKDF2-SHA256, 310k iterations. |
| `khata.meta` | Lock on/off and the salt. Holds no financial data. |

## Main ideas

- Money is stored in paisa (integers) to avoid rounding drift. Display uses lakh grouping (1,00,000).
- Every account has a balance. Credit cards hold a negative balance (what you owe).
- Spending counts when you swipe or scan, not when you pay the card bill. Paying a card is a transfer, so it never double-counts.
- Card dues: Khata takes the statement day and "days to pay after it", reads what you owed at the last statement, subtracts payments since, and shows what's left and by when.
- Transfers (including ATM withdrawals and card payments) have a Fee or charge field. The fee comes out of the sending account and is logged as Fees & charges spending, linked to the transfer (edited and deleted with it). Khata suggests the last fee used on the same route.

## Groups (bill splitting)

- One group per circle of friends. Each keeps its own balances.
- A split bill counts only **your share** as spending. If you paid, your account drops by the full amount and friends owe you the rest.
- Settle up always shows the fewest payments (searches every grouping for up to 15 people).
- Recording a payback moves money in or out of your account but is never counted as spending or income.

## Garage

- Vehicles with fuel fills, services and other costs (insurance, bluebook, tyres). Optional link to spending: pick an account and the cost also appears as Fuel or Vehicle service spending.
- Mileage is fill-to-fill: the litres you put in at a fill cover the distance since the previous fill. The average (total km ÷ litres, first fill excluded) is the reliable figure.
- Fuel on the Add screen: choose Fuel and a vehicle row appears (ODO, litres). One save logs both.
- Import from Diarium: Word (.docx) export. Reads Petrol / Servicing / Bike / Car tags, ODO, Rate, Litres, Total price, and attached photos. Journal entries are skipped.

## Safety rules

- No erase option on the lock screen. Erase everything (Settings) needs the app PIN or fingerprint (or the amounts PIN when there is no lock) and typing ERASE.
- Changing the PIN, turning the lock off and restoring from a file also need the current PIN or fingerprint.
- Five wrong PINs on the lock screen start a wait (30 s, doubling each miss, up to 1 hour).
- Closing a popup only ever steps back over the popup's own history entry, so it can't leave the app.

## PIN reset (recovery key)

- Setting the first PIN shows a recovery key (8 groups of 4). Settings → Privacy → Recovery key makes a new one.
- How it works: an RSA key pair is made on the phone. The public half encrypts the current PIN, and every new PIN when it changes, so the key keeps working. The private half is stored encrypted with the recovery key.
- Lock screen → Forgot your PIN? → Reset it: use the recovery key (or fingerprint, if fingerprint unlock is on), then set a new PIN. Wrong keys count towards the same wait as wrong PINs.

## Monthly plan and payday routine

- `S.plan`: `{salary (paisa), lines: [{id, name, kind: 'spend'|'fund', amt, cats, subs, veh: 'bike'|'car', flex}], steps: [{id, name, kind: 'mark'|'xfer', amt, from, to, line}], marks: [{step, p (period start), amt, at}]}`. Seeded with Travel fund 15,000, Snacks and friends 8,500 (the same setting as Safe to spend), Festivals and gifts 5,000, Bills and bike 4,500, Gadget fund 3,000, Hair, skin and clothes 2,500, Car fuel and buffer 1,561; salary 79,561. Invest = salary (received this month if logged, else planned) minus all lines.
- Spending goes to the first line that matches. Fuel and vehicle service go to the line set to that vehicle's type (car, or bike for everything else and for fuel with no vehicle). Unmatched spending shows as "Outside the plan".
- Fund steps (`mark`) only record that the money is set aside in the main account; no transfer. Transfer steps (`xfer`) create a transfer tagged `payStep`. A step is done when this period has its mark or tagged transfer.
- Saving income in Salary opens the payday checklist. Plan → Monthly plan → Payday checklist opens it any time.
- New account type `invest` (Investment: SIP, RD, FD): shown in its own section, not counted in "You have"; transfers into it count as Invest, never spending.
- Excel has a Plan sheet; the Sheet gets a Plan tab. Without income, the Salary and Invest rows are left out (Invest would reveal the salary).

## Sheet Summary tab (Code.gs v4)

- The phone sends a `summary` object with each sync, built from the same data and redaction as the readable tabs: headline numbers, short analysis lines and six small tables (plan vs actual, categories, 12 months, days, payment methods, mileage). Code.gs writes the Summary tab, moves it to the front and rebuilds six charts. A chart error never fails the sync; the backup is stored first.
- Tip: set the spreadsheet's locale to English (India) (File → Settings) for lakh grouping in the sheet.

## Safe to spend today

- `S.set.flex`: `{on, name, amt (paisa), cats: [category ids], subs: [type ids from other categories]}`. Defaults: "Snacks and friends", Rs 8,500, Food & drinks and Going out (all their types, including the new Junk food type).
- Add screen card: (amount − my share of this period's spending in those categories) ÷ days left including today, rounded down to whole rupees, never negative. Over the amount: "Over by Rs X this month." While typing an amount in a counted category, the card shows the effect: "Safe today Rs 340 → Rs 115 after this".
- Uses the month start day, respects hidden amounts, recalculates on every add, edit, delete and undo. Settings live on the Plan tab (Safe to spend card). Included in all backups; the Sheet's Budgets tab and the Excel Summary get a "(safe to spend)" row.

## Category types (subcategories)

- `S.subs`: `{id, parent, name, icon, hidden}`. Entries and split bills store `sub`. Seeded for Shopping (Clothes & shoes, Electronics, Equipment & tools, Home & furniture, Personal care, Online orders, Books), Food, Groceries, Transport, Bills, Phone & internet, Health, Family, Going out, Subscriptions and Fees.
- Add screen: picking a category shows its types as a scrolling row (optional), with + to add one. Notes remember the type too.
- History → Overview: tap a category for its breakdown by type. Filters offer types when one category is picked. Excel and Sheets have a Subcategory column.

## Account pages

- Accounts → tap an account: summary, actions, and every entry in or out of it per month, with the balance (or amount owed) right after each entry.

## Transfer fees

- Transfers and ATM withdrawals have a Fee or charge field. The fee comes out of the sending account and is logged as Fees & charges spending, linked to the transfer (edit or delete together). The last fee for the same route is suggested.

## Fingerprint unlock

- Settings → Privacy → Unlock with fingerprint (needs PIN lock on). Uses the WebAuthn PRF extension: the fingerprint check returns a secret only this phone's authenticator can produce; that secret encrypts a copy of the PIN in `khata.meta`. Unlocking decrypts the PIN and opens the data as usual.
- The credential is device-bound (`residentKey: 'discouraged'`), so it isn't saved as a synced passkey and normally doesn't ask for the Google Password Manager PIN.
- If the browser can't do PRF, Khata offers a simpler mode: a non-extractable AES key in IndexedDB encrypts the PIN and is only used after a fingerprint check (WebAuthn user verification). It stops someone holding the phone, not someone who can run code in the browser. It survives PIN changes; PRF mode is turned off by a PIN change.

## Bill photos

- Resized to 1400 px and saved as JPEG (about 70 KB each in testing) in IndexedDB on the phone, encrypted with the PIN when a lock is set.
- Included in the backup (.json) file; not in the Excel file.
- Share sends a copy to any app (e.g. Telegram Saved Messages). Khata never uploads photos itself, except a bill photo you choose to read with AI.

## Reading bills

- **On the phone (default):** Tesseract OCR (tesseract.js 7.0.0, core 7.0.0, English `best_int` model), files in the repo root. Loaded only when first used, about 7 MB, then cached by `sw.js` in its own cache (`khata-ocr-v2`) that survives app updates. Settings → Reading bills → Download makes it ready offline in advance.
- **AI (optional):** Settings → Reading bills → turn on, paste an Anthropic API key. The bill photo is sent to `api.anthropic.com` directly from the phone. The key is stored on the phone (encrypted when a PIN is set) and stripped from every backup and Excel file.
- Results are always suggestions: pick the total, or open **Split by items**, tick who had each item; tax, service charge and discount are shared in proportion.
- CSP allows `'wasm-unsafe-eval'` (needed for the OCR engine) and `connect-src https://api.anthropic.com` (only used when AI reading is on).

## Google Sheets sync and Drive backups (optional)

`Code.gs` (script version 3) runs as a web app in your Google account. Setup steps are at the top of the file. **After any change to Code.gs: paste it, Save, run `setUp` once from the editor (grants new permissions such as Drive), then Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Saving alone keeps the old version running.

**What is stored**
- Drive folder **Khata backups**: `latest.json`, `daily-YYYY-MM-DD.json` (last 14 days) and `monthly-YYYY-MM.json` (last 12 months). Each file is the full backup encrypted on the phone with the PIN (AES-GCM, PBKDF2 key), plus plain metadata: time, app version, entry count, SHA-256 of the encrypted backup. Daily and monthly files are the **first** good sync of that day or month and are never overwritten; `latest.json` follows every sync. Older files are moved to the Drive trash automatically. On the first v3 sync, the old single-tab backup is saved as `before-v3-DATE.json` before anything is written.
- Drive folder **Khata photos**: one file per bill photo, `{salt, iv, ct}` encrypted on the phone with the PIN key. Only new photos are uploaded (batches of 8). Photos no longer used are removed once a month. After a PIN change, photos are re-uploaded under the new PIN.
- Sheet tabs Entries, Monthly, Budgets, Groups, Fuel, Service (readable; never bank balances; income only if switched on) and **Backup log** (time, kind, version, entry count, hash). Tabs are written only after the backup is stored.
- Script properties: the recovery code, the latest metadata, folder ids.

**Safety rules**
- Recovery code required for every read and write. Hash checked on upload (script) and on download (phone).
- Shrink guard, both sides: if the entry count (entries + split bills + payments + vehicle logs) drops more than 10% or to zero against the last backup, the phone doesn't sync and asks "Your data looks smaller than your last backup. Sync anyway?"; the script refuses too unless the request has `force: true`, which the phone only sends after the PIN or fingerprint. This also stops a fresh phone from overwriting the backup.
- No upload when nothing changed (hash of the data without sync settings), except a daily heartbeat so "last successful sync" stays meaningful.
- Restoring keeps an encrypted copy of the replaced data on the phone (Settings → Data → Undo last restore).

**Phone side**
- Settings → Google Sheet backup: last successful sync, last backup test, Sync now, **Test my backup** (downloads latest, checks the hash, decrypts in memory, compares entry count and newest entry; never changes local data), **Restore a backup** (pick any version, preview, then PIN or fingerprint), bill photo backup switch and progress.
- Home screen banner if the last successful sync is more than 3 days old or sync is paused by the shrink guard.
- Limits: Apps Script stops a single run after 6 minutes, so photos go in batches; Drive storage is about 75 KB per photo and about 330 KB per backup copy at 1,300 entries.

## Excel export

Sheets: Summary (totals, category table with budgets, three charts), Entries, Monthly, Accounts, Groups, Vehicles (mileage and rate charts), Fuel, Service, and a hidden `_khata` sheet holding the full backup. Change the period dates on Summary and the totals recalculate. Restore accepts this file even after Excel re-saves it. It is **not encrypted**, so it never contains bank, wallet or cash balances, and leaves out income unless Settings → Include income in Excel is on: opening balances are zeroed and balance corrections dropped (restoring on the same phone keeps the balances already there; on a new phone, set them with Fix balance).

## Fast entry

- Add screen opens on the keypad: amount, category, save. Account and method default to what you use most.
- Shortcuts (Plan tab) fill everything for repeat spends like tea or bus fare.
- Android: share a bank SMS to Khata (share target), or copy it and tap **SMS** on the Add screen. iPhone: copy, then tap **SMS**.
- Long-press the home-screen icon for "Add expense" and "Move money".

## Updating

1. Edit `index.html`.
2. Bump `CACHE` in `sw.js`.
3. Upload and commit. Check Actions shows a green ✓.
4. Reopen the installed app twice.
