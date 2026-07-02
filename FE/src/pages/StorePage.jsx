import { useEffect, useState } from "react";
import Icon from "../components/common/Icon.jsx";
import { shopApi } from "../services/shopApi";

export default function StorePage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    shopApi
      .listStores()
      .then(setStores)
      .catch((err) => setError(err instanceof Error ? err.message : "Không thể tải danh sách cửa hàng."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-container-max w-full mx-auto py-md px-md lg:px-lg min-h-screen text-on-background font-body-lg">
      <div className="mb-md">
        <h1 className="text-headline-md font-bold mb-xs">Hệ thống cửa hàng</h1>
        <p className="font-body-sm text-secondary">Dữ liệu cửa hàng được lấy từ backend.</p>
      </div>
      {loading && <p className="admin-note">Đang tải cửa hàng...</p>}
      {error && <p className="admin-error">{error}</p>}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          {stores.map((store, index) => (
            <article className="admin-panel" key={store.id || index}>
              <h2><Icon name="store" /> {store.name}</h2>
              <p>{store.address}</p>
              <p>{store.hours}</p>
              <p>{store.phone}</p>
            </article>
          ))}
          {stores.length === 0 && <p className="admin-note">Chưa có cửa hàng.</p>}
        </div>
      )}
    </div>
  );
}
