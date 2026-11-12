# Changelog

All notable changes to the LFMP Sub-account Builder. Versions follow semantic versioning.
v1.0.0 is released at deploy (Step 4); until then it is marked unreleased.

## [1.0.0] - unreleased

- Note: for now the builder runs from PJ's personal GitHub account (peejayedz) because the LFMP-Rockstars GitHub billing is blocked. This is temporary: it moves back to LFMP-Rockstars once billing is fixed, and everyone will then make a new token.
- Changed: the "Create the token" steps name the account that owns the builder repo, and the token only needs the builder repo.

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
