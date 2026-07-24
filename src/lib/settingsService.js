// Storefront-wide discount settings — a single "20% off, valid for N months"
// offer the seller controls from the dashboard.

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, firebaseReady } from "./firebase";

const DEMO_KEY = "ka_demo_discount";
const DISCOUNT_PERCENT = 20;

export function watchDiscountSettings(callback) {
  if (!firebaseReady) {
    try {
      const raw = window.localStorage.getItem(DEMO_KEY);
      callback(raw ? JSON.parse(raw) : null);
    } catch {
      callback(null);
    }
    return () => {};
  }
  return onSnapshot(doc(db, "settings", "discount"), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// Sets the offer to the fixed 20% rate, valid for the given number of months
// from now. Returns the saved settings so callers can apply it immediately.
export async function setDiscountValidity(months) {
  const validMonths = Math.max(1, Number(months) || 1);
  const data = {
    percent: DISCOUNT_PERCENT,
    months: validMonths,
    validUntil: Date.now() + validMonths * 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  };
  if (!firebaseReady) {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    return data;
  }
  await setDoc(doc(db, "settings", "discount"), data);
  return data;
}
