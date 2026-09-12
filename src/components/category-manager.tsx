"use client";
import { useState } from "react";
import {
  categoryActionDetails,
  categoryKindDetails,
  categoryKinds,
  categoryNameLimit,
  validateCategoryChange,
  type CategoryChange,
  type CategoryError,
  type CategoryKind,
  type CategoryLists,
  type ManagedCategory,
} from "@/lib/financial";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

export function CategoryManager({
  initial,
}: {
  initial: CategoryLists | null;
}) {
  const [lists, setLists] = useState(initial);
  const [loadError, setLoadError] = useState(!initial);
  const [loading, setLoading] = useState(false);
  // The change currently in flight, so only its own control reads as busy.
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] =
    useState<CategoryError["field"]>(null);
  // The control the refused change came from, so only that name field is marked
  // and a second form is never made to look at fault.
  const [invalidKey, setInvalidKey] = useState("");
  const [success, setSuccess] = useState("");
  const [renaming, setRenaming] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [newNames, setNewNames] = useState<Record<string, string>>({
    income: "",
    expense: "",
  });
  const busy = loading || pending !== "";

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/categories", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setLists(await response.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  // One control per change, named by the change itself, so exactly the control
  // the owner pressed reads as busy and only its own field is ever marked.
  function changeKey(change: CategoryChange) {
    return `${change.action}:${change.action === "create" ? change.kind : change.id}`;
  }
  function nameProps(key: string) {
    const invalid = invalidField === "name" && invalidKey === key;
    return {
      "aria-invalid": invalid,
      "aria-describedby": invalid ? "category-error" : undefined,
    };
  }
  function refuse(failure: CategoryError, key: string) {
    setError(failure.message);
    setInvalidField(failure.field);
    setInvalidKey(key);
    requestAnimationFrame(() =>
      document.getElementById("category-error")?.focus(),
    );
  }
  // Creating is the one change that is not idempotent; a retry after a lost
  // response is refused as a duplicate name rather than adding a second copy.
  async function apply(change: CategoryChange) {
    const key = changeKey(change);
    if (busy) return;
    setSuccess("");
    const invalid = validateCategoryChange(change);
    if (invalid) return refuse(invalid, key);
    setPending(key);
    setError("");
    setInvalidField(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const result = await response.json();
      if (!response.ok)
        return refuse(
          {
            field: result.field ?? null,
            message:
              result.error ||
              "The change could not be confirmed. Please retry it.",
          },
          key,
        );
      if (change.action === "create")
        setNewNames((current) => ({ ...current, [change.kind]: "" }));
      if (change.action === "rename") {
        setRenaming("");
        setRenameDraft("");
      }
      setSuccess(categoryActionDetails[change.action].done);
      await load();
      // The control just pressed is gone: a renamed row left its form, an
      // archived one moved lists. Focus lands on the outcome instead of the body.
      requestAnimationFrame(() =>
        document.getElementById("category-status")?.focus(),
      );
    } catch {
      setError("The change could not be confirmed. Please retry it.");
    } finally {
      setPending("");
    }
  }
  function control(action: "archive" | "restore", category: ManagedCategory) {
    const detail = categoryActionDetails[action];
    const key = changeKey({ action, id: category.id });
    return (
      <Button
        variant="outline"
        size="sm"
        aria-label={`${detail.label} ${category.name}`}
        disabled={busy}
        onClick={() => apply({ action, id: category.id })}
      >
        {pending === key ? detail.pending : detail.label}
      </Button>
    );
  }
  const archived = categoryKinds.flatMap((kind) =>
    (lists?.[kind] ?? []).filter((category) => !category.active),
  );
  return (
    <main aria-busy={busy} className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
          Categories
        </h1>
        <p className="text-muted-foreground">
          Add, rename, and archive the categories your entries choose from.
          Archiving is not deletion: past entries, totals, and breakdowns keep
          the category exactly as recorded.
        </p>
      </div>
      {success && (
        <p role="status" id="category-status" tabIndex={-1}>
          {success}
        </p>
      )}
      {error && (
        <Alert variant="destructive" id="category-error" tabIndex={-1}>
          <AlertTitle>Change needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Categories unavailable</AlertTitle>
          <AlertDescription>
            We could not load your categories.
            <Button variant="outline" disabled={loading} onClick={load}>
              {loading ? "Loading…" : "Retry categories"}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {lists &&
        categoryKinds.map((kind) => {
          const detail = categoryKindDetails[kind];
          const active = lists[kind].filter((category) => category.active);
          return (
            <section key={kind} aria-label={`${detail.label} categories`}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{detail.label}</h2>
                  </CardTitle>
                  <CardDescription>{detail.note}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  {active.length ? (
                    <ul className="divide-y">
                      {active.map((category) => (
                        <li
                          key={category.id}
                          className="flex flex-col gap-3 py-3 first:pt-0"
                        >
                          {renaming === category.id ? (
                            <form
                              className="flex flex-wrap items-end gap-3"
                              onSubmit={(event) => {
                                event.preventDefault();
                                apply({
                                  action: "rename",
                                  id: category.id,
                                  name: renameDraft,
                                });
                              }}
                            >
                              <Field className="w-full max-w-xs">
                                <FieldLabel htmlFor={`rename-${category.id}`}>
                                  New name for {category.name}
                                </FieldLabel>
                                <Input
                                  id={`rename-${category.id}`}
                                  autoFocus
                                  value={renameDraft}
                                  maxLength={categoryNameLimit}
                                  {...nameProps(`rename:${category.id}`)}
                                  onChange={(event) =>
                                    setRenameDraft(event.target.value)
                                  }
                                />
                              </Field>
                              <div className="flex flex-wrap gap-2">
                                <Button type="submit" size="sm" disabled={busy}>
                                  {pending === `rename:${category.id}`
                                    ? categoryActionDetails.rename.pending
                                    : categoryActionDetails.rename.label}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    setRenaming("");
                                    setRenameDraft("");
                                    setError("");
                                    setInvalidField(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="min-w-0 break-words font-medium">
                                {category.name}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Rename ${category.name}`}
                                  disabled={busy}
                                  onClick={() => {
                                    setRenaming(category.id);
                                    setRenameDraft(category.name);
                                    setError("");
                                    setInvalidField(null);
                                    setSuccess("");
                                  }}
                                >
                                  Rename
                                </Button>
                                {control("archive", category)}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>
                          No active {detail.label.toLowerCase()} categories
                        </EmptyTitle>
                        <EmptyDescription>
                          Add one below, or restore an archived category.
                          Entries can always stay uncategorized.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                  <form
                    className="flex flex-wrap items-end gap-3 border-t pt-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      apply({ action: "create", kind, name: newNames[kind] });
                    }}
                  >
                    <Field className="w-full max-w-xs">
                      <FieldLabel htmlFor={`new-${kind}`}>
                        New {detail.label.toLowerCase()} category
                      </FieldLabel>
                      <Input
                        id={`new-${kind}`}
                        value={newNames[kind]}
                        maxLength={categoryNameLimit}
                        placeholder={`Up to ${categoryNameLimit} characters`}
                        {...nameProps(`create:${kind}`)}
                        onChange={(event) =>
                          setNewNames((current) => ({
                            ...current,
                            [kind]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      {pending === `create:${kind}`
                        ? categoryActionDetails.create.pending
                        : `Add ${detail.label.toLowerCase()} category`}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </section>
          );
        })}
      {lists && (
        <section aria-label="Archived categories">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Archived</h2>
              </CardTitle>
              <CardDescription>
                Unavailable for new entries, still shown on every entry and
                total that already uses them. Restore one to choose it again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {archived.length ? (
                <ul className="divide-y">
                  {archived.map((category) => (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words font-medium">
                          {category.name}
                        </span>
                        <Badge variant="secondary">
                          {
                            categoryKindDetails[category.kind as CategoryKind]
                              .label
                          }
                        </Badge>
                      </span>
                      {control("restore", category)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No archived categories.</p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
