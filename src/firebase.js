// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged ,GoogleAuthProvider  } from "firebase/auth";

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
export const googleProvider = new GoogleAuthProvider();

console.log("app.options", app.options); // projectId, apiKey, authDomain 확인
console.log("auth.config", getAuth().config); // 사용 중인 API host 확인 