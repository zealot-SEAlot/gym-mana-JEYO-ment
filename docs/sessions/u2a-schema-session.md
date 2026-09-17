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
   - Nathan writes the schema files and the first migration from the decision log, in step 5 of U2a.
   - The U2b and U2c owners check that the settings, system state, and audit tables match what their units need.
   - The pull request for U2a links this file as the record that the team agreed.

## Questions for the gym owner

Add to this list during the session.

- Which contact details should members give: phone, email, or both?
- For members carried over from the logbook, how do they give consent to storing their data (R8, R44)?
- Should restocks record what the gym paid, or only the quantity?
- Are GCash and Maya the only e-wallets customers use?

## Decision log

| Block | Question | Decision | Reason |
|---|---|---|---|
| | | | |

## Still open

| Question | Who follows up | By when |
|---|---|---|
| | | |
