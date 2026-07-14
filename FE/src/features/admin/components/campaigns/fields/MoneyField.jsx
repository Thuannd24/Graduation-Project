import React, { useMemo } from "react";
import { formatVnd, validateMoney } from "../utils/format.js";

const ERROR_STYLE = { color: "#dc2626", fontSize: 10, marginTop: 2 };
const HINT_STYLE = { color: "#64748b", fontSize: 10, marginTop: 2 };

export default function MoneyField({
  label,
  value,
  onChange,
  min = 0,
  step = 1000,
  hint,
  required = true
}) {
  const error = useMemo(
    () => validateMoney(value, { min, step, required }),
    [value, min, step, required]
  );

  return (
    <div className="cb-fg">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ""}
        onChange={e => onChange(Number(e.target.value))}
      />
      {error
        ? <small style={ERROR_STYLE}>{error}</small>
        : <small style={HINT_STYLE}>{hint || `≈ ${formatVnd(value)}`}</small>}
    </div>
  );
}
