# Bound category names and keep them unique per list

A category name is stored trimmed of surrounding whitespace, holds at least one character, stays within 40 characters, and carries no line breaks or other control characters. Names are unique case-insensitively within one owner's income list and within their expense list, counting archived categories, so the same name may appear once in each list while a name that is already taken is restored or renamed instead of recreated. The bound and the uniqueness rule are enforced by a database constraint and a unique index as well as by request validation, so no path can store a name the page would refuse.

Counting archived categories in the uniqueness rule keeps history readable: two categories with the same name in the same list would be indistinguishable on past entries and in summaries. The cost is that creating a name reserved by an archived category is refused, which the page answers by pointing at restoring that category.

Renaming keeps the category's identity. Entries and summaries reference a category by its identifier, so a rename shows immediately wherever the category appears and never recategorizes a recorded financial movement.
