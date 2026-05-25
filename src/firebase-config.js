import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// REGRESANDO AL PROYECTO DE JULIO (Activo para desarrollo)
const firebaseConfig = {
  apiKey: "AIzaSyC6_3IMkH93iIc4f9Uo6kXq7fTYMFeDzoQ",
  authDomain: "solar-leads-juliovmartinez.firebaseapp.com",
  projectId: "solar-leads-juliovmartinez",
  storageBucket: "solar-leads-juliovmartinez.firebasestorage.app",
  messagingSenderId: "718683807078",
  appId: "1:718683807078:web:aa0a27d831de633e957ca7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);
