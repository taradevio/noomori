import { useEffect, useRef, useState } from "react";

export type RequestFailureKind = "connection" | "other" | "timeout";

export function classifyRequestFailure(error: unknown): RequestFailureKind {
  if (!(error instanceof Error)) return "other";
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return "timeout";
  }
  return error instanceof TypeError ? "connection" : "other";
}

export function useDelayedRequest(active: boolean, delayMs = 4_000) {
  const delayedRef = useRef(false);
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!active) {
      if (delayedRef.current) {
        delayedRef.current = false;
        setDelayed(false);
      }
      return;
    }

    const timer = setTimeout(() => {
      delayedRef.current = true;
      setDelayed(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && delayed;
}
