export const SCHEDULE_FREQUENCIES = [
  { value: "daily", label: "Hàng ngày" },
  { value: "weekly", label: "Hàng tuần (Thứ 2)" },
  { value: "monthly", label: "Hàng tháng (ngày 1)" }
];

export const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, "0")}:00`
}));

export function buildCronExpression(frequency, hour) {
  const h = Number(hour);
  if (!Number.isFinite(h) || h < 0 || h > 23) return "0 0 12 * * ?";
  if (frequency === "weekly") return `0 0 ${h} ? * MON`;
  if (frequency === "monthly") return `0 0 ${h} 1 * ?`;
  return `0 0 ${h} * * ?`;
}

export function parseCronExpression(cron) {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length < 6) return { frequency: "daily", hour: 12 };
  const hour = Number(parts[2]);
  if (parts[5] === "MON") return { frequency: "weekly", hour: Number.isFinite(hour) ? hour : 12 };
  if (parts[3] === "1" && parts[4] === "*") return { frequency: "monthly", hour: Number.isFinite(hour) ? hour : 12 };
  return { frequency: "daily", hour: Number.isFinite(hour) ? hour : 12 };
}
