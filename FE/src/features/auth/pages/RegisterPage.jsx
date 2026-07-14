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
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
