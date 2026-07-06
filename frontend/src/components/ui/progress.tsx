import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  variant?: "default" | "success" | "error";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function Progress({
  className,
  value,
  variant = "default",
  size = "md",
  showLabel = false,
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("w-full", className)} {...props}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-gray-500">Uploading...</span>
          <span className="text-xs font-medium text-gray-700">{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-gray-100",
          size === "sm" && "h-1.5",
          size === "md" && "h-2.5",
          size === "lg" && "h-3",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variant === "default" && "bg-brand-500",
            variant === "success" && "bg-emerald-500",
            variant === "error" && "bg-red-500",
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
