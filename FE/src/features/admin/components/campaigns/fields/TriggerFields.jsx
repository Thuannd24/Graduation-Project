import React, { useMemo } from "react";
import MoneyField from "./MoneyField.jsx";
import {
  SCHEDULE_FREQUENCIES,
  SCHEDULE_HOURS,
  buildCronExpression,
  parseCronExpression
} from "../constants/schedule.js";

const ERROR_STYLE = { color: "#dc2626", fontSize: 10, marginTop: 4 };

function TimerScheduleFields({ node, updateProp, updateProps }) {
  const parsed = parseCronExpression(node.properties.cronExpression);
  const frequency = node.properties.scheduleFrequency || parsed.frequency;
  const hour = node.properties.scheduleHour ?? parsed.hour;
  const cronPreview = buildCronExpression(frequency, hour);

  const startDate = (node.properties.startDate || "").slice(0, 10);
  const endDate = (node.properties.endDate || "").slice(0, 10);
  const dateError = useMemo(() => {
    if (!startDate || !endDate) return "";
    if (endDate < startDate) return "Ngày kết thúc phải sau ngày bắt đầu";
    return "";
  }, [startDate, endDate]);

  const syncSchedule = (freq, h) => {
    const patch = {
      scheduleFrequency: freq,
      scheduleHour: h,
      cronExpression: buildCronExpression(freq, h)
    };
    if (updateProps) updateProps(patch);
    else Object.entries(patch).forEach(([k, v]) => updateProp(k, v));
  };

  return (
    <>
      <div className="cb-fg">
        <label>Tần suất chạy</label>
        <select value={frequency} onChange={e => syncSchedule(e.target.value, hour)}>
          {SCHEDULE_FREQUENCIES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="cb-fg">
        <label>Khung giờ chạy</label>
        <select value={hour} onChange={e => syncSchedule(frequency, Number(e.target.value))}>
          {SCHEDULE_HOURS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <small>Cron: <code>{cronPreview}</code></small>
      </div>
      <div className="cb-fg">
        <label>Ngày bắt đầu chiến dịch (tuỳ chọn)</label>
        <input
          type="date"
          className={dateError ? "cb-input-error" : ""}
          value={startDate}
          onChange={e => updateProp("startDate", e.target.value ? `${e.target.value}T00:00:00` : "")}
        />
      </div>
      <div className="cb-fg">
        <label>Ngày kết thúc chiến dịch (tuỳ chọn)</label>
        <input
          type="date"
          className={dateError ? "cb-input-error" : ""}
          min={startDate || undefined}
          value={endDate}
          onChange={e => updateProp("endDate", e.target.value ? `${e.target.value}T23:59:59` : "")}
        />
        {dateError && <small style={ERROR_STYLE}>{dateError}</small>}
      </div>
    </>
  );
}

export default function TriggerFields({ node, updateProp, updateProps }) {
  switch (node.type) {
    case "Trigger_Event_OrderSuccess":
      return (
        <MoneyField
          label="Giá trị đơn hàng tối thiểu"
          value={node.properties.minOrderValue ?? 100000}
          onChange={v => updateProp("minOrderValue", v)}
          min={1000}
          hint="Chỉ kích hoạt khi đơn ≥ ngưỡng này (VNĐ)"
        />
      );

    case "Trigger_Event_ReviewProduct":
      return (
        <div className="cb-fg">
          <label>Số sao đánh giá tối thiểu</label>
          <select
            value={node.properties.minRating ?? 5}
            onChange={e => updateProp("minRating", Number(e.target.value))}
          >
            {[5, 4, 3, 2, 1].map(n => (
              <option key={n} value={n}>{n} sao trở lên</option>
            ))}
          </select>
        </div>
      );

    case "Trigger_Timer_Schedule":
      return <TimerScheduleFields node={node} updateProp={updateProp} updateProps={updateProps} />;

    default:
      return null;
  }
}
