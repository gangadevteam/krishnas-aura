// Orders data layer.
// LIVE MODE: Firestore `orders` collection — buyers create their own order,
// the seller account reads/watches all of them (see firestore.rules).
// DEMO MODE: orders are kept in localStorage so the seller dashboard still
// has something to show without Firebase configured.

import { collection, addDoc, updateDoc, doc, getDocs, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db, firebaseReady } from "./firebase";

// Standard courier charges by delivery area. Shown to the buyer during
// checkout before they submit the order.
export const COURIER_AREAS = [
  { id: "local", label: "Sivakasi & nearby (626123)", charge: 0 },
  { id: "tn", label: "Tamil Nadu — other districts", charge: 150 },
  { id: "other", label: "Other states", charge: 300 },
];

// The single source of truth for order progression — used by both the
// seller's status control and the buyer's order-tracking view so they can
// never drift out of sync.
export const ORDER_STATUSES = [
  { key: "placed", label: "Order Placed" },
  { key: "paid", label: "Payment Successful" },
  { key: "confirmed", label: "Order Confirmed" },
  { key: "shipped", label: "Order Shipped" },
  { key: "delivered", label: "Delivered" },
];

// A cancellation sits outside the normal progression (it can happen at any
// point), so it's kept separate from ORDER_STATUSES — which stays a clean
// linear list for rendering the buyer's step tracker — and only folded in
// via ALL_ORDER_STATUSES for places that need every selectable/lookup value
// (the seller's status dropdown, status-label lookups).
export const CANCELLED_STATUS = { key: "cancelled", label: "Cancelled" };
export const ALL_ORDER_STATUSES = [...ORDER_STATUSES, CANCELLED_STATUS];

const DEMO_KEY = "ka_demo_orders";
// Firing a same-tab event alongside the native "storage" event (which only
// reaches *other* tabs) is what lets the buyer's order view update live
// when the seller changes status in demo mode, without a Firestore listener.
const DEMO_EVENT = "ka-demo-orders-updated";

function readDemoOrders() {
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeDemoOrders(orders) {
  window.localStorage.setItem(DEMO_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event(DEMO_EVENT));
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

// Seller-only: advances an order to the given status key (see
// ORDER_STATUSES). Both the seller dashboard and the buyer's "My Orders"
// view read the same order record, so this is immediately visible to both.
export async function updateOrderStatus(id, status) {
  if (!firebaseReady) {
    const orders = readDemoOrders().map((o) =>
      o.id === id ? { ...o, status, updatedAt: Date.now() } : o
    );
    writeDemoOrders(orders);
    return;
  }
  await updateDoc(doc(db, "orders", id), { status, updatedAt: Date.now() });
}

// Pass `uid` to watch only that buyer's orders; omit it for the seller
// dashboard, which reads every order.
//
// The buyer-scoped query filters by uid only (no server-side orderBy) — a
// where() + orderBy() on two different fields needs a composite Firestore
// index, and without one the listener fails silently (no error handler,
// callback never fires) which is exactly what made "My Orders" appear
// empty after a refresh. Sorting by createdAt happens client-side instead,
// so this works with zero manual index setup.
export function watchOrders(callback, uid) {
  if (!firebaseReady) {
    const emit = () => {
      const all = readDemoOrders();
      callback(uid ? all.filter((o) => o.uid === uid) : all);
    };
    emit();
    window.addEventListener("storage", emit);
    window.addEventListener(DEMO_EVENT, emit);
    return () => {
      window.removeEventListener("storage", emit);
      window.removeEventListener(DEMO_EVENT, emit);
    };
  }
  const base = collection(db, "orders");
  const q = uid ? query(base, where("uid", "==", uid)) : query(base, orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (uid) orders.sort((a, b) => b.createdAt - a.createdAt);
      callback(orders);
    },
    (err) => console.error("watchOrders failed:", err)
  );
}

// One-off fetch of a buyer's most recently placed order (used to prefill
// the checkout address with their last-used delivery details). Filters by
// uid only, same reasoning as watchOrders above — avoids needing a
// composite index for a query that only runs once anyway.
export async function getLastOrder(uid) {
  if (!firebaseReady) {
    const orders = readDemoOrders()
      .filter((o) => o.uid === uid)
      .sort((a, b) => b.createdAt - a.createdAt);
    return orders[0] || null;
  }
  const snap = await getDocs(query(collection(db, "orders"), where("uid", "==", uid)));
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  orders.sort((a, b) => b.createdAt - a.createdAt);
  return orders[0] || null;
}
