import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./database";
import { seedCategories } from "./journal";
import {
  categoryIdentifierTaken,
  categoryKinds,
  categoryMissing,
  categoryName,
  categoryNameRule,
  categoryNameTaken,
  type CategoryChange,
  type CategoryError,
  type CategoryLists,
  type ManagedCategory,
} from "./financial";

export async function listCategories(owner: string): Promise<CategoryLists> {
  await seedCategories(owner);
  const { rows } = await database().query(
    "SELECT id, kind, name, active FROM category WHERE owner_id=$1 ORDER BY lower(name), id",
    [owner],
  );
  return Object.fromEntries(
    categoryKinds.map((kind) => [
      kind,
      (rows as ManagedCategory[]).filter((row) => row.kind === kind),
    ]),
  ) as CategoryLists;
}

// Every change is scoped to the owner by the statement itself, so a category
// identifier belonging to someone else simply matches nothing. Renaming and
// archiving keep the row's identity, which is what entries and summaries read.
export async function changeCategory(
  owner: string,
  change: CategoryChange,
): Promise<CategoryError | undefined> {
  await seedCategories(owner);
  try {
    if (change.action === "create") {
      // A creation claims its identifier first, whether the client named it or
      // not. Repeating the same creation finds the category it already made;
      // the identifier never becomes a different category, or anyone else's.
      const id = change.id ?? randomUUID();
      const name = categoryName(change.name);
      const created = await database().query(
        "INSERT INTO category(id, owner_id, kind, name) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
        [id, owner, change.kind, name],
      );
      if (created.rowCount) return;
      const repeated = await database().query(
        "SELECT 1 FROM category WHERE owner_id=$1 AND id=$2 AND kind=$3 AND name=$4",
        [owner, id, change.kind, name],
      );
      if (!repeated.rowCount)
        return { field: "id", message: categoryIdentifierTaken };
      return;
    }
    const changed =
      change.action === "rename"
        ? await database().query(
            "UPDATE category SET name=$3 WHERE owner_id=$1 AND id=$2",
            [owner, change.id, categoryName(change.name)],
          )
        : await database().query(
            "UPDATE category SET active=$3 WHERE owner_id=$1 AND id=$2",
            [owner, change.id, change.action === "restore"],
          );
    if (!changed.rowCount) return { field: "id", message: categoryMissing };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { field: "name", message: categoryNameTaken };
    if (code === "23514") return { field: "name", message: categoryNameRule };
    throw error;
  }
}
