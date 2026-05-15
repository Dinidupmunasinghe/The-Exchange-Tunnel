import { useLayoutEffect } from "react";
import { Navigate } from "react-router";
import { MotionConfig } from "motion/react";
import { LandingApp } from "../landing/LandingApp";
import { getToken } from "../services/api";
import { APP_HOME_PATH } from "../landing/constants";
import "../landing/landing.css";

function applyLandingDocumentMode() {
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");

  html.classList.add("landing-route");
  html.classList.remove("dark");
  html.style.colorScheme = "light";
  body.classList.add("landing-active");
  body.style.overflow = "auto";
  body.style.height = "auto";

  if (root) {
    root.style.height = "auto";
    root.style.overflow = "visible";
  }
}

function restoreDocumentMode() {
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");

  html.classList.remove("landing-route");
  body.classList.remove("landing-active");
  body.style.removeProperty("overflow");
  body.style.removeProperty("height");

  if (root) {
    root.style.removeProperty("height");
    root.style.removeProperty("overflow");
  }

  try {
    const stored = localStorage.getItem("exchange_theme");
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
    const theme =
      stored === "light" || stored === "dark"
        ? stored
        : prefersLight
          ? "light"
          : "dark";
    html.classList.toggle("dark", theme === "dark");
    html.style.colorScheme = theme;
  } catch {
    html.classList.add("dark");
    html.style.colorScheme = "dark";
  }
}

export function Landing() {
  useLayoutEffect(() => {
    applyLandingDocumentMode();
    return restoreDocumentMode;
  }, []);

  if (getToken()) {
    return <Navigate to={APP_HOME_PATH} replace />;
  }

  return (
    <MotionConfig reducedMotion="never">
      <div
        id="landing-scroll"
        className="fixed inset-0 z-[200] overflow-x-hidden overflow-y-auto bg-white text-gray-900"
      >
        <LandingApp />
      </div>
    </MotionConfig>
  );
}
