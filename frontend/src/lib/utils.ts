import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getDaysUntilExpiry(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(
  date: Date | string | null | undefined
): "expired" | "expiring-soon" | "fresh" | null {
  const days = getDaysUntilExpiry(date);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= 3) return "expiring-soon";
  return "fresh";
}
