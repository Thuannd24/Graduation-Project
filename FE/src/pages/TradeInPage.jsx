import { useState } from "react";
import Icon from "../components/common/Icon.jsx";
import { shopApi } from "../services/shopApi";

export default function TradeInPage() {
  const [form, setForm] = useState({ brand: "", model: "", condition: "grade_a", customerPhone: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await shopApi.submitTradeIn(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi yêu cầu thu cũ đổi mới.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-container-max w-full mx-auto py-md px-md lg:px-lg min-h-screen text-on-background font-body-lg">
      <div className="max-w-4xl mx-auto space-y-md">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-on-primary p-lg rounded-lg shadow-md text-center space-y-xs">
          <h1 className="text-headline-lg font-headline-lg flex items-center justify-center gap-2">
            <Icon className="text-[32px] text-badge-yellow" name="workspace_premium" /> Thu cũ đổi mới
          </h1>
        </div>
        <form className="admin-panel admin-form" onSubmit={submit}>
          <div className="admin-form-grid">
            <label className="field"><span>Thương hiệu</span><input value={form.brand} onChange={(e) => updateField("brand", e.target.value)} required /></label>
            <label className="field"><span>Dòng máy</span><input value={form.model} onChange={(e) => updateField("model", e.target.value)} required /></label>
            <label className="field"><span>Tình trạng</span><select value={form.condition} onChange={(e) => updateField("condition", e.target.value)}><option value="grade_a">Loại A</option><option value="grade_b">Loại B</option><option value="grade_c">Loại C</option></select></label>
            <label className="field"><span>Số điện thoại</span><input value={form.customerPhone} onChange={(e) => updateField("customerPhone", e.target.value)} required /></label>
          </div>
          {error && <p className="admin-error">{error}</p>}
          <button className="primary-cta" disabled={loading} type="submit">{loading ? "Đang gửi..." : "Gửi yêu cầu"}</button>
        </form>
        {result && <pre className="json-preview">{JSON.stringify(result, null, 2)}</pre>}
      </div>
    </div>
  );
}
