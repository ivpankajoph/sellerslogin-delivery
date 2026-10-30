import axios, { type AxiosInstance } from "axios";
import { store } from "@/store";
import { logout } from "@/store/slices/authSlice";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const EXCLUDED_TOP_LEVEL_PATHS = new Set([
  "/auth",
  "/vendors",
  "/maincategories",
  "/categories",
  "/specifications",
  "/specification-keys",
  "/subcategories",
  "/products",
  "/cities",
  "/users",
  "/templates",
  "/cloudinary",
  "/media",
  "/analytics",
  "/websites-analytics",
  "/template-users",
  "/search",
  "/delivery-charges",
  "/seo",
  "/chat",
  "/live-chat",
  "/help-chat",
  "/push-notifications",
  "/webhook",
  "/e-marketing",
  "/integrations",
  "/vendor",
  "/admin",
]);

const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state?.auth?.token;
  const role = String(state?.auth?.user?.role || "").toLowerCase();
  const url = config.url || "";
  const isAbsolute = url.startsWith("http") || url.startsWith("//");
  const path = url.startsWith("/") ? url : `/${url}`;
  const topPath = `/${path.split("/")[1]}`;
  const isExcluded =
    EXCLUDED_TOP_LEVEL_PATHS.has(topPath) ||
    url.includes("/login") ||
    url.includes("/support/queries") ||
    url.endsWith("/users/getall");
  const prefix = role === "vendor" ? "/vendor" : role === "admin" || role === "superadmin" ? "/admin" : "";

  if (url && !isAbsolute && !isExcluded && prefix && !url.startsWith(prefix)) {
    config.url = `${prefix}${url.startsWith("/") ? url : `/${url}`}`;
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = Number(error?.response?.status || 0);
    const requestUrl = String(error?.config?.url || "").toLowerCase();
    const message = String(error?.response?.data?.message || error?.response?.data?.error || error?.message || "")
      .trim()
      .toLowerCase();
    const sessionMessage = ["invalid token", "jwt malformed", "jwt expired", "token expired", "session expired", "login again", "no token provided"].some((entry) => message.includes(entry));
    const profileRequest = requestUrl.endsWith("/profile") || requestUrl.includes("/profile");
    if (status === 401 && sessionMessage && !profileRequest && !requestUrl.includes("/login")) {
      store.dispatch(logout());
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
