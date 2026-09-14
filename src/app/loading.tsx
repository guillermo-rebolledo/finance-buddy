import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-24"
      role="status"
      aria-label="Opening workspace"
    >
      <div className="h-12 w-2/3">
        <Skeleton />
      </div>
      <div className="h-64 w-full">
        <Skeleton />
      </div>
    </main>
  );
}
