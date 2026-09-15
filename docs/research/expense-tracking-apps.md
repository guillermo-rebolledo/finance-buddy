# Expense-tracking apps as reference products for Finance Buddy

**Date:** 2026-09-13

## Question

Which apps dedicated mostly or entirely to expense tracking can serve as reference products for Finance Buddy, and what are their best features?

## Method

- Scope: apps whose core purpose is recording and understanding spending. Broad wealth or investment platforms were excluded. The mix covers manual-entry-first mobile trackers, budgeting-led trackers, three open-source projects, and one Mexico-focused app.
- Sources: vendor websites and feature pages, vendor help centers and docs, Apple App Store and Google Play listings, vendor blogs, and GitHub repos and the GitHub API (release dates, licenses). All were accessed on 2026-09-13.
- Maintenance: each app was checked for activity in 2026 through its store "Updated on" date, its latest release, or recently dated docs. The results are recorded per app.
- Access limits: the Realbyte (Money Manager) and BudgetBakers (Wallet) help centers blocked automated access with a Cloudflare challenge. Most YNAB help articles render client-side. For those pages, claims come from the vendor's own article titles and search-result excerpts of those vendor pages, and are marked *(vendor help page, via search excerpt)*. Claims that rest only on a non-vendor source are marked *(secondary)*.
- Finance Buddy context comes from `README.md`, `CONTEXT.md` and the `docs/adr/` file names (0001 single-currency MVP through 0006 dashboard/registry split).

Legend for the table: **Y** = confirmed by a primary source; **Paid** = confirmed, but only on a paid tier; **—** = the vendor says it is absent or excludes it; **?** = not found in primary sources (not necessarily absent).

## Comparison table

| App | Entry model | Platforms | Pricing | Recurring | Templates / quick-add | Tags / labels | Auto-rules | Split | Calendar view | Budgets | Multi-currency | Export | Receipts / photos | Open source / local-first |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Money Manager (Realbyte) | Manual (+ Excel bulk import) | iOS, Android, PC via Wi-Fi | Free with ads + subscription | Y | Y (bookmarks) | ? | ? | ? | Y | Y | Y | Y (Excel) | Y | — / device + backups |
| Monefy | Manual | iOS, Android | Free + Premium | Y | Y (two-tap add) | ? | ? | ? | ? | Y | Y | Paid (CSV/Excel) | ? | — / local by default |
| Spendee | Manual + bank sync | iOS, Android, web | Free / Plus / Premium | Y | ? | Y | ? (auto-categorization) | ? | ? | Y | Y | Y | Y (AI scanner) | — |
| Wallet (BudgetBakers) | Manual + bank sync + file import | iOS, Android, web | Free + Premium (incl. lifetime) | Y (planned payments) | Y (templates) | Y | Y | ? | ? | Y | Y | Y (API) | ? | — |
| Money Lover | Manual + bank sync (some regions) | iOS, Android, web | Free + lifetime Premium + linked-wallet subscription | Y | ? | ? (events) | ? | ? | ? | Y | Y | Paid (CSV/XLS, Google Sheets) | Y (scanning) | — |
| Toshl Finance | Manual + file import + bank sync (Medici) | iOS, Android, web | Free / Pro / Medici | Paid | Y (4 taps) | Y | ? | ? | ? | Y | Y | Y (CSV free; more on Pro) | Paid | — |
| Bluecoins | Manual + notification/SMS auto-log + CSV/QIF import | Android, iOS | Free with ads + one-time Premium | Y | ? | Y | ? | Y | Y | Y | Y | Y (PDF, Excel, HTML) | ? | — / device + own cloud |
| Cashew | Manual + notification/SMS scan + app links + CSV/Sheets import | iOS, Android, web (PWA) | Free + Cashew Pro | Y | Y (title autofill) | Y | Y (titles to categories) | ? | ? | Y | Y | Y (Google Sheets) | ? | GPL-3.0 |
| Actual Budget | Manual + file import + bank sync (GoCardless, SimpleFIN) | Desktop, web, PWA | Open source; self-host | Y (schedules) | ? | ? | Y | Y | Y (calendar card) | Y (envelope) | ? | Y (full export) | ? | MIT / local-first |
| Firefly III | Manual + Data Importer (CSV, CAMT, bank providers) | Self-hosted web | Open source | Y | ? | Y | Y | Y | ? | Y | Y | Y | ? | AGPL-3.0 / self-hosted |
| YNAB | Manual + file import + direct import | Web, iOS, Android | Subscription | Y (scheduled) | ? | ? | ? | Y | ? | Y (targets) | ? | ? | ? | — |
| Goodbudget | Manual; bank sync on Premium (US only) | Web, iOS, Android | Free + Premium | ? | ? | ? | ? | ? | ? | Y (envelopes) | ? | ? | ? | — |
| Vuallet (Mexico) | Manual forms + slash commands + receipt scan; no bank access | Web (iOS/Android claimed) | Free beta; paid tier stated | ? | Y (commands) | ? | ? | ? | ? | Y | ? | ? | Y | — |

---

## Apps

### 1. Money Manager (Realbyte)

