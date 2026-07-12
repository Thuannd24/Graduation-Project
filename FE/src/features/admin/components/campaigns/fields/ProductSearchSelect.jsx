import React, { useEffect, useState } from "react";

const WRAP_STYLE = { position: "relative" };
const LIST_STYLE = {
  position: "absolute",
  zIndex: 20,
  top: "100%",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  maxHeight: 160,
  overflowY: "auto",
  boxShadow: "0 4px 12px rgba(0,0,0,.08)"
};
const ITEM_STYLE = { padding: "6px 8px", fontSize: 11, cursor: "pointer" };

export default function ProductSearchSelect({ value, onChange, searchProducts, placeholder }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await searchProducts(q);
        setResults(items);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchProducts]);

  return (
    <div style={WRAP_STYLE}>
      <input
        type="text"
        value={open ? query : (value || "")}
        placeholder={placeholder || "Tìm sản phẩm (≥2 ký tự)…"}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => {
          setQuery(value || "");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <small style={{ fontSize: 9, color: "#94a3b8" }}>Đang tìm…</small>}
      {open && results.length > 0 && (
        <div style={LIST_STYLE}>
          {results.map(p => (
            <div
              key={p.id}
              style={ITEM_STYLE}
              onMouseDown={() => {
                onChange(String(p.id));
                setQuery(p.name || String(p.id));
                setOpen(false);
              }}
            >
              <strong>{p.name}</strong>
              <small style={{ display: "block", color: "#64748b" }}>ID: {p.id}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
