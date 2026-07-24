// Orders data layer.
// LIVE MODE: Firestore `orders` collection — buyers create their own order,
// the seller account reads/watches all of them (see firestore.rules).
// DEMO MODE: orders are kept in localStorage so the seller dashboard still
// has something to show without Firebase configured.

import { collection, addDoc, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db, firebaseReady } from "./firebase";

// Standard courier charges by delivery area. Shown to the buyer during
// checkout before they submit the order.
export const COURIER_AREAS = [
  { id: "local", label: "Sivakasi & nearby (626123)", charge: 0 },
  { id: "tn", label: "Tamil Nadu — other districts", charge: 150 },
  { id: "other", label: "Other states", charge: 300 },
];

const DEMO_KEY = "ka_demo_orders";

function readDemoOrders() {
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeDemoOrders(orders) {
  window.localStorage.setItem(DEMO_KEY, JSON.stringify(orders));
}

export async function placeOrder(order) {
  const record = { ...order, status: "placed", createdAt: Date.now() };
  if (!firebaseReady) {
    const withId = { id: "demo-order-" + Date.now(), ...record };
    const orders = readDemoOrders();
    orders.unshift(withId);
    writeDemoOrders(orders);
    return withId;
  }
  const ref = await addDoc(collection(db, "orders"), record);
  return { id: ref.id, ...record };
}

// Pass `uid` to watch only that buyer's orders; omit it for the seller
// dashboard, which reads every order.
export function watchOrders(callback, uid) {
  if (!firebaseReady) {
    const all = readDemoOrders();
    callback(uid ? all.filter((o) => o.uid === uid) : all);
    return () => {};
  }
  const base = collection(db, "orders");
  const q = uid
    ? query(base, where("uid", "==", uid), orderBy("createdAt", "desc"))
    : query(base, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
