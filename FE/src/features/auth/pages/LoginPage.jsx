import { useEffect, useState, useRef } from "react";
import keycloak from "../../../services/keycloak.js";

export default function LoginPage() {
  const [error, setError] = useState(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (keycloak.authenticated) {
      window.location.replace("/");
      return;
    }

    // Check if we are returning from Keycloak (URL contains state, code, or error)
    const hasAuthParams = 
      window.location.hash.includes("state=") || 
      window.location.search.includes("code=") ||
      window.location.search.includes("error=");

    if (hasAuthParams) {
      console.warn("Authentication callback detected, but user is not authenticated. Stopping redirect loop.");
      setError("Xác thực thất bại hoặc phiên kết nối đến máy chủ Keycloak bị lỗi. Vui lòng kiểm tra lại dịch vụ Keycloak (Cổng 8083) đã được khởi động chưa.");
      return;
    }

    // Trigger Keycloak login redirect
    keycloak.login({
      redirectUri: window.location.origin + "/"
    }).catch(err => {
      console.error("Keycloak login failed", err);
      setError("Không thể kết nối đến máy chủ đăng nhập (Keycloak).");
    });
  }, []);

  const handleRetry = () => {
    // Clear hash and retry login
    window.location.replace(window.location.origin + "/login");
  };

  return (
    <div className="auth-wrapper flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-md max-w-md p-lg bg-slate-900/50 rounded-xl border border-slate-800">
        {error ? (
          <>
            <p className="text-red-400 font-semibold">{error}</p>
            <p className="text-xs text-slate-400">Hãy đảm bảo Docker/Keycloak đã khởi động thành công và cấu hình chuẩn.</p>
            <button
              onClick={handleRetry}
              className="mt-md px-md py-xs bg-teal-500 hover:bg-teal-400 text-white rounded font-bold transition-colors"
            >
              Thử lại
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          </>
        )}
      </div>
    </div>
  );
}
