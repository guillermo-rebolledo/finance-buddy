import * as React from "react";
import { cn } from "@/lib/utils";

function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        "flex [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none [&>input]:-mx-px [&>input]:min-w-0 [&>input]:flex-1 [&>input]:tabular-nums [&>input]:focus-visible:z-10",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup };
