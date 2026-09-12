// Every signed-in page opens the same way: a title, what it covers, and the
// page's own actions, which sit beside the title on wide screens and below it,
// full width, on a phone.
export function PageHeader({
  title,
  children,
  actions,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <h1 className="font-serif text-3xl tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        {children && (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {children}
          </div>
        )}
      </div>
      {/* Bounded, so a status message beside the actions wraps instead of
          squeezing the title out of the row. */}
      {actions && (
        <div className="flex flex-col gap-3 sm:max-w-md sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
