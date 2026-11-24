# Schema session agenda (U2a, step 4)

**Who:** all three team members, at one screen.
**How long:** 90 minutes.
**Goal:** agree on every table the gym system stores and the columns in each one, and write the decisions in the log at the bottom of this file.

The database is built once, at the start, and every later unit (U3 to U13) stores its records in these tables. A column that is missing now is hard to add later, because records saved before the change would not have it. That is why the whole team decides this together.

## Before the session

Each person reads these parts of the [plan](../plans/2026-09-15-0946-feat-jeyos-gym-management-system-plan.md):

- Requirements R6 to R27 and R44 to R62
- Acceptance examples AE1 to AE16
- Key technical decisions KTD7, KTD8, KTD9, and KTD18

Write down anything you don't understand, and bring it.

## Roles

- **Facilitator:** reads each question aloud and keeps the discussion on the current table.
- **Note-taker:** writes each decision and its reason in the decision log. Pick someone other than Nathan, so a second person holds the record.
- **Timekeeper:** calls time when a block runs over. An unresolved question goes to the "Still open" list instead of stalling the session.

## Words used in this agenda

| Word | Meaning | Gym example |
|---|---|---|
| Table | One kind of record, like a sheet in a spreadsheet | The payments table |
| Row | One record in a table | One ₱800 payment |
| Column | One piece of information every row has | The payment's amount |
| Foreign key | A column that points at a row in another table | A check-in's `member_id` points at a member |
| Unique rule | The database refuses two rows with the same value | Two payments can't share one GCash reference number |
| Void | Marking a record as cancelled without deleting it | The owner voids a sale typed by mistake |
| Snapshot | A copy of a value taken at the time of the record | The plan price on a renewal, kept even after the owner changes the price |

## Starting draft: Deimos's tables

