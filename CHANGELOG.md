# Changelog

All notable changes to the LFMP Sub-account Builder. Versions follow semantic versioning.
v1.0.0 is released at deploy (Step 4); until then it is marked unreleased.

## [1.0.0] - unreleased

- New (Phase 2 test, not used by the page yet): a sign-in page for the private GHL app "LFMP LeadPro Connector" at https://peejayedz.github.io/lfmp-oauth/. After the app is installed it shows the one-time code to copy into Terminal, then clears it from the address bar. It stores nothing and sends nothing.
- New (internal): `scripts/app/connect.mjs` swaps that code for the agency tokens and keeps them in the Mac Keychain (typing hidden, nothing printed), then checks read-only where the app is installed. Its GHL helper may only read, swap the code / refresh, and mint sub-account tokens.
- New (internal): `scripts/app/test-tokens.mjs`, a read-only test: lists the sub-accounts that have the LeadPro Connector, mints a sub-account token with no click, and runs the nine KPI reads with counts only. Location tokens stay in memory and are never saved.
- New: KPI dashboards are set up automatically. When "Set up KPI dashboard" is ticked, the setup starts by itself once the sub-account is created and its snapshot has loaded; any other record gets a **Set up KPI dashboard** button (and **Retry KPI setup** if it failed). The page makes the dashboard passphrase in your browser and shows it once with a Copy button. Save it in the password manager: it isn't shown again. Progress steps show on the done panel and the record; when it's ready, the KPI link is saved on the record and the KPI button works. A sub-account never gets two dashboards: one that already has a dashboard is simply linked. If GHL's menu link isn't added automatically, the card gives the link to copy and the exact clicks.
- New: KPI badge on the Sub-accounts list shows Not requested / Requested / Setting up / Ready / Ready · review mapping / Setup failed.
- Changed: the Connect check also shows whether your GitHub token can reach the LeadPro KPI repo (needed for KPI setup only; it doesn't block connecting).
- New (internal, Phase 2 Part B): `scripts/app/move-to-github.mjs` moves the LeadPro Connector app tokens from the Mac Keychain into the LeadPro KPI repo's secrets once (nothing printed; checked by fingerprint), after which only the KPI token keeper refreshes them. `connect.mjs --github` re-connects straight into those secrets.
- Tested (Phase 2, Part A): the LeadPro Connector app installed itself on a brand-new sub-account created from the builder (ZZ TEST 2) within 3 minutes, and a sub-account token was made for it with no clicks. Read-only; nothing written in GHL.
- Fix (internal): saving the real agency tokens failed because the Mac's Keychain tool refuses values over about 4 KB. Values are now saved in small checked pieces; the connect script tests the save with a long dummy value before asking for the code, re-uses the saved Client ID and Secret, and replaces a half-saved leftover by itself.

- Note: for now the builder runs from PJ's personal GitHub account (peejayedz) because the LFMP-Rockstars GitHub billing is blocked. This is temporary: it moves back to LFMP-Rockstars once billing is fixed, and everyone will then make a new token.
- Changed: the "Create the token" steps name the account that owns the builder repo, and the token only needs the builder repo.
- New: the page is published (temporarily) at https://peejayedz.github.io/ghl-subaccount-builder-page/ and locked with the builder password.
- Tested live: the first real sub-account was created from the page (13 Nov 2026), with the snapshot loaded and the record saved.

- New: password-locked page (same lock and look as the LeadPro KPI admin page) with an encrypted GitHub token and a Connect check that names any missing permission.
- New: Sub-accounts tab: search, status / KPI / review-page badges, Open in GHL, Copy location ID, View details, Refresh status, and an "In progress or needs attention" list.
- New: New sub-account form with live validation, duplicate-name warning with "Create anyway", timezone suggested from the state, KPI and automation-review add-ons, social links and advanced settings.
- New: review screen, animated progress (GitHub start → checks → create → snapshot load with progress bar → record → done), done panel with next steps, failure panel with technical details, Retry and Back to form.
- New: workflows `create.yml`, `status.yml`, `snapshots.yml`, `subaccounts.yml`, `check.yml`. Retry never creates a second sub-account.
- New: only GHL write is `POST /locations/`, enforced in code and by a test.
- New: Time zone field (required). Plain US names first (Eastern Time (New York), Central Time (Chicago), Mountain Time (Denver), Mountain Time – Arizona (Phoenix), Pacific Time (Los Angeles), Alaska, Hawaii), then every other time zone. Suggested from the State; a time zone you pick yourself is never overwritten by a State change. Shown by its plain name on the review screen, done panel, record details and the Sub-accounts list. Sent to GHL through one conversion point (`toGhlTimezone`) and saved on the record as `timezone` + `timezoneLabel` for the KPI dashboard.
- Fix: a time zone you picked yourself is still kept after "Back to form", even when it's the same one the State suggests, so changing the State later doesn't overwrite it.
- New: Webforms add-on. The form asks for Brand (LFMP or WPP), CSM (from the Desk "CSM-" tags), "Webforms ticket needed" (ticked by default) and an optional Mastersheet link; all shown on the review screen, done panel and record.
- New: Webforms card on each record: Zapier steps with copy buttons, webhook / Zap / Mastersheet / domain / CSM / brand / Teamwork project, "Preview ticket" with the exact subject, tags, project, assignee, priority and body, and "Send webforms ticket" (one click, can't send twice). After sending: ticket number and "Open in Desk".
- New: the ticket is created in the WEBTEAM inbox exactly like the team's usual "Connect Webforms to GHL" ticket, with the client's domain as a tag (created if new) and linked to the client's Teamwork project.
- New: every client's links in one place: GHL, Zap, webhook, Desk ticket, KPI dashboard, Mastersheet, Automation review page. Link buttons on the Sub-accounts list (missing ones greyed with a tooltip), and a Links section on the record with Open, Copy and Edit (checked, saved with who and when). Search also finds domains, ticket numbers and links.
- New: Webforms badge on the Sub-accounts list.
- New: "Open GHL_Clients in Zapier" on the Webforms card opens the team's GHL_Clients folder directly.
- Tests: unit tests against a mock GHL, and Playwright browser tests on desktop and phone in light and dark mode.
