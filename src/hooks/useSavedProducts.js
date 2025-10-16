import { useCallback, useEffect, useState } from "react";

const LS_KEY = "savedProducts"; // productId 배열 저장

export default function useSavedProducts() {
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(savedIds));
    } catch {}
  }, [savedIds]);

  const isSaved = useCallback(
    (id) => savedIds.includes(id),
    [savedIds]
  );

  const toggleSave = useCallback((id) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const clearAll = useCallback(() => setSavedIds([]), []);

  return { savedIds, isSaved, toggleSave, clearAll };
}
