"use client";

import { useEffect, useState } from "react";
import { now } from "@/lib/order/clock";

/** The current time, refreshed every second (Playwright's page.clock moves it in tests). */
export function useNow(): number {
  const [current, setCurrent] = useState(() => now());
  useEffect(() => {
    const timer = setInterval(() => setCurrent(now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return current;
}
