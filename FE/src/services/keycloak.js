import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8083",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "ecommerce-realm",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "ecommerce-frontend",
});

// Wrap login and register to track when the user initiates authentication.
// This allows us to handle role-based redirection immediately upon returning from SSO.
const originalLogin = keycloak.login.bind(keycloak);
keycloak.login = (options) => {
  sessionStorage.setItem("just_logged_in", "true");
  return originalLogin(options);
};

const originalRegister = keycloak.register.bind(keycloak);
keycloak.register = (options) => {
  sessionStorage.setItem("just_logged_in", "true");
  return originalRegister(options);
};

export default keycloak;
