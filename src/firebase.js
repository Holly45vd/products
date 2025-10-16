// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAi3z9XoTJdR4CkApjmTxRkt-yRcb28iKg",
  authDomain: "product-6b793.firebaseapp.com",
  projectId: "product-6b793",
  storageBucket: "product-6b793.firebasestorage.app",
  messagingSenderId: "20469518495",
  appId: "1:20469518495:web:5a5cce3ad07d61f4bcd2aa",
  measurementId: "G-81BF2CC2YP",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// 앱 시작 시 익명 로그인(이미 로그인되어 있으면 noop)
onAuthStateChanged(auth, (u) => {
  if (!u) {
    signInAnonymously(auth).catch((e) => {
      console.error("Anonymous sign-in failed:", e);
    });
  }
});
