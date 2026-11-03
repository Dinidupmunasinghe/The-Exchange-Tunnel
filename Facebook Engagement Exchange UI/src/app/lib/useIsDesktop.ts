import { useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)";

/** True at the Tailwind `lg` breakpoint and up. Used to mount desktop-only chrome once. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : true
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
