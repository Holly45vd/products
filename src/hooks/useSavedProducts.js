// src/hooks/useSavedProducts.js
import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { db, auth } from "../firebase";

export default function useSavedProducts() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setSavedIds(new Set());
      setLoadingUser(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingSaved(true);
    const colRef = collection(db, "users", user.uid, "saved");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const set = new Set();
        snap.forEach((d) => set.add(d.id));
        setSavedIds(set);
        setLoadingSaved(false);
      },
      () => setLoadingSaved(false)
    );
    return () => unsub();
  }, [user]);

  const signUp = useCallback(async (email, password) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signIn = useCallback(async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const toggleSave = useCallback(
    async (productId) => {
      if (!user) throw new Error("로그인 필요");
      const ref = doc(db, "users", user.uid, "saved", productId);
      if (savedIds.has(productId)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { productId, createdAt: serverTimestamp() }, { merge: true });
      }
    },
    [user, savedIds]
  );

  return {
    user,
    loadingUser,
    loadingSaved,
    savedIds,
    toggleSave,
    signUp,
    signIn,
    signOut: signOutUser,
  };
}
