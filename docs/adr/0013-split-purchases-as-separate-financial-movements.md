---
status: accepted
---

# Record a split purchase as several financial movements

One purchase sometimes covers several categories, such as a supermarket receipt with both groceries and household goods. Actual, YNAB, Firefly III and Bluecoins support **split transactions**: one transaction whose category lines must add up to its amount. Finance Buddy takes the simpler route, which needs no domain change. A split purchase is recorded as several financial movements, one per category, sharing the movement date and a note that names the purchase (or a tag, if tags are adopted).

## Considered options

**(a) One financial movement with category lines** that sum exactly to its amount. The benefit is that one entry mirrors the receipt: it has one entry id and one total that matches a card statement line, and deleting it removes the whole purchase at once. The costs reach across the model:

- The category moves from the movement to its lines, so spending by category, trends and the "Other categories" group all have to read through lines.
- The existing correction rules (an entry keeps an archived category it already carries, and categories must belong to the movement type's list) would apply per line, and a correction would replace all lines together.
- Conversion (ADR 0007) would have to spread one rounded converted amount across the lines without losing a minor unit.
- Both export snapshots would need a row per line under each movement.

**(b) Several movements sharing a note.**

- Spending by category is already exact, because each piece has its own category.
- Refunding one item is already its own movement, in that item's category, on the date the money is received.
- Snapshots list each piece as an ordinary row.

The costs:

- The receipt total appears nowhere; the owner adds it up.
- Correcting or deleting the purchase means handling each piece, and deleting only some pieces is possible.
- For a foreign-currency purchase, the owner must divide the charged amount (ADR 0007) across the pieces.

## Why (b)

Splits are occasional in a journal entered by hand. Option (b) keeps every current rule exactly as it is: refund arithmetic, category kinds, archived categories, idempotent entry ids and the shape of snapshots. Its weaknesses are about convenience, not correctness, and the registry can soften them, for example by starting the next piece from the first. Reconsider (a) if statement import (ADR 0011) is adopted, because matching one statement line to one financial movement is where a missing purchase total becomes a real cost. Transfers are unaffected either way.
