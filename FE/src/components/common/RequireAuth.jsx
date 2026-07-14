import { useEffect, useRef } from "react";
import keycloak from "../../services/keycloak.js";

/**
 * RequireAuth - Bảo vệ route cho người dùng chưa đăng nhập.
 * Nếu chưa xác thực → redirect sang Keycloak login, sau khi login xong quay về đúng trang hiện tại.
 * Không hardcode bất kỳ URL nào.
 */
export default function RequireAuth({ children }) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!keycloak.authenticated && !triggered.current) {
      triggered.current = true;
      keycloak.login({
        redirectUri: window.location.href, // quay lại đúng trang đang cố vào
      });
    }
  }, []);

  // Nếu đã đăng nhập → render trang bình thường
  if (keycloak.authenticated) {
    return children;
  }

  // Đang chờ Keycloak redirect → hiển thị loading nhẹ
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