- **Positioning:** a mobile household-account book with double-entry bookkeeping and an optional PC view.
- **Maintenance:** 20M+ downloads claimed ([realbyteapps.com](https://realbyteapps.com/)); Google Play shows "Updated on Sep 9, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree&hl=en_US)).
- **Platforms:** iOS and Android ([realbyteapps.com](https://realbyteapps.com/)). A "PC Manager" lets you view and edit the data from a PC over Wi-Fi ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)). The phone and PC must be on the same network ([help center, via search excerpt](https://help.realbyteapps.com/hc/en-us/articles/360043758513-How-to-use-PC-Manager)).
- **Pricing:** free with ads; subscription at $2.49/month or $19.99/year ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Entry model:** manual. Bulk import is by Excel file, including sub-currencies ([help center, via search excerpt](https://help.realbyteapps.com/hc/en-us/articles/360043223253-How-to-import-bulk-data-by-Excel-file)).
- **Fast entry:**
  - "Bookmarks" save frequently used transaction details so they need not be re-entered ([help center, via search excerpt](https://help.realbyteapps.com/hc/en-us/articles/360042743374-How-to-make-a-bookmark)).
  - Repeat schedules and installments are set from the Date field ([help center, via search excerpt](https://help.realbyteapps.com/hc/en-us/articles/360046668993-How-to-set-up-a-repeat-schedule-installment)).
- **Categorization:** main categories and subcategories ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Reporting:**
  - Weekly and monthly totals, a calendar view of monthly transactions, charts, asset trend graphs, and advanced filtering ([realbyteapps.com](https://realbyteapps.com/)).
  - A calendar view is also listed in the store description ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Budgets:** a monthly budget per category ([realbyteapps.com](https://realbyteapps.com/)); weekly, monthly and annual budget planning ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Transfers and cards:**
  - Transfers between accounts, including automatic transfers with a frequency ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
  - Double-entry booking for savings, insurance, loans and real estate ([realbyteapps.com](https://realbyteapps.com/)).
  - Credit and debit card management with future payment tracking ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Multi-currency:** individual entries can be in different currencies ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
- **Receipts:** "Photo Save" for receipts ([realbyteapps.com](https://realbyteapps.com/)).
- **Portability:**
  - Backup and restore via email, iTunes and iCloud ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).
  - "Export data to Excel" via email ([help center, via search excerpt](https://help.realbyteapps.com/hc/en-us/articles/360046150874-Home-tab)).
- **Privacy:** a passcode with a configurable delay before it is requested ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)).

### 2. Monefy

- **Positioning:** "record any purchase in two taps", with privacy and simplicity as explicit design choices and no bank connections ([monefy.com](https://monefy.com/)).
- **Maintenance:** Google Play "Updated on Aug 16, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.monefy.app.lite&hl=en_US)).
- **Platforms:** iOS and Android ([help center](https://monefy.com/faq)).
- **Pricing:**
  - "completely free" with an optional upgrade: unlimited accounts, recurring transactions, advanced filters ([monefy.com](https://monefy.com/)).
  - The US App Store lists a "Monefy Premium" in-app purchase at $59.99 ([App Store](https://apps.apple.com/us/app/monefy-budget-money-manager/id1212024409)).
- **Entry model:** manual only ([monefy.com](https://monefy.com/)).
- **Fast entry:**
  - Two-tap recording ([monefy.com](https://monefy.com/)) and a built-in calculator ([App Store](https://apps.apple.com/us/app/monefy-budget-money-manager/id1212024409)).
  - Recurring records post automatically on schedule: daily, weekly, monthly, yearly or custom, with optional end dates ([help center](https://monefy.com/faq)).
- **Reporting:** a spending-distribution chart plus a records list ([App Store](https://apps.apple.com/us/app/monefy-budget-money-manager/id1212024409)).
- **Budgets:** budget mode draws a progress ring on the donut chart. Monthly budgets on both platforms; weekly on Android only ([help center](https://monefy.com/faq)).
- **Transfers / multi-currency:**
  - Transfers between accounts convert at the exchange rate when currencies differ ([help center](https://monefy.com/faq)).
  - 150+ currencies ([monefy.com](https://monefy.com/)).
- **Portability:**
  - Sync through the user's own Google Drive or Dropbox ([monefy.com](https://monefy.com/)).
  - CSV/Excel export is described as a Pro feature in a vendor blog article ([monefy.com article](https://www.monefy.com/article/monthly-budget-checklist-for-beginners)).
- **Privacy / local-first:**
  - "Data is stored locally by default; nothing is uploaded unless you choose to sync" ([help center](https://monefy.com/faq)).
  - Optional passcode and biometric lock ([monefy.com](https://monefy.com/)).
- **Accounts:** Premium users can hide archived accounts ([help center](https://monefy.com/faq)).

### 3. Spendee

- **Positioning:** a budget and expense tracker combining cash wallets, bank sync and shared wallets ([spendee.com](https://www.spendee.com/)).
- **Maintenance:** Google Play "Updated on Sep 4, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.cleevio.spendee&hl=en_US)).
- **Platforms:** iOS, Android and web at app.spendee.com ([spendee.com](https://www.spendee.com/)).
- **Pricing:**
  - Basic (free): bank sync, 1 cash wallet, 1 budget, import/export.
  - Plus ($1.99/month or $14.99/year): unlimited wallets and budgets, shared wallets.
  - Premium ($5.99/month or $35.99/year) ([pricing](https://www.spendee.com/pricing)).
  - Lifetime Premium at $119.99 on iOS ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)).
- **Entry model:** manual cash entries plus bank, crypto and e-wallet connections ([spendee.com](https://www.spendee.com/)).
- **Fast entry:**
  - An AI receipt scanner creates a transaction from a photo ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)).
  - Recurring transactions ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)).
- **Categorization:**
  - Customizable categories; a picture or location can be attached to every expense ([spendee.com](https://www.spendee.com/)).
  - Labels for detailed analysis ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)).
  - "Automatic categorization" on all plans ([pricing](https://www.spendee.com/pricing)).
- **Reporting:** line and pie charts and infographics ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)).
- **Budgets:** category budgets plus a daily spending limit ([spendee.com](https://www.spendee.com/)).
- **Multi-currency:** multiple currencies, aimed at travellers ([spendee.com](https://www.spendee.com/)).
- **Sharing:** shared wallets for couples, families and roommates ([spendee.com](https://www.spendee.com/)).

### 4. Wallet by BudgetBakers

- **Positioning:** an all-in-one personal and family finance manager with bank sync at scale ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Maintenance:** Google Play "Updated on Sep 8, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.droid4you.application.wallet&hl=en_US)).
- **Platforms:** iOS, Android and web ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Pricing:**
  - A free tier for manual tracking; Premium subscription; lifetime Premium option ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
  - Monthly, yearly and lifetime Premium have the same features; prices are shown in-app ([help center, via search excerpt](https://support.budgetbakers.com/hc/en-us/articles/7151349344018-Everything-about-Premium)).
- **Entry model:**
  - Manual entry.
  - Sync with "over 15,000 banks".
  - CSV, XLS and OFX file import ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Fast entry:**
  - **Templates** prefill account, category, amount, type, currency, payee, labels, payment type and note ([help center, via search excerpt](https://support.budgetbakers.com/hc/en-us/articles/7077050225042-Using-Templates)).
  - **Planned payments** allow manual or automatic confirmation, repeat settings, and notifications on the due date or three days before ([help center, via search excerpt](https://support.budgetbakers.com/hc/en-us/articles/7149523920786-Setup-Planned-Payments)).
  - Planned payments also auto-detect recurring payments and forecast cash flow ([feature page](https://budgetbakers.com/en/products/wallet/features/planned-payments/)).
- **Categorization:**
  - Categories and subcategories ([help center article title](https://support.budgetbakers.com/hc/en-us/articles/7077082048146-All-about-Categories-and-Subcategories)).
  - Labels group and filter records ([help center, via search excerpt](https://support.budgetbakers.com/hc/en-us/articles/7076564578066-Utilising-Labels)).
  - Automatic rules can set labels and change categories of imported bank records ([help center, via search excerpt](https://support.budgetbakers.com/hc/en-us/articles/7149319175826-Automatic-Rules)).
  - Filters ([help center article title](https://support.budgetbakers.com/hc/en-us/articles/7076754432146-Working-with-Filters)).
- **Budgets:** monthly, weekly or custom-period budgets per category, with alerts near the limit ([budgets feature page](https://budgetbakers.com/en/products/wallet/features/budgets/)).
- **Reporting:** cash-flow insights with visual reports and predictive analytics ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Multi-currency:** real-time exchange rates ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Portability:** REST API and MCP integration ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).
- **Sharing:** group sharing for households and shared savings goals ([Wallet product page](https://budgetbakers.com/en/products/wallet/)).

### 5. Money Lover

- **Positioning:** a simple spending manager with budgets, bills, savings goals, and debts and loans ([moneylover.me](https://moneylover.me/)).
- **Maintenance:** Google Play "Updated on Sep 4, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.bookmark.money&hl=en_US)). The AU App Store page showed an older version note (8.78.0, Sep 2024), so the iOS cadence was not confirmed ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).
- **Platforms:** iOS, Android and a web app ([web.moneylover.me](https://web.moneylover.me/)).
- **Pricing:**
  - Premium is a lifetime one-time purchase at $29.99.
  - The "Linked Wallet" bank-sync service is a separate subscription, e.g. $33.99–$40.99/year ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).
  - Premium unlocks unlimited wallets, budgets and events, removes ads, and adds CSV/Excel export ([support note, via search excerpt](https://note.moneylover.me/how-to-export-to-csv-or-excel/)).
- **Entry model:**
  - Manual or automatic entry ([moneylover.me](https://moneylover.me/)).
  - Bank sync in the Philippines, Malaysia, Singapore, Hong Kong, Vietnam, Thailand, Indonesia and other regions ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).
- **Fast entry:**
  - Receipt scanning extracts transaction details.
  - Apple Pay auto-tracking via the Shortcuts app ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).
  - Recurring bill notifications before the due date ([moneylover.me](https://moneylover.me/)).
- **Categorization:** **Events** group transactions for a trip, wedding or party, with an optional end date ([support note, via search excerpt](https://note.moneylover.me/how-to-use-event-feature-to-track-your-travel-other-events/)).
- **Reporting:** "One report to give a clear view on your spending patterns" ([moneylover.me](https://moneylover.me/)).
- **Budgets and goals:** budgets, savings goals, and debt and loan tracking ([moneylover.me](https://moneylover.me/)); a home-screen budget widget ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).
- **Multi-currency:** all currencies with up-to-date exchange rates ([moneylover.me](https://moneylover.me/)).
- **Portability:** export to Google Sheets ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)) and to .csv/.xls ([support note, via search excerpt](https://note.moneylover.me/how-to-export-to-csv-or-excel/)).
- **Bulk edits:** delete multiple transactions at once, per a recent iOS release note ([App Store, via search excerpt](https://apps.apple.com/uz/app/money-lover-money-manager/id486312413)).
- **Sharing:** shared wallets with budgets ([App Store AU](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)).

### 6. Toshl Finance

- **Positioning:** a playful expense and budget tracker across mobile and web, with tags, locations and flow graphs ([toshl.com](https://toshl.com/)).
- **Maintenance:** the site and pricing are live. The US App Store shows version 3.5.13 dated Dec 13, 2024 ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)). A 2026 Play "Updated on" date could not be extracted (see open questions).
- **Platforms:** iOS, Android and web with cloud sync ([toshl.com](https://toshl.com/)).
- **Pricing:**
  - Free: 2 accounts, 2 budgets, CSV export.
  - Pro: repeating entries, up to 4 attachments per transaction, CSV/PDF/Excel/Google/Evernote export, unlimited budgets.
  - Medici: adds bank connections. Pro and Medici have a 30-day trial ([pricing](https://toshl.com/pricing/)).
  - Pro costs $2.99/month or $19.99/year; Medici $4.99/month or $39.99/year ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
- **Entry model:**
  - Manual: "4 quick taps to add an expense or income".
  - File import in 8 formats ([toshl.com](https://toshl.com/)): CSV, Excel, QIF, QFX and OFX ([Google Play](https://play.google.com/store/apps/details?id=com.thirdframestudios.android.expensoor)).
  - Bank sync with "over 13,000 financial institutions" ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
- **Categorization:** category **and** tags, with multiple tags per entry ([toshl.com](https://toshl.com/); [App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
- **Reporting:**
  - A "river flow" graph of monthly money flow, a monthly overview comparing spending to time elapsed, a planning view, and category graphs ([toshl.com](https://toshl.com/)).
  - Month-over-month comparisons ([Google Play](https://play.google.com/store/apps/details?id=com.thirdframestudios.android.expensoor)).
  - A map of spending locations ([toshl.com](https://toshl.com/)).
- **Budgets:** budgets filtered by category, tag or account for any period, with optional rollover and limit notifications ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
- **Multi-currency:** about 200 currencies and 30 cryptocurrencies with live rates ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
- **Widgets:** home-screen widgets ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).

### 7. Bluecoins

- **Positioning:** an offline-capable expense tracker and reporting app with no bank login ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Maintenance:** Google Play "Updated on Sep 10, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.rammigsoftware.bluecoins&hl=en_US)). The iOS version is 2.3.0 ([App Store](https://apps.apple.com/us/app/bluecoins-finance-budget/id1590297575)).
- **Platforms:** Android, plus iOS since December 2022 ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Pricing:**
  - Free with ads; Premium is a one-time purchase, not a subscription ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
  - Premium adds cloud sync, notification auto-log, premium themes and the Future Projection calendar ([versions](https://www.bluecoinsapp.com/versions/)).
  - "Bluecoins +" is $15.99 on iOS ([App Store](https://apps.apple.com/us/app/bluecoins-finance-budget/id1590297575)).
- **Entry model:**
  - Manual.
  - Auto-logging "watches push notifications from banking apps and SMS and creates the transactions for you — no bank login, ever".
  - CSV and QIF import ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Recurring:** daily, weekly, monthly or custom recurring transactions, with due reminders logged automatically ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Split and transfers:**
  - Split transactions are shown in the app showcase ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
  - "Transfers move money between your own accounts and are recorded as transfers — a separate transaction type from income and expenses" ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Reporting:** date-grouped lists with running balances, a monthly calendar report, and a cash-flow timeline with drill-down, exportable to PDF, Excel or HTML ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Budgets:** per-category budgets over weekly, monthly, quarterly, yearly or custom ranges, with carry-over and a budget-vs-actual report ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Multi-currency:** any currency with live rates and net-worth conversion ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Portability / privacy:**
  - Manual and automatic backup to Google Drive, Dropbox or OneDrive.
  - Data lives on the device and the app works offline ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
- **Sharing:** anyone given access to the shared cloud folder can enter expenses too ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).

### 8. Cashew (open source)

- **Positioning:** a budget and expense tracker with flexible budget periods and many automation hooks; no bank connection required ([App Store](https://apps.apple.com/us/app/cashew-expense-budget-tracker/id6463662930)).
- **Maintenance:**
  - Google Play "Updated on Jul 9, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.budget.tracker_app&hl=en_US)); App Store version 5.8 ([App Store](https://apps.apple.com/us/app/cashew-expense-budget-tracker/id6463662930)).
  - The repo's latest *tagged GitHub release* is 5.3.4 from 2024-07-01, but its last push was 2026-03-09 ([GitHub API](https://api.github.com/repos/jameskokoska/Cashew)).
- **License:** GPL-3.0 ([GitHub](https://github.com/jameskokoska/Cashew)).
- **Platforms:** App Store, Google Play, GitHub releases, and a web PWA ([README](https://github.com/jameskokoska/Cashew)).
- **Pricing:** free, with Cashew Pro at $1.49/month, $11.99/year or $19.99 lifetime ([App Store](https://apps.apple.com/us/app/cashew-expense-budget-tracker/id6463662930)).
- **Entry model:** manual entry plus these automation paths ([FAQ, Automation](https://cashewapp.web.app/faq.html)):
  - App Links (URLs that create prefilled transactions) on Android, iOS and web.
  - Siri Shortcuts with Apple Pay on iOS.
  - Notification and SMS scanning on Android and iOS.
  - An Android broadcast receiver.
  - Import and export with an external Google Sheet.
  - AI entry via Gemini or Apple Intelligence.
- **Transaction types:** upcoming, subscription, repeating, debts (borrowed) and credit (lent) ([README](https://github.com/jameskokoska/Cashew)).
- **Scheduled payments:** can require the amount at confirmation ("Confirm Amount if transaction amount is 0") ([FAQ](https://cashewapp.web.app/faq.html)).
- **Categorization / search:**
  - Custom categories with icons.
  - "Custom Titles" that auto-assign similar transactions.
  - Search and filters by date, category, amount or tags ([README](https://github.com/jameskokoska/Cashew)).
- **Budgets and goals:** custom budget periods (monthly, weekly, daily, custom), category limits per budget, past budget history, and savings and spending goals ([README](https://github.com/jameskokoska/Cashew)).
- **Transfers:** credit-card payments are handled as transfers between accounts or as a "Balance Correction" ([FAQ](https://cashewapp.web.app/faq.html)).
- **Multi-currency:** multiple currencies and accounts, showing original and converted amounts ([README](https://github.com/jameskokoska/Cashew)).
- **Portability:** Google Drive backup, cross-device sync, and CSV and Google Sheets import ([README](https://github.com/jameskokoska/Cashew)).
- **Sharing:** only by sharing one Google account; other sync methods are declined "due to privacy concerns" ([FAQ](https://cashewapp.web.app/faq.html)).
- **Privacy:** biometric lock and Google login ([README](https://github.com/jameskokoska/Cashew)).

### 9. Actual Budget (open source)

- **Positioning:** a local-first envelope-budgeting app with optional self-hosted sync ([actualbudget.org](https://actualbudget.org/)).
- **Maintenance:** release v26.9.0 on 2026-09-01 ([GitHub API](https://api.github.com/repos/actualbudget/actual/releases)).
- **License:** MIT ([GitHub API](https://api.github.com/repos/actualbudget/actual)).
- **Platforms:**
  - Desktop apps for Windows, Mac and Linux with automated backups and offline use.
  - A web server installable as an offline-capable PWA on mobile.
  - Hosting via PikaPods, Fly.io or Docker. There is no native mobile app ([install docs](https://actualbudget.org/docs/install/)).
- **Pricing:** open source and self-hosted; hosting is paid to the host, and part of the PikaPods cost is donated ([install docs](https://actualbudget.org/docs/install/)).
- **Entry model:**
  - Manual.
  - Import of QIF, OFX, QFX, CAMT.053 and CSV.
  - Bank sync via GoCardless (EU/UK) and SimpleFIN (US/Canada) ([actualbudget.org](https://actualbudget.org/)).
- **Recurring:**
  - **Schedules** recur on set days or intervals, with an optional "Automatically add transaction".
  - Without it, a scheduled transaction needs approval before posting.
  - A configurable "upcoming" window, and matching of real transactions within ±2 days ([schedules docs](https://actualbudget.org/docs/schedules)).
- **Rules:**
  - Conditions (is, contains, regex, one of) and actions on category, payee, notes, date and amount.
  - Pre, default and post stages.
  - Rules are **created automatically** as you rename payees or categorize transactions ([rules docs](https://actualbudget.org/docs/budgeting/rules/)).
- **Split transactions:** splits across categories must total the parent. "Distribute" spreads a remainder evenly or proportionally, and splits can be undone ([split docs](https://actualbudget.org/docs/transactions/split-transactions/)).
- **Transfers:**
  - A transfer between two on-budget accounts has no category, because the funds "both left and entered your budget".
  - Off-budget to on-budget transfers need a category on the budget side ([transfers docs](https://actualbudget.org/docs/transactions/transfers/)).
- **Refunds:** enter a return as a deposit "and choose the same category as the original purchase", so the money is available again in that category ([returns docs, via search excerpt](https://actualbudget.org/docs/budgeting/returns-and-reimbursements/)).
- **Reporting:**
  - Customizable dashboards with cash flow, net worth, spending analysis, summary card (sum or monthly average), a **calendar card** of daily income and expenses, crossover point, and custom reports.
  - Dynamic or fixed date ranges ([reports docs](https://actualbudget.org/docs/reports/)).
- **Portability:** "Export Data" from Settings at any time; manual backups in the desktop app ([backup docs](https://actualbudget.org/docs/backup-restore/backup/)).

### 10. Firefly III (open source)

- **Positioning:** a self-hosted, double-entry personal finance manager with a rule engine and REST API ([GitHub README](https://github.com/firefly-iii/firefly-iii)).
- **Maintenance:** stable v6.6.6 on 2026-07-01, develop builds as recent as 2026-09-12 ([GitHub API](https://api.github.com/repos/firefly-iii/firefly-iii/releases)).
- **License:** AGPL-3.0 ([GitHub API](https://api.github.com/repos/firefly-iii/firefly-iii)).
- **Platforms / pricing:** self-hosted (Docker image available); open source ([GitHub README](https://github.com/firefly-iii/firefly-iii)).
- **Entry model:**
  - Manual.
  - A separate Data Importer handles CSV and CAMT files and data providers including GoCardless, SimpleFIN, Enable Banking, teller.io and Lunch Flow ([docs navigation](https://docs.firefly-iii.org/tutorials/finances/refund/)).
- **Features:** rule-based transaction handling, recurring transactions, budgets, categories, tags, "piggy banks" for savings goals, any currency, a REST JSON API, income and expense reports, and 2FA ([GitHub README](https://github.com/firefly-iii/firefly-iii)).
- **Transaction types:**
  - Withdrawal (asset account to expense account), deposit (revenue to asset account) and transfer (between asset accounts) ([transaction types, via search excerpt](https://docs.firefly-iii.org/references/firefly-iii/transaction-types/)).
  - Any type can be split, but all splits must share a type ([transactions docs, via search excerpt](https://docs.firefly-iii.org/explanation/financial-concepts/transactions/)).
- **Refunds:**
  - "Firefly III does not offer the option to automatically merge … a refund into the original transaction".
  - You either edit the original expense down (recommended when the vendor erred) or add a deposit and raise the budget (recommended when you overspent).
  - For cashback, the docs suggest recording only the net price ([refund tutorial, page dated 2026-09-07](https://docs.firefly-iii.org/tutorials/finances/refund/)).

### 11. YNAB (You Need A Budget)

- **Positioning:** a budgeting-method app (every dollar planned) that is still transaction-centric ([features](https://www.ynab.com/features)).
- **Platforms:** computer, phone and tablet, "even offline" ([features](https://www.ynab.com/features)).
- **Pricing:** 34-day free trial with no card; $14.99/month or $109/year ([features page schema](https://www.ynab.com/features)).
- **Entry model:**
  - Three paths: manual entry, file-based import (CSV preferred; QFX/OFX), and Direct Import from linked banks.
  - Imports match manual entries of the same amount within ten days, and exact duplicates are skipped ([help, via search excerpt](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo); [adding transactions](https://support.ynab.com/en_us/how-to-add-transactions-in-ynab-HyDwA_byi)).
- **Recurring:** scheduled transactions "plan for future and repeating transactions right in the account register, and see what expenses are coming up" ([help](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9)).
- **Split:** for spending from multiple categories or payees in one transaction ([help](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q)).
- **Refunds:** the category for a return inflow "depends on whether the purchase was planned for initially in YNAB or not" ([help](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj)).
- **Reporting:** spending and net worth reports, including average grocery spend ([features](https://www.ynab.com/features)).
- **Goals:** "targets" for spending and saving; a loan planner ([features](https://www.ynab.com/features)).
- **Sharing:** YNAB Together shares one subscription with up to six people ([features](https://www.ynab.com/features)).

### 12. Goodbudget

- **Positioning:** envelope budgeting for households, with manual entry at its core ([goodbudget.com](https://goodbudget.com/)).
- **Maintenance:** Google Play "Updated on Aug 6, 2026" ([Google Play](https://play.google.com/store/apps/details?id=com.dayspringtech.envelopes&hl=en_US)).
- **Platforms:** web, iOS and Android ([goodbudget.com](https://goodbudget.com/)).
- **Pricing:**
  - Free: 10 regular and 10 more envelopes, 1 account, 2 devices, 1 year of history, debt tracking.
  - Premium ($10/month or $80/year): automatic bank sync (US banks only), unlimited envelopes and accounts, 5 devices, 7 years of history ([signup/pricing](https://goodbudget.com/signup)).
  - Bank sync arrived with the Premium plan in 2024 ([blog](https://goodbudget.com/blog/2024/08/changes-to-goodbudgets-plan-offerings/)).
- **Budgets:** "plan your spending instead of just tracking your spending"; saving months ahead for big expenses ([what you get](https://goodbudget.com/what-you-get/)).
- **Debt:** Debt Accounts on the web show payoff progress ([what you get](https://goodbudget.com/what-you-get/)).
- **Sharing:** sync across household members' iPhones and Androids ([what you get](https://goodbudget.com/what-you-get/)).

### 13. Vuallet (Mexico-focused)

- **Positioning:** a personal finance app "for Mexico" that never connects to your bank: "Vuallet no accede a tu banco ni pide tus claves" ([vuallet.com](https://www.vuallet.com/)).
- **Maturity:** a young product in public beta ([vuallet.com](https://www.vuallet.com/)). Treat it as a local reference for UX ideas, not a proven product.
- **Platforms:**
  - A web app at vuallet.app ([vuallet.com](https://www.vuallet.com/)).
  - The vendor's own guide claims Web, iOS and Android ([vendor guide](https://www.vuallet.com/guia/mejores-apps-finanzas-personales-mexico)).
- **Pricing:** conflicting vendor statements.
  - Homepage: "Beta gratuita", no card required ([vuallet.com](https://www.vuallet.com/)).
  - Vendor guide: "Gratis / desde $149 MXN/mes" ([vendor guide](https://www.vuallet.com/guia/mejores-apps-finanzas-personales-mexico)).
- **Entry model:** manual forms, "comandos inteligentes" such as `/gasto`, `/ingreso` and `/pago` in natural language, and receipt ("ticket") scanning ([vuallet.com](https://www.vuallet.com/)).
- **Categories:** Spanish starter categories such as Alimentación, Vivienda, Servicios, Transporte and Entretenimiento ([vuallet.com](https://www.vuallet.com/)).
- **Budgets / reporting:** monthly category budgets with alerts, expense distribution, income-vs-expense trends, and 12-month balance evolution ([vuallet.com](https://www.vuallet.com/)).
- **Local context:** Banxico indicators (dollar, INPC inflation, UDIS) on the dashboard; shared family use ([vendor guide](https://www.vuallet.com/guia/mejores-apps-finanzas-personales-mexico)).

### Excluded: Fintonic

- Fintonic is a bank-aggregation app. Its current site is Spanish-focused, with a country selector still listing Spain, Mexico and Chile, and read-only bank connections authorized by the Banco de España ([fintonic.com](https://www.fintonic.com/)).
- `www.fintonic.mx` did not resolve in DNS on 2026-09-13.
- A non-vendor article says Fintonic stopped operating for Mexican users by June 2026 ([asesoresinversion.com, secondary](https://asesoresinversion.com/academia/finanzas-personales/fintonic-el-app-para-controlar-gastos/)).
- Excluded because its Mexico availability can't be confirmed from a primary source and it is bank-sync-only.

---

## Patterns worth borrowing for Finance Buddy

### (a) Fits the current single-user, manual-entry, MXN model with little domain change

1. **Recurring entries with a confirm step.**
   - Evidence: Monefy auto-posts recurring records on schedule ([Monefy FAQ](https://monefy.com/faq)). Actual lets each schedule either auto-add or wait for approval, and shows an "upcoming" window ([Actual schedules](https://actualbudget.org/docs/schedules)). Wallet offers manual or automatic confirmation with due-date notifications ([Wallet help](https://support.budgetbakers.com/hc/en-us/articles/7149523920786-Setup-Planned-Payments)). Cashew can ask for the amount at confirmation for variable bills ([Cashew FAQ](https://cashewapp.web.app/faq.html)).
   - For Finance Buddy: an upcoming entry the owner confirms (optionally editing the amount) keeps a manual journal truthful. A future-dated "planned" entry must stay out of totals until confirmed. That is a new term for `CONTEXT.md`, not a currency or account change.
2. **Templates / bookmarks for frequent entries.**
   - Evidence: Wallet templates prefill category, amount, type, payee, labels and note ([Wallet help](https://support.budgetbakers.com/hc/en-us/articles/7077050225042-Using-Templates)). Money Manager bookmarks do the same ([Realbyte help](https://help.realbyteapps.com/hc/en-us/articles/360042743374-How-to-make-a-bookmark)).
   - For Finance Buddy: this maps directly onto `{ kind, amount, categoryId, note }`. A cheaper variant is "duplicate this entry" from the registry.
3. **Autofill category from the note/title.**
   - Evidence: Cashew's "Custom Titles" auto-assign similar transactions ([Cashew README](https://github.com/jameskokoska/Cashew)). Actual turns manual categorizations into rules automatically ([Actual rules](https://actualbudget.org/docs/budgeting/rules/)).
   - For Finance Buddy: suggest the last category used with a matching note. This is a suggestion only, so the optional-category rule is unchanged.
4. **Search and filter across the journal.**
   - Evidence: Cashew filters by date, category, amount and tags ([Cashew README](https://github.com/jameskokoska/Cashew)). Money Manager has advanced filtering ([realbyteapps.com](https://realbyteapps.com/)). Wallet has filters ([Wallet help](https://support.budgetbakers.com/hc/en-us/articles/7076754432146-Working-with-Filters)).
   - For Finance Buddy: today the registry is period-scoped only. Searching notes and filtering by kind or category (including archived and Uncategorized) needs no schema change.
5. **Calendar view of daily totals.**
   - Evidence: Money Manager's calendar view ([realbyteapps.com](https://realbyteapps.com/)), Bluecoins' monthly calendar report ([bluecoinsapp.com](https://www.bluecoinsapp.com/)), and Actual's calendar card of daily income and expenses ([Actual reports](https://actualbudget.org/docs/reports/)).
   - For Finance Buddy: the month period already exists with Mexico City day boundaries, so a calendar grid is a new rendering of the same summary.
6. **Faster capture.**
   - Evidence: Monefy's two-tap add and built-in calculator ([monefy.com](https://monefy.com/); [App Store](https://apps.apple.com/us/app/monefy-budget-money-manager/id1212024409)). Toshl's "4 quick taps" ([toshl.com](https://toshl.com/)). Vuallet's `/gasto` natural-language commands ([vuallet.com](https://www.vuallet.com/)). Cashew's App Links that open a prefilled transaction, which work on the **web** too ([Cashew FAQ](https://cashewapp.web.app/faq.html)).
   - For Finance Buddy, as a web app: a prefilled-entry URL (usable from an iOS Shortcut or bookmark), amount arithmetic in the amount field, and a keyboard-first quick-add are the transferable parts.
7. **Tags / labels / events as a second, cross-cutting grouping.**
   - Evidence: Toshl's multiple tags per entry ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)), Spendee labels ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)), Wallet labels ([Wallet help](https://support.budgetbakers.com/hc/en-us/articles/7076564578066-Utilising-Labels)), Firefly tags ([README](https://github.com/firefly-iii/firefly-iii)), and Money Lover events for trips ([support note](https://note.moneylover.me/how-to-use-event-feature-to-track-your-travel-other-events/)).
   - For Finance Buddy: this adds an entity, so it is modest rather than trivial. It stays inside the single-currency manual model, and it answers "how much did the trip cost" without distorting categories.
8. **Full-journal export and import (backup), distinct from period snapshots.**
   - Evidence: Actual's "Export Data" at any time ([Actual backup](https://actualbudget.org/docs/backup-restore/backup/)). Money Manager's Excel export and bulk Excel import ([Realbyte help](https://help.realbyteapps.com/hc/en-us/articles/360043223253-How-to-import-bulk-data-by-Excel-file)). Toshl's CSV export on the free tier ([pricing](https://toshl.com/pricing/)). Cashew's CSV/Google Sheets import ([README](https://github.com/jameskokoska/Cashew)).
   - For Finance Buddy: today's exports are period-scoped snapshots. A whole-journal CSV is the portability baseline most reference apps offer; import would need an idempotency design like the existing entry UUIDs.
9. **Bulk actions in the registry.**
   - Evidence: Money Lover added multi-select delete ([App Store excerpt](https://apps.apple.com/uz/app/money-lover-money-manager/id486312413)). Actual documents bulk actions ([Actual docs page title](https://actualbudget.org/docs/transactions/bulk-editing/)).
   - For Finance Buddy: bulk re-categorize or delete fits the existing correction and deletion semantics.
10. **Pace-of-period indicator on the Dashboard.**
    - Evidence: Toshl's monthly overview compares spending to the time elapsed ([toshl.com](https://toshl.com/)). Toshl also shows month-over-month comparisons ([Google Play](https://play.google.com/store/apps/details?id=com.thirdframestudios.android.expensoor)). Actual's summary card offers a monthly average ([Actual reports](https://actualbudget.org/docs/reports/)).
    - For Finance Buddy: this complements the existing trend vs. prior equal span without introducing budgets.

### (b) Larger domain additions that would need an ADR

- **Budgets / spending limits.** Nearly every reference app has them:
  - Per-category, custom periods and carry-over in Bluecoins ([bluecoinsapp.com](https://www.bluecoinsapp.com/)).
  - Rollover and budgets filtered by tag or account in Toshl ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)).
  - Custom periods and past history in Cashew ([README](https://github.com/jameskokoska/Cashew)).
  - Envelope models in Actual, YNAB and Goodbudget ([Actual](https://actualbudget.org/); [Goodbudget](https://goodbudget.com/what-you-get/)).
  - In Finance Buddy's model this needs a decision on how refunds (which already reduce total expenses) offset a budget. Actual's refund-to-original-category approach is one worked answer ([Actual returns](https://actualbudget.org/docs/budgeting/returns-and-reimbursements/)).
- **Multi-currency.** Almost universal among the reference apps: Monefy converts on transfer ([FAQ](https://monefy.com/faq)), Money Manager allows per-entry currencies ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810)), Toshl lists ~200 currencies ([App Store](https://apps.apple.com/us/app/toshl-finance-best-budget/id921590251)). Supporting it would supersede ADR 0001.
- **Accounts and transfers.**
  - Bluecoins, Firefly and Actual model transfers as their own type between accounts ([Bluecoins](https://www.bluecoinsapp.com/); [Firefly types](https://docs.firefly-iii.org/references/firefly-iii/transaction-types/); [Actual transfers](https://actualbudget.org/docs/transactions/transfers/)).
  - Cashew handles card repayments as a transfer or a balance correction ([FAQ](https://cashewapp.web.app/faq.html)).
  - Finance Buddy has no accounts, so balances, reconciliation and card-payment tracking all depend on this decision.
- **Bank sync or file import.**
  - Direct sync: YNAB, Actual (GoCardless/SimpleFIN), Wallet (15,000 banks), Toshl Medici, Goodbudget Premium (US only) ([YNAB](https://support.ynab.com/en_us/how-to-add-transactions-in-ynab-HyDwA_byi); [Actual](https://actualbudget.org/); [Wallet](https://budgetbakers.com/en/products/wallet/); [Toshl](https://toshl.com/pricing/); [Goodbudget](https://goodbudget.com/signup)).
  - Middle ground that keeps the owner in control: file import with duplicate matching, as in YNAB's same-amount ±10-day matching ([YNAB help](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo)).
  - None of the reviewed vendors documents Mexican bank coverage (see open questions).
- **Receipts / attachments / OCR.**
  - Spendee's AI scanner ([App Store](https://apps.apple.com/us/app/spendee-budget-money-tracker/id635861140)), Money Lover's receipt scanning ([App Store](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)), Toshl's 4 attachments per entry on Pro ([pricing](https://toshl.com/pricing/)), Vuallet's ticket scanning ([vuallet.com](https://www.vuallet.com/)), and Money Manager's Photo Save ([realbyteapps.com](https://realbyteapps.com/)).
  - Needs file storage, retention and privacy decisions, and changes what an export snapshot contains.
- **Split transactions.**
  - Actual's split with Distribute ([docs](https://actualbudget.org/docs/transactions/split-transactions/)), YNAB ([help](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q)), Firefly (same-type splits only) ([docs](https://docs.firefly-iii.org/explanation/financial-concepts/transactions/)), and Bluecoins ([site](https://www.bluecoinsapp.com/)).
  - Needs parent and child entries; that affects the correction/delete rules, the per-category breakdown, and the idempotent entry UUIDs.
- **Notification/SMS auto-capture and AI entry.**
  - Bluecoins and Cashew parse bank notifications and SMS; Cashew also offers Gemini or Apple Intelligence entry ([Bluecoins](https://www.bluecoinsapp.com/); [Cashew FAQ](https://cashewapp.web.app/faq.html)).
  - These are native-app capabilities; a web app could only approximate them through a share or URL endpoint.
- **Sharing / household.**
  - Spendee shared wallets ([pricing](https://www.spendee.com/pricing)), Wallet groups ([product](https://budgetbakers.com/en/products/wallet/)), YNAB Together ([features](https://www.ynab.com/features)), and Goodbudget devices ([signup](https://goodbudget.com/signup)).
  - This conflicts with the private single-owner admission policy.
- **Savings goals, debts and loans, forecasting.**
  - Money Lover goals and debts ([moneylover.me](https://moneylover.me/)), Cashew debts and credit types ([README](https://github.com/jameskokoska/Cashew)), Firefly piggy banks ([README](https://github.com/firefly-iii/firefly-iii)), Wallet cash-flow forecasting ([planned payments](https://budgetbakers.com/en/products/wallet/features/planned-payments/)), and the Bluecoins Future Projection calendar ([versions](https://www.bluecoinsapp.com/versions/)).
- **Locations.** Toshl's spending map ([toshl.com](https://toshl.com/)) and Spendee's per-expense location ([spendee.com](https://www.spendee.com/)).

### (c) What Finance Buddy already does, compared with the reference apps

- **Refunds as a first-class type.**
  - Finance Buddy has an explicit `refund` kind that reduces total expenses in the period received and uses expense categories.
  - The closest documented match is Actual: a return is a deposit in the original purchase's category ([Actual returns](https://actualbudget.org/docs/budgeting/returns-and-reimbursements/)). YNAB likewise categorizes return inflows against spending categories depending on the plan ([YNAB help](https://support.ynab.com/en_us/credit-card-refunds-and-returns-H1J7qDWkj)).
  - Firefly differs: it cannot link a refund to the original, and recommends editing the original down or recording a deposit ([Firefly refund](https://docs.firefly-iii.org/tutorials/finances/refund/)).
  - None of the reviewed consumer apps (Monefy, Money Manager, Spendee, Wallet, Money Lover, Toshl, Bluecoins, Cashew) documents a dedicated refund type on the pages reviewed. Finance Buddy's explicit kind, and its "refund never counts as income" rule, is more explicit than most.
- **Transfers.**
  - Finance Buddy excludes transfers from totals by not recording them, because it has no accounts.
  - Account-based apps reach the same totals effect with a separate transfer type (Bluecoins, Firefly) or category-less on-budget transfers (Actual) ([Bluecoins](https://www.bluecoinsapp.com/); [Firefly types](https://docs.firefly-iii.org/references/firefly-iii/transaction-types/); [Actual transfers](https://actualbudget.org/docs/transactions/transfers/)).
  - What Finance Buddy gives up is balances and card-repayment tracking.
- **Period views and trends.**
  - Day/week/month summaries match Money Manager's weekly and monthly totals ([realbyteapps.com](https://realbyteapps.com/)) and Cashew's daily, weekly and monthly budget periods ([README](https://github.com/jameskokoska/Cashew)).
  - The trend against an equally long prior span resembles Toshl's month-over-month comparisons ([Google Play](https://play.google.com/store/apps/details?id=com.thirdframestudios.android.expensoor)) and Actual's spending analysis ([reports](https://actualbudget.org/docs/reports/)).
  - None of the reviewed apps documents timezone-anchored period boundaries the way Finance Buddy does.
- **Exports.**
  - Google Sheets export also appears in Money Lover ([App Store](https://apps.apple.com/au/app/money-lover-expense-tracker/id486312413)), Toshl Pro ([pricing](https://toshl.com/pricing/)) and Cashew ([FAQ](https://cashewapp.web.app/faq.html)). Cashew's is two-way (import/export to an external sheet); Finance Buddy's is a deliberate one-way snapshot.
  - PDF reports exist in Toshl Pro and Bluecoins ([pricing](https://toshl.com/pricing/); [bluecoinsapp.com](https://www.bluecoinsapp.com/)).
  - Finance Buddy's snapshots cover a period; most reference apps export raw transactions or whole datasets instead (see (a)8).
- **Manual-entry-first, no bank credentials.**
  - Finance Buddy is in good company: Monefy ([monefy.com](https://monefy.com/)), Bluecoins ("no bank login, ever") ([bluecoinsapp.com](https://www.bluecoinsapp.com/)), Cashew (no bank connection required) ([App Store](https://apps.apple.com/us/app/cashew-expense-budget-tracker/id6463662930)), Goodbudget Free ([signup](https://goodbudget.com/signup)) and Vuallet ([vuallet.com](https://www.vuallet.com/)).
  - Several of them market this as a privacy benefit.
- **Google identity.** Cashew also relies on Google login and Google Drive, and declines other sharing methods over privacy concerns ([Cashew FAQ](https://cashewapp.web.app/faq.html)). This is similar to Finance Buddy's Google-only, owner-only stance.
- **Single currency (MXN).** Finance Buddy is the outlier: every app with a documented currency stance supports multiple currencies. Vuallet shows that a Mexico-only product can add local value, such as Banxico indicators, instead ([vendor guide](https://www.vuallet.com/guia/mejores-apps-finanzas-personales-mexico)).
- **Category lifecycle.** Finance Buddy archives categories rather than deleting them (ADR 0004). No reviewed vendor page documented category archive semantics. The nearest analogue is Monefy's hiding of archived *accounts* on Premium ([FAQ](https://monefy.com/faq)).
- **Subcategories.** Money Manager and Wallet offer them ([App Store](https://apps.apple.com/us/app/money-manager-expense-budget/id560481810); [Wallet help](https://support.budgetbakers.com/hc/en-us/articles/7077082048146-All-about-Categories-and-Subcategories)). Finance Buddy has flat lists; adding hierarchy would interact with ADR 0005 name uniqueness and the six-group "Other categories" folding in trends.

---

## Open questions / couldn't verify

- **Realbyte and BudgetBakers help centers** blocked automated access (Cloudflare). Money Manager bookmarks, repeat, Excel export and PC Manager details, and Wallet templates, rules and labels, rest on the vendors' own help-article titles and search excerpts rather than full page reads.
- **YNAB help articles** render client-side. The split, scheduled-transaction and refund details are limited to the vendor's article descriptions. The exact refund-categorization rule wasn't read in full.
- **Toshl maintenance:** the US App Store listing showed version 3.5.13 dated Dec 13, 2024; a 2026 Google Play "Updated on" date couldn't be extracted. The site and pricing are live.
- **Toshl Medici bank coverage:** the App Store says 13,000+ institutions, while a Google search excerpt says US or Canadian banks. Not reconciled.
- **Money Lover iOS cadence:** the AU App Store showed a Sep 2024 version note, while Google Play shows Sep 4, 2026. Recent iOS release notes came only through a search excerpt.
- **Cashew release channel:** the latest tagged GitHub release is 2024-07-01, while the store builds are newer (Play updated Jul 9, 2026) and the repo was last pushed 2026-03-09. It's unclear whether store builds match public source.
- **Monefy CSV/Excel export** is claimed only in a vendor blog article, not in the help center or store listing. The Monefy Premium price ($59.99) is as shown in the US App Store in-app purchase list; the billing period wasn't confirmed.
- **Vuallet pricing and platforms** conflict between the homepage (free beta, web) and the vendor guide (from $149 MXN/month; Web, iOS, Android). The company's identity and launch date weren't found.
- **Fintonic in Mexico:** only a secondary source states it shut down. `fintonic.mx` didn't resolve, and the vendor's main site still lists Mexico in its country selector.
- **Other Mexican apps** named in local listicles (Zenfi, Finerio, Finamate) weren't researched from primary sources.
- **Mexican bank coverage** for Wallet, Spendee and Toshl bank sync wasn't verified.
- **Refund handling** isn't documented on the pages reviewed for Monefy, Money Manager, Spendee, Wallet, Money Lover, Toshl, Bluecoins, Cashew or Goodbudget.
- **"?" cells** in the table (calendar views, split, tags, multi-currency for YNAB and Goodbudget, and so on) mean "not found in primary sources", not "absent".
