export const SESSION_KEY = "sld-delivery-session";

export type DeliverySession = {
  token: string;
  user: Record<string, unknown> | null;
};

export function readSession(): DeliverySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeliverySession;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: DeliverySession | null) {
  if (typeof window === "undefined") return;
  if (!session?.token) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function decodeJwt(token: string): Record<string, unknown> {
  let part = (token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
  while (part.length % 4) part += "=";
  return JSON.parse(atob(part)) as Record<string, unknown>;
}
