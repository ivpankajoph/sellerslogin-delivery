"use client";

import { configureStore } from "@reduxjs/toolkit";
import { useDispatch } from "react-redux";
import authReducer, { logout } from "@/store/slices/authSlice";
import vendorProfileReducer from "@/store/slices/vendor/profileSlice";
import { writeSession } from "@/lib/session";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    vendorprofile: vendorProfileReducer,
  },
});

let sessionHydrated = false;

export const markSessionHydrated = () => {
  sessionHydrated = true;
};

store.subscribe(() => {
  if (!sessionHydrated) return;
  const { token, user, isAuthenticated } = store.getState().auth;
  if (!isAuthenticated) {
    writeSession(null);
    return;
  }
  if (token) writeSession({ token, user });
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export { logout };
