---
status: accepted
---

# Do not capture financial movements from bank notifications or SMS

Bluecoins and Cashew create entries by reading push notifications from banking apps and incoming SMS. Those are native-app capabilities. A web app in a browser cannot read other apps' notifications or text messages on either phone platform, and Finance Buddy is a web app deployed on Vercel. Finance Buddy does not support this capture, and does not build a native companion app to get it, which would mean a second codebase and app-store distribution for a single owner.

The web-appropriate route to fast capture is being specified separately:

- **Prefilled entry links** open the entry form with fields already filled in, and can be launched from a phone shortcut or bookmark, as Cashew's App Links are on the web.
- **Keyboard quick-add** speeds up entry on desktop.

On iOS, a Shortcuts automation could open such a link after an Apple Pay payment, as Money Lover's Apple Pay tracking does through Shortcuts.

## Consequences

- **A link only prefills.** Opening it never records a financial movement. The owner still submits the form, which goes through the usual owner authorization, Origin check and validation. If a link saved on load, any page able to open a URL in the owner's browser could write to the journal.
- **A link carries no entry id.** The form creates one when it opens, so reopening a saved link starts a new entry. It never collides with an earlier entry under the idempotent-id rule.
- **Defaults still apply.** The movement date defaults to today in the local time zone (ADR 0008), and the currency defaults to the preferred currency (ADR 0007) unless the link names another. An archived category named in a link is not applied.
- **No transfers.** A link cannot describe a transfer, because transfers are not recorded (ADR 0010).

## Considered options

The Web Share Target API lets an installed web app receive text shared into it, so a notification's text could be shared into a prefilled form. It works only for installed web apps in some Android browsers, not on iOS, and it would still require parsing each bank's wording. It can be revisited once prefilled links exist.
