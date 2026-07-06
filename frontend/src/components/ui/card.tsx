import * as React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "bordered";
}

export function Card({
  className,
  variant = "default",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl transition-shadow duration-200",
        variant === "default" &&
          "border border-gray-200 bg-white shadow-sm",
        variant === "subtle" &&
          "border border-gray-100 bg-gray-50/50",
        variant === "bordered" &&
          "border-2 border-gray-200 bg-white",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-6 pt-6 pb-4 border-b border-gray-100", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3",
        className,
      )}
      {...props}
    />
  );
}
