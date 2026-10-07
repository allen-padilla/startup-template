import Link from "next/link";

import { buttonVariants } from "@startup/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 font-sans">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This page does not exist or has moved.
        </p>
        <Link href="/" className={buttonVariants()}>
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
