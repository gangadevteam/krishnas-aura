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
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, firebaseReady } from "./firebase";
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

// Uploads a product photo to Firebase Storage and returns its public URL.
export async function uploadProductImage(file) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `product-images/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function updateProduct(id, patch) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  await updateDoc(doc(db, "products", id), patch);
}

export async function removeProduct(id) {
  if (!firebaseReady) throw new Error("Firebase not configured");
  await deleteDoc(doc(db, "products", id));
}

// One-time seeding of the full catalog into Firestore (seller only).
export async function seedCatalog() {
  if (!firebaseReady) throw new Error("Firebase not configured");
  const batchSize = 400; // Firestore batch limit is 500 ops
  for (let i = 0; i < SEED_PRODUCTS.length; i += batchSize) {
    const batch = writeBatch(db);
    SEED_PRODUCTS.slice(i, i + batchSize).forEach((p) => {
      const { id, ...data } = p;
      batch.set(doc(collection(db, "products")), data);
    });
    await batch.commit();
  }
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
