import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION = 3500;

// Lightweight in-tab toast — single active message, auto-dismisses after 3.5s.
export default function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((msg, type = "info", duration = DEFAULT_DURATION) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), duration);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, showToast };
}
