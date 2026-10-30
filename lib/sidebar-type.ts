"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";

export type WebsiteSidebarType = "b2b" | "b2c" | "food";

const STORAGE_KEY = "sellerslogin_selected_sidebar_type";

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalizeWebsiteSidebarType = (value?: string, templateKey?: string): WebsiteSidebarType => {
  const text = `${normalizeText(value)} ${normalizeText(templateKey)}`;
  if (text.includes("food") || text.includes("restaurant") || text.includes("cafe") || text.includes("kitchen") || text.includes("pocofood")) {
    return "food";
  }
  if (text.includes("b2b") || text.includes("bulk") || text.includes("mquiq") || text.includes("poupqz")) return "b2b";
  return "b2c";
};

export const useSelectedSidebarType = (fallbackType: WebsiteSidebarType, enabled = true) => {
  const [selectedType, setSelectedType] = useState<WebsiteSidebarType>(fallbackType);

  useEffect(() => {
    if (!enabled) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "b2b" || stored === "b2c" || stored === "food") setSelectedType(stored);
    let cancelled = false;
    api
      .get("/sidebar-visibility/type")
      .then((response) => {
        const type = response.data?.data?.type || response.data?.type || response.data?.sidebar_type;
        if (!cancelled && (type === "b2b" || type === "b2c" || type === "food")) {
          setSelectedType(type);
          window.localStorage.setItem(STORAGE_KEY, type);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, fallbackType]);

  return selectedType;
};
