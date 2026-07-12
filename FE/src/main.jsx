import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./assets/styles.css";
import keycloak from "./services/keycloak.js";
import { setAuthToken, clearAuthToken } from "./services/apiClient.ts";

import { authApi } from "./services/authApi.ts";

keycloak
  .init({
    onLoad: "check-sso",
    pkceMethod: "S256",
    checkLoginIframe: false,
  })
  .then((authenticated) => {
    if (authenticated) {
      setAuthToken(keycloak.token);
      
      // Eagerly sync user to backend DB on login to ensure vouchers are issued
      authApi.getProfile().catch(console.warn);

      // Retrieve and consume the 'just_logged_in' flag
      const isJustLoggedIn = sessionStorage.getItem("just_logged_in") === "true";
      if (isJustLoggedIn) {
        sessionStorage.removeItem("just_logged_in");
      }

      // 1. Admin Role Redirection
      // Admin is NEVER allowed to view the storefront. If they are on a storefront path,
      // redirect them immediately to the admin portal.
      if (keycloak.hasRealmRole("ROLE_ADMIN")) {
        if (!window.location.pathname.startsWith("/admin")) {
          window.location.replace(window.location.origin + "/admin");
          return;
        }
      }

      // 2. Redirect authenticated users away from login/register pages
      if (window.location.pathname === "/login" || window.location.pathname === "/register") {
        window.location.replace(window.location.origin + "/");
        return;
      }

      // Automatically refresh token every 60s if it's about to expire
      setInterval(() => {
        keycloak
          .updateToken(70)
          .then((refreshed) => {
            if (refreshed) {
              setAuthToken(keycloak.token);
            }
          })
          .catch((err) => {
            console.error("Failed to refresh token", err);
            clearAuthToken();
          });
      }, 60000);
    } else {
      clearAuthToken();
      if (sessionStorage.getItem("just_logged_in")) {
        sessionStorage.removeItem("just_logged_in");
      }
    }

    createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error("Keycloak initialization failed", err);
    // Render anyway so fallback or static views can show
    createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  });
