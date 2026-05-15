import { Navigate } from "react-router";
import { LandingApp } from "../landing/LandingApp";
import { getToken } from "../services/api";
import { APP_HOME_PATH } from "../landing/constants";

export function Landing() {
  if (getToken()) {
    return <Navigate to={APP_HOME_PATH} replace />;
  }
  return <LandingApp />;
}