Deimos designed 12 tables in PostgreSQL (pull requests #13, #14, and #18). The plan uses SQLite instead, because the system runs offline on the gym PC (KTD2), so those files can't be used as they are. The team used them as the starting draft and accepted this table as the final schema design (see the decision log).

| Deimos's table | Plan's table | What stays | What changes, and why |
|---|---|---|---|
| `members` | members (block 3) | Name, phone number, email, and a random QR value (meets R53) | Drop the stored expiry date and plan: the plan works out a member's expiry from the membership ledger (KTD8). Drop the password: member logins are an extra that runs on the online service, not the gym PC (U18). Add the photo, consent, and erased state. |
| `staff` | accounts (block 2) | Name, phone number, password hash, role | Drop the `coach` role, because trainer features wait for a later version. Add which method produced the password hash (KTD5), a disabled state (R50), and a sign-in name. |
| `plan` | plans (block 3) | Name, price, length | Store the price in centavos (KTD7). Store the length as a number and a unit, days or months (R6). Add a retired state. |
| `payment` | payments (block 4) | Amount, method, reference number, staff | Store the amount in centavos. Change the methods from cash, GCash, and bank transfer to cash, GCash, and Maya (R27). Require the reference number only for e-wallet payments. Replace the status with the voided state. Add the payment kind: membership, day pass, or sale. Drop the coaching link. |
| `check_in` | check-ins and rejections (block 5) | Member, time, staff | Refused scans (expired, duplicate) go in the rejections table (R58). Add the check-in kind, scan or override (KTD8), and where it came from, door or desk. A check-in can belong to a day pass instead of a member. Add a unique rule for once per day (AE15). |
| `product` and `protein_powder` | products and add-ons (block 6) | Name, stock count, low-stock level, price | One products table with a type column: sealed item, or menu item for shakes and coaching. Add-ons (banana, egg) move from one text column to their own table with prices (R24). Keep the unit cost as an optional amount paid on each restock (decision log, block 6). |
| `product_sale` | sales and sale lines (block 6) | Quantity, staff, time | A sale had one product. The plan's sale has lines, and each line keeps its own price snapshot and chosen add-ons. |
| `stock_movement` | stock movements (block 6) | Almost everything | The reasons become restock, sale, void, and correction (R63). |
| `coaching_package`, `coaching_enrollment`, `coaching_session` | None | Nothing | Left out: the plan moves trainer features to a later version. |

**Tables the plan needs that the draft doesn't have yet:** membership ledger, rejections, door events, day passes, settings, system state, audit log, personal values, consent, sale lines, and add-ons.

**Changes to every table:** money becomes whole centavos instead of decimals, times are stored in UTC (block 1, question 1), and counting IDs become SQLite's `integer primary key`. Every record also gets the shared columns from block 1. Deimos's foreign keys have no cascading deletes, which already matches the plan.

## Agenda

| Time | Block |
|---|---|
| 0 to 10 min | 1. Rules for every table |
| 10 to 20 min | 2. Accounts, system state, settings |
| 20 to 35 min | 3. Plans, members, consent |
| 35 to 50 min | 4. Membership ledger and payments |
| 50 to 65 min | 5. Check-ins, rejections, door events, day passes |
| 65 to 78 min | 6. Products, sales, stock |
| 78 to 85 min | 7. Audit log and login tables |
| 85 to 90 min | 8. Wrap-up |

## 1. Rules for every table (10 minutes)

**Already decided in the plan:**

- Money columns hold whole centavos and end in `_centavos` (KTD7).
- Every record the staff enter has the shared columns from U2's approach (step 2) and KTD7: the original time and the entry time (both in UTC), the Manila date, the entry mode (`normal` or `after_outage`), and whether it is voided. It also records the account that entered it (R18, R27).
- Nothing is deleted. Records are voided, plans are retired, and accounts are disabled. The one exception is erasing a former member's personal data (R62).
- No cascading deletes: deleting one row never silently deletes rows that point at it.

**Decide together:**

1. SQLite has no date type. Do we store times as text (`2026-09-15T16:00:00.000Z`) or as a number of milliseconds? Which is easier to read when you open the database file to debug?
2. Is "voided" one yes/no column, or do we also store who voided it, when, and why? Or does the audit log (block 7) hold the who, when, and why?
3. Do rows get plain counting IDs (1, 2, 3), or random IDs? Hint: member codes and day passes already get their own random tokens (R53).
4. Naming: plural table names in `snake_case` (`sale_lines`) and columns in `snake_case` (`created_by_account_id`)?

## 2. Accounts, system state, settings (10 minutes)

**Accounts** (R3, R4, R49, R50, R52; built in U3)

1. What does every account need? Think about the name shown on records, the sign-in name, the role, the password, and the disabled state.
2. KTD5 says each stored password records which method produced it. What column holds that?
3. If the owner renames a staff member, should old payments show the old name or the new one?
4. Can there be more than one owner account?

**System state** (KTD7 clock guard; used in U2b)

5. This table has exactly one row. What goes in it? At minimum: when the owner last confirmed the PC's clock. Anything else?

**Settings** (KTD18; built in U2c)

6. Each setting is a key and a value, like `walkins.dayPassPriceCentavos` and `8000`. Do we also store who changed it last and when, or is the audit log enough?

## 3. Plans, members, consent (15 minutes)

**Plans** (R6, R7, R60; built in U7)

1. A plan has a name, a price, a length, and a unit (days or months). What else?
2. Can a retired plan and a new plan share the same name, for example two plans both called "Monthly"?

**Members** (R8, R9, R44, R53, R59, R62; built in U4 and U8)

3. Which contact details do we store: phone, email, address? Which are required? Hint: expiry reminders (R38) need a phone number or an email.
4. The photo lives in a folder, not in the database (KTD2). What does the member row store about it?
5. The member code is printed on the card. Do we store the code as-is, or only a scrambled (hashed) version? The door scan has to look it up quickly.
6. When a code is replaced (R9), is the old code overwritten, or kept in a separate table so the desk can tell a replaced code from a made-up one?
7. After an erasure (R62), payments and check-ins stay as anonymous records. Does the member row stay with its personal columns blanked, or does something else replace it?

**Consent** (R8)

8. The plan says each consent points to a versioned consent text (U4). Members agree to three things: storing their data, the online backup, and reminders. Is that one yes/no, or three?
9. What does a consent row record besides the answers? Think about the date, the staff account, and which version of the text they saw.

## 4. Membership ledger and payments (15 minutes)

**Membership ledger** (R11, R44, R47, R55, KTD8; built in U4 and U7)

1. **Where is a member's expiry date stored?** Read KTD8 before answering.
2. Do carried-over entries (R44) and renewals share one table, or live in two?
3. A renewal copies the plan's length, unit, and price at that moment (R7). These columns can't be added later. Are all three there?
4. How does a renewal row connect to the payment that paid for it?
5. The plan allows one non-voided carried-over entry per member. Which unique rule enforces that?

**Payments** (R27, R48, KTD19; built in U6)

6. Which kinds of payment exist: membership, day pass, sale? Anything else?
7. Method: `cash`, `gcash`, `maya`? Or `cash` and `e_wallet`, plus a separate provider column?
8. U6 checks reference numbers after trimming spaces and ignoring upper and lower case. Do we store only what staff typed, or also a cleaned-up copy for the "already on file" check?
9. Can the reference number of a voided payment be used again?

## 5. Check-ins, rejections, door events, day passes (15 minutes)

**Check-ins** (R15 to R18, R57, KTD8; built in U5)

1. KTD8 names two kinds of check-in: scan-using and override. What columns tell them apart, and where did the check-in come from (door or desk)?
2. A check-in belongs to a member **or** a day pass, never both. How do the columns show that?
3. AE15: the door and the desk check in the same member at the same moment, and only one may succeed. KTD8 says a unique rule does this. Which columns does the rule cover, and which rows does it ignore?
4. An override points at the rejection it overrode (R58). Which column holds that?

**Rejections and door events** (R58, KTD10)

5. A rejection stores a shortened copy of what was scanned. What else: the reason, the device, the time?
6. Why does KTD10 want one door-event sequence shared by accepted and rejected scans? What would the desk screen get wrong with two separate numberings?

**Day passes** (R19, R20, R21, R53; built in U9)

7. A pass has a random token, the Manila date it is valid for, and a link to its payment. What else?
8. The door accepts a pass once (R20), but the desk can re-admit the holder later that day. Where is each of those recorded?

## 6. Products, sales, stock (13 minutes)

**Products and add-ons** (R22, R24; built in U10)

1. Sealed items have a stock count and a low-stock level. Shakes have neither. One products table with a type column, or two tables?
2. Do add-ons (banana, egg) belong to specific shakes, or can any shake take any add-on?

**Sales and sale lines** (R23, R24, R25)

3. A sale has lines: one shake with add-ons, one energy drink. Each line keeps a price snapshot. Where do the chosen add-ons and their snapshot prices go?

**Stock movements** (R23, R26, U10)

4. Every stock change is a movement with a kind: sale, restock, void. Any other kinds?
5. U10 keeps both a stock count on the product **and** the list of movements, updated together. What must always be true about the two?
6. A restock builds purchase history (R26). Do we record only the quantity, or also what the gym paid? If the cost, that question goes to the owner.

## 7. Audit log and login tables (7 minutes)

**Audit log and personal values** (KTD9, R41, R59, R62; built in U2c)

1. KTD9 lists the audit row's columns: the table and row it describes, the action, the account, the action time, and the Manila date of the changed record. Anything missing?
2. Before-and-after values that contain personal data go in the separate personal-values table. Why separate? Hint: R62.

**Login tables** (U3)

3. U3 needs sessions, paired devices, one-time codes, and sign-in attempt counters. Do these tables go in this first migration, or in U3's own pull request? Hint: KTD17 wants the Phase 3 tracks to avoid competing migrations, and U3 comes before those tracks.

## 8. Wrap-up (5 minutes)

1. The note-taker reads every decision back. Anyone who disagrees says so now.
2. List the questions for the gym owner (a starting list is below).
3. Next steps:
   - Nathan writes the schema files and the first migration from the decision log, in step 5 of U2a. Done: the schema files are in `packages/domain/src/schema/`, and every table decision in the log says "Recorded in step 5". The foundation migration (`packages/server/src/db/migrations/gym/`) also inserts the one system state row (block 2), and the local-only file's first migration is in `packages/server/src/db/migrations/local-only/` (decision log, block 8). `packages/server/src/db/migrations.test.ts` runs both on real files.
   - The U2b and U2c owners check that the settings, system state, and audit tables match what their units need.
   - The pull request for U2a links this file as the record that the team agreed.

## Questions for the gym owner

Add to this list during the session.

- Which contact details should members give: phone, email, or both?
- For members carried over from the logbook, how do they give consent to storing their data (R8, R44)?
- ~~Should restocks record what the gym paid, or only the quantity?~~ Decided by the team: the amount paid is optional on each restock.
- ~~Are GCash and Maya the only e-wallets customers use?~~ Answered: yes, the semi-manager confirmed GCash and Maya (Week 3 interview).

## Decision log

| Block | Question | Decision | Reason |
|---|---|---|---|
| All | Do we use Deimos's tables as the schema? | Yes. The whole team accepted the starting draft above, with every change in its right-hand column, as the final schema design. | The draft covers Deimos's design and the plan's rules in one place, and the team agreed on it. |
| 1 | How are times stored? (question 1) | As UTC text, like `2026-09-15T16:00:00.000Z`. Manila dates are text too, like `2026-09-16`. | Readable when you open the database file to debug, and text in this format sorts in time order. Recorded in step 5. |
| 1 | What does a voided record store? (question 2) | One yes/no `voided` column. Who voided it, when, and why go in the audit log. | The audit log is written in the same transaction as the void (KTD9), so the details are never missing, and they aren't stored twice. Recorded in step 5. |
| 1 | Counting or random IDs? (question 3) | Counting IDs (SQLite's `integer primary key`), as the starting draft says. | Member codes and day passes get their own random tokens (R53), so the row IDs don't need to be secret. Recorded in step 5. |
| 1 | How are tables and columns named? (question 4) | Plural `snake_case` table names (`sale_lines`) and `snake_case` column names (`entered_by_account_id`). | Matches the starting draft. The TypeScript names are camelCase (`enteredByAccountId`). Recorded in step 5. |
| 2 | How do owner and staff sign in? | With a sign-in name and password, not an email address. The accounts table gets a unique sign-in name column. | Setup and sign-in happen on the gym PC and the gym Wi-Fi without internet, so no email can be sent or checked. A forgotten password is reset with the recovery code (R49) or by the owner (R50). Recorded in step 5. |
| 2 | Do sign-in names care about upper and lower case? | No. `Lee` and `lee` count as the same sign-in name, so the database refuses the second one. | Two accounts whose names differ only in case would confuse staff at sign-in. Recorded in step 5. |
| 2 | What does every account need? (question 1) | A display name, shown on screens and copied onto records, plus a sign-in name, the role (`owner` or `staff`), the password hash, and a disabled yes/no. | R3 and R50. Accounts are disabled, never deleted, so past records keep pointing at them. Recorded in step 5. |
| 2 | Which column records the password method? (question 2) | `password_hash_method`: `argon2id`, or `bcrypt` if the argon2 install fails. | KTD5. Sign-in reads it to know how to check the password. Recorded in step 5. |
| 2 | If the owner renames a staff member, do old payments show the old name or the new one? (question 3) | The old name. Every record stores the entering account and a copy of its name at that time. | Team decision. Old records show who did the work under the name they had then, like a price snapshot (R50). Recorded in step 5. |
| 2 | Can there be more than one owner account? (question 4) | No. Exactly one owner account, used only by the owner. Nothing can add a second owner or give a staff account the owner role. | Team decision. Recorded in step 5. |
| 2 | What goes in the one system state row? (question 5) | When the owner last confirmed the PC's clock and which account did it, plus the latest entry time of any saved record. A check keeps the ID at 1, so a second row is refused. The foundation migration inserts the row. | The KTD7 clock guard compares the PC's clock with the latest record. Keeping that time in one row, moved forward in each record's transaction, means the guard reads one value instead of every table. Recorded in step 5. |
| 2 | Do settings store who changed them last and when, or is the audit log enough? (question 6) | Each settings row stores who changed it last and when. The audit log gets no settings action. Values are JSON text, and each key starts with its module name, like `walkins.dayPassPriceCentavos`. A row exists only after the owner changes a setting; otherwise the default registered in code applies. | The settings screen can show the last change without searching the audit log. Older values aren't needed, because records copy the values they used, like a day pass's price. Recorded in step 5. |
| 3 | What else does a plan need? (question 1) | A retired yes/no. The price is in centavos, and the length is a whole number above zero with the unit `day` or `month`. | R6 and R60. Plans are retired, never deleted, so old renewals keep pointing at them. Recorded in step 5. |
| 3 | Can a retired plan and an active plan share a name? (question 2) | Yes. Two active plans can't share a name (ignoring case), but a new "Monthly" can replace a retired one. | The desk never shows two identical choices, and the owner can reuse a name after retiring the old plan. Recorded in step 5. |
| 3 | Where do member details go? (questions 4 and 7) | A `member_details` table (name, phone, email, photo file name) exists in both the gym database and the local-only file. The member's backup consent decides which file holds the row. The `members` row holds no personal data. | One shape for both files. An erasure deletes the details row and the code, and the `members` row stays as the anonymous placeholder that payments and check-ins point at (R62). Recorded in step 5. |
| 3 | Where do the personal details of a member who declines the online backup live? | In a separate local-only SQLite file in the data folder. Litestream never replicates it and the photo upload skips those members. | Litestream copies the whole database file and cannot leave out one member. After a restore, staff re-enter those members' details. Recorded in step 5. |
| 3 | Is the member code stored as-is or hashed? (question 5) | As-is. | Staff can reprint or resend a card at any time (R9). If a copy ever leaks, U8 can replace every member's code at once. Recorded in step 5. |
| 3 | When a code is replaced, is the old one kept? (question 6) | No, it is overwritten. | R53 says the door rejects a replaced code as an invalid code, the same as a made-up one, so there is nothing to tell apart. Recorded in step 5. |
| 3 | Is consent one yes/no or three? (question 8) | Three separate answers. Storing data on the gym PC is required; the online backup and reminders are each optional. | Team decision. A member who declines the backup keeps every gym PC feature but gets no member login or reminders, because those run from the online copy (R8). Recorded in step 5. |
| 3 | What does a consent row record? (question 9) | The member, the three answers, the version of the consent text the member saw, and the shared record columns (who recorded it, and when). The texts live in code, and the row stores the version string. A change of mind adds a new row. | No requirement asks to change the text without a release. Reminders need the online backup, so the database refuses reminders without it (R8, R38). Recorded in step 5. |
| 4 | Which payment methods exist? | Cash, GCash, and Maya. | R27, and the semi-manager confirmed GCash and Maya in the Week 3 interview. Recorded in step 5. |
| 4 | Where is a member's expiry date stored? (question 1) | Nowhere. The expiry replay works it out from the carried-over entry and the renewals each time. | KTD8. A void or a back-entry then changes later expiries on its own, with no stored date to fix. Recorded in step 5. |
| 4 | Do carried-over entries and renewals share one table? (question 2) | No, two tables: `carried_over_expiries` (member and expiry date) and `renewals` (member, plan, copies of the plan's length, unit, and price, and the payment). | Every column in each table is required, so no rule is needed about which columns each kind fills. Recorded in step 5. |
| 4 | Does a renewal copy the plan's length, unit, and price? (question 3) | Yes, all three, and it also points at the plan for screens. The replay reads only the copies. | R7 and U7. These copies can't be filled in later for old rows. Recorded in step 5. |
| 4 | How does a renewal connect to its payment? (question 4) | The renewal points at the payment, and one payment pays for one renewal. | Day passes and sales will point at their payments the same way, so the payments table stays the same for all three. Recorded in step 5. |
| 4 | What stops a second carried-over entry? (question 5) | A unique rule on the member that covers only non-voided entries. | KTD8 allows one. Voiding a wrong entry lets the owner enter the right one. Recorded in step 5. |
| 4 | Which kinds of payment exist? (question 6) | Membership, day pass, and sale. | Coaching is sold as a menu item, so it is a sale (block 6). Recorded in step 5. |
| 4 | One method column, or e-wallet plus a provider? (question 7) | One column: `cash`, `gcash`, or `maya`. The report's e-wallet total is every method except cash. | The simpler shape, and it holds the provider the report shows. Recorded in step 5. |
| 4 | Store a cleaned-up copy of the reference number? (question 8) | No. The row stores what staff typed, and the unique rule compares references with every space removed and case ignored, so `AB 12` and `ab12` are the same. | GCash shows references with spaces, and staff may type them with or without. Same approach as sign-in names (block 2). Recorded in step 5. |
| 4 | Can a voided payment's reference number be used again? (question 9) | Yes. The unique rule covers only non-voided payments. | Staff can void a mistyped payment and enter the same transfer again. The voided payment is not counted as income, so nothing is counted twice. Recorded in step 5. |
| 5 | What tells the two kinds of check-in apart, and where each came from? (question 1) | Two columns. `kind` is `scan_using` or `override`, and `source` is `door` or `desk`. A door check-in is always `scan_using`. | KTD8 names the two kinds, and the report needs to know which check-ins came from the desk (R28). Recorded in step 5. |
| 5 | Who entered a door check-in? | Nobody: a door check-in has no account and no copied name, and a desk check-in must have both. The database refuses any other mix. | The door tablet is a paired device, not a staff account (KTD5), and R18 asks for the staff account only on desk check-ins. Recorded in step 5. |
| 5 | How does a check-in show it belongs to a member or a day pass? (question 2) | Two columns, `member_id` and `day_pass_id`. The database requires exactly one of them. | Each column points at its own table, so the database checks that the member or pass exists. Recorded in step 5. |
| 5 | Which columns does the once-per-day rule cover? (question 3) | The member and the Manila date. It ignores overrides and voided check-ins. | KTD8 and AE15: when the door and the desk try at the same moment, the second one is refused. Voiding the check-in frees the day's scan. Recorded in step 5. |
| 5 | Which column links an override to its rejection? (question 4) | `overridden_rejection_id`. Only an override may fill it. | R58 and R28: the report shows the reason of the rejection each override overrode. Recorded in step 5. |
| 5 | What does a rejection store? (question 5) | The reason, the first 12 characters of what was scanned, the time and Manila date, its door event, and the member or pass it matched. The reason must match: an invalid code matches nobody. No device column yet. | 12 characters is too short to be a working code (KTD10). The member link lets the desk show the name and photo (R14). The devices table comes with U3 (block 7, question 3), and U3 can add a device column then. Recorded in step 5. |
| 5 | Why one door-event numbering? (question 6) | A `door_events` table hands out one number to every door result, accepted or rejected. Each check-in from the door and each rejection points at its number. | The desk asks "send me everything after number 41" after a reconnect (KTD10). With two numberings, check-in 42 and rejection 42 would both exist, and the desk couldn't tell which ones it missed. Recorded in step 5. |
| 5 | What does a day pass store? (question 7) | The random token, its payment (one pass per payment), and the shared record columns. The record's Manila date is the one day the pass is valid, so there is no separate valid-on column. | R19, R20, R53. Same payment link as renewals (block 4). Recorded in step 5. |
| 5 | Where are a pass's door entry and desk re-admissions recorded? (question 8) | Both are check-ins for the pass. The door entry is `scan_using`, and the database allows one per pass. A desk re-admission is always an `override`, so it never counts. | KTD8's second unique rule. U9 checks that a re-admission happens on the pass's own day (R20). Recorded in step 5. |
| 6 | Where does coaching go? | Coaching is sold as a menu item with no stock count, like a shake without add-ons. The product type is either sealed item or menu item. | The semi-manager asked for coaching, and the plan postpones trainer features. Selling it as a menu item records the income without new tables. Recorded in step 5. |
| 6 | One products table or two? (question 1) | One `products` table with a `kind`: `sealed` or `menu`. Only a sealed item has a stock count and a low-stock level, and the database refuses any other mix. Two yes/no columns, `takes_add_ons` (shakes) and `needs_member` (coaching), apply to menu items only. | Matches the team's coaching decision above. The two yes/no columns tell the sale screen which questions to ask, without a third product kind. Recorded in step 5. |
| 6 | Do add-ons belong to specific shakes? (question 2) | No. Any add-on fits any product that takes add-ons. Add-ons have their own table with a price and a retired state. | The gym's add-ons (banana, egg) go in every shake, so a list per shake would only add work for the owner. Recorded in step 5. |
| 6 | Where do a line's add-ons and their prices go? (question 3) | In `sale_line_add_ons`: one row per chosen add-on, pointing at its line, with the add-on's price when sold. An add-on applies to every unit on its line. No total is stored, and U10 checks that the lines add up to the payment. | Each line keeps its own price snapshot, like a renewal (R7, R24). Recorded in step 5. |
| 6 | Is a coaching sale tied to a member? | Yes. The sale line records the member in `member_id`, and U10 requires it when the product needs a member. | The owner asked for coaching in the Week 3 interview. The member's online view lists their coaching sessions straight from the lines (R24, R43), without building trainer features. Recorded in step 5. |
| 6 | Can stock counts be corrected? (question 4) | Yes. The owner corrects a count to what is on the shelf with a reason (breakage, spoiled, miscount, other), saved as a correction movement (R63). | Counts drift through breakage, spoilage, and theft, and voiding a sale is the wrong tool for that. Recorded in step 5. |
| 6 | How is a stock movement undone? | With a new `void` movement that points at the one it undoes. Movements themselves are never voided, and the database allows only one void per movement. A sale movement points at its sale line, one per line. | Every past day keeps the stock it really had (U11), and a repeated void can't return the stock twice (U10). Recorded in step 5. |
| 6 | What must always be true about the stock count and the movements? (question 5) | The product's stock count equals the sum of its movements' quantity changes. U10 writes both in one transaction and tests this. The count may go below zero when an item at zero sells (R23). | SQLite checks can't add up other rows, so the transaction and U10's test enforce it. Recorded in step 5. |
| 6 | Do restocks record what the gym paid? (question 6) | Optionally. Each restock has an amount-paid field the owner may leave blank. The Inventory screen shows the last unit cost when one is known. | Costs nothing to store, builds the purchase history R26 asks for, and works whatever the owner prefers. Recorded in step 5. |
| 7 | Is anything missing from KTD9's audit columns? (question 1) | Four additions: a copy of the acting account's name, the reason (block 1 puts the why of a void here), and the record's values before and after as JSON, with personal values left out. The action is one of a fixed list: void, correct, override, carry_over, back_entry, back_entry_refused, member_edit, erase. Only a refused back-entry has no row ID, because nothing was saved. | R41 asks for the original values, and R50 for the name as it was. The list covers every change KTD9 names. Recorded in step 5. |
| 7 | Why keep personal values in a separate table? (question 2) | Each changed personal value is a row in `audit_personal_values`, with the member it belongs to. An erasure blanks that member's values and marks them redacted. The rest of the audit log is never touched. | R62 erases a member's personal data, but KTD9 forbids changing audit rows. Keeping the personal values apart means only this one table needs the erasure exception. Recorded in step 5. |
| 7 | Where do the triggers go? | U2c adds them in its own migration: no updates or deletes on either audit table, except redacting in a transaction the erasure service flagged. | Drizzle's table definitions can't describe triggers, and U2c owns the audit log (U2, execution note). Recorded in step 5. |
| 7 | Do the login tables go in this first migration? (question 3) | No. U3 adds sessions, paired devices, one-time codes, and sign-in attempt counters in its own pull requests. U3 can also add the device column to rejections (block 5). | U3 comes before the Phase 3 tracks, so its migrations can't compete with theirs (KTD17). U3's design isn't settled yet, and guessing those columns now would be harder to change later. Recorded in step 5. |
| 8 | Does everyone agree with the read-back? (question 1) | Yes. The whole team agreed with every decision above, including the three rows the read-back added for block 2, questions 1 and 2, and block 3, question 1. | Team decision. |
| 8 | Does the first migration also create the local-only file's table? | Yes, in the same pull request. The gym database gets the foundation migration, and the local-only file gets its own first migration, which creates only `member_details`. Each file's migrations go in their own folder inside `packages/server/src/db/migrations/`. KTD17 now allows one migration per database file in a pull request. | Team decision. The plan says one migration runner manages both files, and U4 needs the local-only file ready. Folders inside the migrations folder keep CI's rule on SQL files passing. |
| 8 | How does the database compare reference numbers, now that drizzle-kit breaks the index? | A virtual generated column, `reference_number_key`, works out the reference in lower case with every space removed, and the unique rule covers that column. SQLite works the value out when it reads the row and never saves it, so block 4, question 8 still holds. | Found in step 5: drizzle-kit 0.31.11 splits an index expression at its commas, so `lower(replace(reference_number, ' ', ''))` came out as broken SQL. An index on a plain column has no commas. Hand-editing the generated SQL would fight the CI drift check. Recorded in step 5. |

## Still open

| Question | Who follows up | By when |
|---|---|---|
| Which contact details should members give: phone, email, or both? Settled for U4 by the team: a Philippine mobile number is required and email is optional, because reminders go by text (U19). The owner confirms before go-live. | Team, with the owner | Before go-live (U21) |
| For members carried over from the logbook, how do they give consent (R8, R44)? | Team, with the owner | Before go-live (U21) |
