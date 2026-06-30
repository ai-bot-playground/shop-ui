import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "shop-ui.userId";
const HEADER_NAME = "X-User-Id";

function generateUserId() {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `u_${time}_${random}`;
}

export function getUserId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function login() {
  const userId = generateUserId();
  try {
    localStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // localStorage niedostępne (np. tryb prywatny) — działamy tylko w pamięci sesji
  }
  window.dispatchEvent(new CustomEvent("auth:change"));
  return userId;
}

export function logout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("auth:change"));
}

export function getAuthHeaders() {
  const userId = getUserId();
  if (!userId) {
    return {};
  }
  return { [HEADER_NAME]: userId };
}

export const X_USER_ID_HEADER = HEADER_NAME;

export function useAuth() {
  const [userId, setUserId] = useState(getUserId);

  useEffect(() => {
    const handleChange = () => setUserId(getUserId());
    window.addEventListener("auth:change", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener("auth:change", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const doLogin = useCallback(() => {
    const id = login();
    setUserId(id);
    return id;
  }, []);

  const doLogout = useCallback(() => {
    logout();
    setUserId(null);
  }, []);

  return {
    userId,
    isAuthenticated: Boolean(userId),
    login: doLogin,
    logout: doLogout,
  };
}
