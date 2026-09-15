---
status: accepted
---

# Record financial movements in four currencies, converted into the preferred currency when saved

This supersedes ADR 0001. Converting dollars and yen by hand while logging a purchase abroad is slow and error-prone, and it loses what was actually paid. A financial movement can now be recorded in Mexican pesos (MXN), US dollars (USD), Japanese yen (JPY) or euros (EUR), chosen by the owner and never inferred from location. On submission the server converts it into the owner's **preferred currency**. That is MXN unless changed in Settings, and it is stored with the journal, not in a browser. The converted amount, exchange rate, rate date and rate source are frozen on the entry. Summaries, trends and export snapshots total converted amounts, so every figure is in one currency and later rate changes never alter history. Existing entries become MXN-to-MXN identity conversions, so no total changes.

Amounts stay exact integers in each currency's minor unit, and one shared rounding rule applies everywhere. Recording in the preferred currency never needs a rate.

## Exchange rates

Rates come from Frankfurter, which is free, needs no key, answers historical and range queries, and can be self-hosted. An entry uses the freshest rate for its movement date. A day without a published rate uses the latest earlier one, and the entry shows that rate's date. A single server-side module talks to the provider, through a cache that treats a fallback rate for today as provisional. If no rate is available, the save is refused and nothing is persisted, so the owner can retry or enter the charged amount.

Frankfurter publishes mid-market reference rates, but a card used abroad charges the issuer's rate, usually a few percent more. The owner may therefore enter the **amount actually charged** in the preferred currency instead. It is stored as the converted amount with source `manual` and its implied rate.

## Changing the preferred currency

Stored entries are never rewritten. An entry converted into a different currency is re-expressed for presentation only, using the rate for its movement date. If a period cannot be fully re-expressed, it reports itself unavailable rather than mixing currencies. Switching back shows the original figures exactly, and export snapshots keep the currency they were generated in.

## Considered options

- Banxico SIE publishes the official FIX rate but requires a token and TLS 1.3.
- ExchangeRate-API's no-key tier has no historical rates and requires attribution.
- Storing only the original amount and converting whenever figures are read would let history drift with rates, and every view would depend on the rate service.

## Out of scope

- Currencies beyond these four, and a managed currency list.
- Inferring currency from location.
- Per-currency balances or cash wallets.
- Card statement reconciliation, and learning card fees.
- Rewriting stored entries.
- Paid or keyed rate providers, and intraday rates.

Specified in GitHub issue #23.
