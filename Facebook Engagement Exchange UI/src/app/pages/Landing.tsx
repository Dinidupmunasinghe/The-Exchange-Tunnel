import { useEffect } from "react";
import { Navigate } from "react-router";
import { LandingApp } from "../landing/LandingApp";
import { getToken } from "../services/api";
import { APP_HOME_PATH } from "../landing/constants";

/** Landing is light-only; app shell uses .dark on <html>. */
function useLandingLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    document.body.classList.add("landing-active");
    return () => {
      document.body.classList.remove("landing-active");
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = wasDark ? "dark" : "light";
    };
  }, []);
}

export function Landing() {
  useLandingLightTheme();

  if (getToken()) {
    return <Navigate to={APP_HOME_PATH} replace />;
  }
  return <LandingApp />;
}
