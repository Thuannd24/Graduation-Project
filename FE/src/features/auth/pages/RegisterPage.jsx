import { useEffect } from "react";
import keycloak from "../../../services/keycloak.js";

export default function RegisterPage() {
  useEffect(() => {
    if (keycloak.authenticated) {
      window.location.replace("/");
    } else {
      keycloak.register({
        redirectUri: window.location.origin + "/"
      });
    }
  }, []);

  return (
    <div className="auth-wrapper flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-sm">
        <p className="text-secondary font-medium">Đang chuyển hướng đến trang đăng ký AuraTech...</p>
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    </div>
  );
}
