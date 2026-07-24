// Authentication service — free-tier only (Spark plan, no Cloud Functions).
//
// Two sign-in paths, both native Firebase Authentication features:
//
//   1. Google Sign-In (signInWithPopup) — one click, no redirect away from
//      the tab, so cart state is never at risk. Works for anyone with a
//      Google account.
//
//   2. Email link (passwordless) — for people without/not using Google.
//      sendSignInLinkToEmail() emails a secure link; clicking it may open
//      a new tab, so the cart is backed up to localStorage as a safety net
//      (see cartBackup below) and restored on the other tab if needed.
//
// New-user profile (full name + phone) is collected once, right before the
// email link is sent (email path) or immediately after first Google
// sign-in (Google path, since Google doesn't provide a phone number).
//
// DEMO MODE (no Firebase env vars): both paths are simulated locally.

import {
  GoogleAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  fetchSignInMethodsForEmail,
  signOut as fbSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady, SELLER_EMAIL } from "./firebase";

export function isSeller(email) {
  return (email || "").trim().toLowerCase() === SELLER_EMAIL;
}

const EMAIL_KEY = "ka_pending_email";
const PROFILE_KEY = "ka_pending_profile";

// ---------------------------------------------------------------------------
// Cart backup — survives a magic link opening in a different tab.
// ---------------------------------------------------------------------------

export function backupCart(cart) {
  try {
    window.localStorage.setItem("ka_cart_backup", JSON.stringify(cart));
  } catch {
    /* ignore storage errors (e.g. private browsing) */
  }
}

export function readCartBackup() {
  try {
    const raw = window.localStorage.getItem("ka_cart_backup");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------------

export async function signInWithGoogle() {
  if (!firebaseReady) {
    const email = window.prompt("Demo mode — enter the Google email to simulate:");
    if (!email) throw new Error("Sign-in cancelled.");
    const clean = email.trim().toLowerCase();
    return finalizeProfile({ uid: "demo-" + clean, email: clean }, {});
  }
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const isNew =
    cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime;
  await finalizeProfile(cred.user, {}, isNew);
  return { uid: cred.user.uid, email: cred.user.email, needsPhone: isNew && !isSeller(cred.user.email) };
}

// ---------------------------------------------------------------------------
// Email link (magic link)
// ---------------------------------------------------------------------------

export async function checkAccountExists(email) {
  const clean = email.trim().toLowerCase();
  if (isSeller(clean)) return true; // Superadmin is always pre-registered
  if (!firebaseReady) return false; // demo mode: always treat as new
  const methods = await fetchSignInMethodsForEmail(auth, clean);
  return methods.length > 0;
}

export async function sendLoginLink(email, profile) {
  const clean = email.trim().toLowerCase();
  if (!firebaseReady) {
    window.localStorage.setItem(EMAIL_KEY, clean);
    if (profile) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return { demo: true };
  }
  const actionCodeSettings = {
    url: window.location.origin + "/",
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, clean, actionCodeSettings);
  window.localStorage.setItem(EMAIL_KEY, clean);
  if (profile) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return { demo: false };
}

export function isFinishSignInLink() {
  return firebaseReady && isSignInWithEmailLink(auth, window.location.href);
}

export async function completeEmailLinkSignIn() {
  let email = window.localStorage.getItem(EMAIL_KEY);

  async function trySignIn(candidateEmail) {
    return signInWithEmailLink(auth, candidateEmail, window.location.href);
  }

  let cred;
  try {
    if (!email) throw new Error("no-stored-email");
    cred = await trySignIn(email);
  } catch {
    const confirmed = window.prompt("Confirm the email this sign-in link was sent to:", email || "");
    if (!confirmed) throw new Error("Sign-in cancelled — no email provided.");
    email = confirmed.trim().toLowerCase();
    cred = await trySignIn(email);
  }

  const profileRaw = window.localStorage.getItem(PROFILE_KEY);
  const profile = profileRaw ? JSON.parse(profileRaw) : {};
  window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.removeItem(PROFILE_KEY);

  await finalizeProfile(cred.user, profile);
  window.history.replaceState({}, "", "/");
  return { uid: cred.user.uid, email: cred.user.email };
}

// ---------------------------------------------------------------------------
// Shared profile write (used by both sign-in paths)
// ---------------------------------------------------------------------------

async function finalizeProfile(user, profile, isNew = true) {
  const role = isSeller(user.email) ? "seller" : "buyer";
  if (!firebaseReady) return { role };

  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  const data = {
    email: user.email,
    role,
    updatedAt: Date.now(),
  };
  if (!existing.exists()) {
    data.fullName = profile.fullName || user.displayName || "";
    data.phone = profile.phone || "";
    data.createdAt = Date.now();
  }
  await setDoc(userRef, data, { merge: true });
  return { role };
}

export async function savePhoneNumber(uid, phone) {
  if (!firebaseReady) return;
  await setDoc(doc(db, "users", uid), { phone }, { merge: true });
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function getUserRole(uid) {
  if (!firebaseReady) {
    const email = uid?.replace("demo-", "");
    return isSeller(email) ? "seller" : "buyer";
  }
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().role : "buyer";
}

// Buyer's saved full name + phone from their profile doc — used to prefill
// the checkout form so they don't retype details already on file.
export async function getUserProfile(uid) {
  if (!firebaseReady) return { fullName: "", phone: "" };
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return { fullName: "", phone: "" };
  const data = snap.data();
  return { fullName: data.fullName || "", phone: data.phone || "" };
}

export function watchAuth(callback) {
  if (!firebaseReady) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function signOut() {
  if (firebaseReady) await fbSignOut(auth);
}
