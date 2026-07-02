import { useEffect, useRef } from "react";
import keycloak from "../../services/keycloak.js";

/**
 * RequireAdmin - Route guard for Admin/Staff portal.
 * Ensures the user is logged in and has ROLE_ADMIN or ROLE_STAFF role.
 */
export default function RequireAdmin({ children }) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!keycloak.authenticated && !triggered.current) {
      triggered.current = true;
      keycloak.login({
        redirectUri: window.location.href,
      });
    }
  }, []);

  if (!keycloak.authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 text-sm font-medium">Đang chuyển đến trang đăng nhập quản trị...</p>
        </div>
      </div>
    );
  }

  const isAdmin = keycloak.hasRealmRole("ROLE_ADMIN") || keycloak.hasRealmRole("ROLE_STAFF");
  
  if (!isAdmin) {
    // Redirect non-admin users to the customer home page
    window.location.replace("/");
    return null;
  }

  return children;
}
