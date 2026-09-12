-- Category names are owner-scoped, list-scoped and case-insensitively unique,
-- counting archived categories so a name is restored instead of recreated.
ALTER TABLE category
  ADD CONSTRAINT category_name_check
    CHECK (btrim(name) = name AND length(name) BETWEEN 1 AND 40
      AND name !~ '[[:cntrl:]]');
CREATE UNIQUE INDEX category_owner_kind_name
  ON category(owner_id, kind, lower(name));
