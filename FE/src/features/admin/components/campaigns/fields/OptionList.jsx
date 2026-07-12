import React from "react";

export function OptionChecklist({ options, value = [], onChange, emptyText }) {
  const selected = Array.isArray(value) ? value : [];

  const toggle = key => {
    const next = selected.includes(key)
      ? selected.filter(v => v !== key)
      : [...selected, key];
    onChange(next);
  };

  if (!options.length) {
    return <small style={{ color: "#94a3b8" }}>{emptyText || "Đang tải…"}</small>;
  }

  return (
    <div className="cb-option-list">
      {options.map(opt => (
        <label key={opt.value} className="cb-option-row">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export function MultiSelect({ options, value = [], onChange, emptyText, size = 8 }) {
  const selected = Array.isArray(value) ? value.map(String) : [];

  if (!options.length) {
    return <small style={{ color: "#94a3b8" }}>{emptyText || "Đang tải…"}</small>;
  }

  return (
    <select
      multiple
      className="cb-multi-select"
      size={Math.min(size, Math.max(4, options.length))}
      value={selected}
      onChange={e => {
        const next = Array.from(e.target.selectedOptions, o => o.value);
        onChange(next);
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
