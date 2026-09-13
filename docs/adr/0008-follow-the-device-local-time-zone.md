---
status: accepted
---

# Follow the device's local time zone instead of Mexico City

Version one read every calendar date in Mexico City time. In Tokyo, which is 15 hours ahead, that meant a morning purchase dated today was refused as a future date, and "today" and the current period were wrong. The app now follows the owner's **local time zone**, meaning the IANA zone the browser reports, which a phone updates on its own when it lands somewhere new. It decides:

- "today" and the default movement date;
- which dates count as future;
- the current day, week and month, including Back to current period and the trend span's anchor;
- the export date;
- the day an exchange rate is looked up for (ADR 0007).

One shared "today in time zone Z" replaces the fixed Mexico City today everywhere it was used, including the "current week" landing and trend anchor in ADR 0006.

Each financial movement stores the time zone it was recorded in, so travelling never reinterprets earlier entries. Existing entries are backfilled with America/Mexico_City. A correction that changes the movement date records the device's current zone; any other correction keeps the stored one. Server-rendered pages read the zone from a cookie that the browser refreshes on every load and whenever the tab regains focus. If that cookie is stale on the first view after arrival, the client corrects the current period without a reload. A missing or invalid zone falls back to America/Mexico_City.

## Why a submitted zone is safe

The server never accepts a client-supplied "today". It validates the submitted zone against the IANA database and derives today from its own clock in that zone. No zone is more than 14 hours ahead of UTC, so a faked zone can move today forward by at most about one day. The journal still holds only activity that has already happened.

## Summary membership stays date-only

A movement belongs to the day, week or month that contains its stored movement date. That is a calendar date and needs no time-zone arithmetic, so a purchase dated 14 September in Tokyo stays in 14 September's day and week wherever it is viewed later. Only today and the current-period anchor depend on the local time zone.

## Considered options

- **Keep Mexico City.** This fails the trip.
- **A manual time-zone setting.** It would be forgotten on arrival.
- **GPS or geolocation lookup.** It needs a permission and a service to learn what the device already reports.

Recording a time of day for movements is out of scope.

Specified in GitHub issue #23.
