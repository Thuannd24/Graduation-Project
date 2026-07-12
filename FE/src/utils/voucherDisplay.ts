export const VOUCHER_TYPE_META: Record<string, {
  label: string;
  icon: string;
  color: string;
  gradient?: string;
  badge?: string;
  accent?: string;
  bg?: string;
}> = {
  PERCENT: {
    label: "Giảm %",
    icon: "percent",
    color: "violet",
    gradient: "from-violet-500 to-purple-600",
    badge: "Giảm %",
    accent: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30"
  },
  FIXED: {
    label: "Giảm tiền",
    icon: "sell",
    color: "cyan",
    gradient: "from-primary to-red-600",
    badge: "Giảm tiền",
    accent: "text-primary",
    bg: "bg-red-50 dark:bg-red-950/30"
  },
  FREESHIP: {
    label: "Freeship",
    icon: "local_shipping",
    color: "orange",
    gradient: "from-emerald-500 to-teal-600",
    badge: "Freeship",
    accent: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30"
  }
};

export function formatVoucherExpiry(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

export function voucherTypeLabel(type?: string): string {
  return VOUCHER_TYPE_META[type || ""]?.label || type || "Voucher";
}

export function getVoucherTypeMeta(type?: string) {
  return VOUCHER_TYPE_META[type || ""] || VOUCHER_TYPE_META.FIXED;
}
