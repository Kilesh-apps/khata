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
| `sw.js` | Caches the app for offline use. **Bump `CACHE` (`khata-v16` → `khata-v17`) on every update.** |
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
- ATM withdrawal = transfer from bank to Cash, with an optional fee logged under Fees & charges.

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

## Bill photos

- Resized to 1400 px and saved as JPEG (about 70 KB each in testing) in IndexedDB on the phone, encrypted with the PIN when a lock is set.
- Included in the backup (.json) file; not in the Excel file.
- Share sends a copy to any app (e.g. Telegram Saved Messages). Khata never uploads photos itself, except a bill photo you choose to read with AI.

## Reading bills

- **On the phone (default):** Tesseract OCR (tesseract.js 7.0.0, core 7.0.0, English `best_int` model), files in the repo root. Loaded only when first used, about 7 MB, then cached by `sw.js` in its own cache (`khata-ocr-v2`) that survives app updates. Settings → Reading bills → Download makes it ready offline in advance.
- **AI (optional):** Settings → Reading bills → turn on, paste an Anthropic API key. The bill photo is sent to `api.anthropic.com` directly from the phone. The key is stored on the phone (encrypted when a PIN is set) and stripped from every backup and Excel file.
- Results are always suggestions: pick the total, or open **Split by items**, tick who had each item; tax, service charge and discount are shared in proportion.
- CSP allows `'wasm-unsafe-eval'` (needed for the OCR engine) and `connect-src https://api.anthropic.com` (only used when AI reading is on).

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
