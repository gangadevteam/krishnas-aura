// Product + cart data layer.
// LIVE MODE: Firestore `products` collection with real-time updates, and
// per-user carts at /carts/{uid}.
// DEMO MODE: local seed catalog + in-memory cart.

import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { SEED_PRODUCTS } from "./catalog";

export function watchProducts(callback) {
  if (!firebaseReady) {
    callback(SEED_PRODUCTS);
    return () => {};
  }
  return onSnapshot(collection(db, "products"), (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // If the collection is empty, fall back to seed data so the store
    // never looks broken; seller can click "Seed catalog" to persist it.
    callback(items.length ? items : SEED_PRODUCTS);
  });
}

export async function addProduct(product) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  await addDoc(collection(db, "products"), product);
}

// Uploads a product photo to ImgBB and returns its public URL.
export async function uploadProductImage(file) {
  const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
  if (!apiKey) throw new Error("ImgBB API key not configured (VITE_IMGBB_API_KEY)");

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error?.message || "Image upload failed");
  }
  return data.data.url;
}

export async function updateProduct(id, patch) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  await updateDoc(doc(db, "products", id), patch);
}

export async function removeProduct(id) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  await deleteDoc(doc(db, "products", id));
}

// One-time cleanup: removes duplicate products left over from a previous
// catalog seed, matched by identical name + category + unit (case/whitespace
// insensitive on name). Keeps the first copy of each, deletes the rest.
export async function removeDuplicateProducts() {
  if (!firebaseReady) throw new Error("Firebase not configured");
  const snap = await getDocs(collection(db, "products"));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const seen = new Set();
  const duplicateIds = [];
  for (const p of items) {
    const key = [String(p.name || "").trim().toLowerCase(), p.category, p.unit].join("|");
    if (seen.has(key)) duplicateIds.push(p.id);
    else seen.add(key);
  }
  const batchSize = 400;
  for (let i = 0; i < duplicateIds.length; i += batchSize) {
    const batch = writeBatch(db);
    duplicateIds.slice(i, i + batchSize).forEach((id) => batch.delete(doc(db, "products", id)));
    await batch.commit();
  }
  return duplicateIds.length;
}

// Re-prices every product to a common discount percentage (seller dashboard
// "20% off all products" control). In demo mode this mutates the in-memory
// seed catalog directly and returns the refreshed list, since there's no
// Firestore snapshot listener to pick the change up automatically.
export async function applyGlobalDiscount(products, percent) {
  const pct = Number(percent);
  if (!firebaseReady) {
    SEED_PRODUCTS.forEach((p) => {
      p.discount = Math.round(p.price * (pct / 100));
      p.finalPrice = p.price - p.discount;
    });
    return SEED_PRODUCTS.slice();
  }
  const batchSize = 400;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = writeBatch(db);
    products.slice(i, i + batchSize).forEach((p) => {
      const discount = Math.round(p.price * (pct / 100));
      batch.update(doc(db, "products", p.id), { discount, finalPrice: p.price - discount });
    });
    await batch.commit();
  }
  return null;
}

// ---- Cart -----------------------------------------------------------------

export async function loadCart(uid) {
  if (!firebaseReady || !uid) return {};
  const snap = await getDoc(doc(db, "carts", uid));
  return snap.exists() ? snap.data().items || {} : {};
}

export async function saveCart(uid, items) {
  if (!firebaseReady || !uid) return;
  await setDoc(doc(db, "carts", uid), { items, updatedAt: Date.now() });
}
