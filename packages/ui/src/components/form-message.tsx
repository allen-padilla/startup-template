import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const formMessageVariants = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    tone: {
      error: "border-red-600/30 bg-red-50 text-red-800",
      success: "border-green-600/30 bg-green-50 text-green-800",
      info: "border-black/10 bg-black/5",
    },
  },
  defaultVariants: {
    tone: "info",
  },
});

export interface FormMessageProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof formMessageVariants> {}

// A message shown next to a form. Errors are announced at once (`alert`),
// other messages politely (`status`). Renders nothing without content.
export function FormMessage({
  className,
  tone,
  children,
  ...props
}: FormMessageProps) {
  if (children === undefined || children === null || children === false || children === "") {
    return null;
  }

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(formMessageVariants({ tone }), className)}
      {...props}
    >
      {children}
    </div>
  );
}
