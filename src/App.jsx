import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Sparkles, ShoppingCart, User, Store, Mail, ArrowRight, X, Plus, Minus,
  LogOut, Package, Search, UploadCloud, CheckCircle2, UserPlus, Phone, Image as ImageIcon,
} from "lucide-react";
import { firebaseReady } from "./lib/firebase";
import {
  signInWithGoogle, checkAccountExists, sendLoginLink, isFinishSignInLink,
  completeEmailLinkSignIn, watchAuth, signOut, getUserRole, isSeller,
  backupCart, readCartBackup, savePhoneNumber,
} from "./lib/authService";
import {
  watchProducts, addProduct, removeProduct, seedCatalog, loadCart, saveCart, uploadProductImage,
} from "./lib/productService";
import { CATEGORIES } from "./lib/catalog";
import "./App.css";

const BRAND = "Krishna's Aura";
const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");

// ---------------------------------------------------------------------------
// Category glyphs (SVG placeholders until real product photos are uploaded)
// ---------------------------------------------------------------------------

const CAT_COLORS = {
  "Single Sound Crackers": ["#7A1F2B", "#E8A33D"],
  "Bijili Crackers": ["#1A1035", "#FF6B35"],
  "Deluxe Crackers": ["#3C2A6E", "#E8A33D"],
  "Bomb Crackers": ["#4A1B0C", "#FF6B35"],
  "Festival Crackers": ["#7A1F2B", "#FF6B35"],
  "Flower Pots": ["#7A1F2B", "#FFB84D"],
  "Mud Pots": ["#4A1B0C", "#E8A33D"],
  "Ground Chakkers": ["#1A1035", "#E8A33D"],
  "Twinkling Star": ["#3C2A6E", "#FFB84D"],
  "Rockets": ["#3C2A6E", "#FF6B35"],
  "Multicolour Shots": ["#1A1035", "#FFB84D"],
  "Fancy Pipes": ["#7A1F2B", "#E8A33D"],
  "Pencil Celebration": ["#3C2A6E", "#E8A33D"],
  "Kids Special": ["#3C2A6E", "#FF6B35"],
  "Color Matches": ["#4A1B0C", "#FFB84D"],
  "Sparklers": ["#7A1F2B", "#E8A33D"],
  "Gift Boxes": ["#4A1B0C", "#E8A33D"],
  "New Arrivals": ["#1A1035", "#FF6B35"],
};

function Glyph({ category, size = 64, imageUrl }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: 10, objectFit: "cover" }}
      />
    );
  }
  const [c1, c2] = CAT_COLORS[category] || ["#1A1035", "#E8A33D"];
  const key = category.replace(/\W/g, "");
  const kind = /Bomb|Rocket|Sound|Pipe/.test(category)
    ? "flame"
    : /Gift/.test(category)
    ? "box"
    : "spark";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={`g${key}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={c2} stopOpacity="0.35" />
          <stop offset="100%" stopColor={c1} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill={c1} />
      <rect width="64" height="64" rx="10" fill={`url(#g${key})`} />
      {kind === "flame" && (
        <path d="M32 14c2 6-4 8-4 14a6 6 0 0012 0c0-4-2-6-2-9 4 3 6 8 6 12a10 10 0 01-20 0c0-9 5-13 8-17z" fill={c2} />
      )}
      {kind === "spark" && (
        <g fill={c2}>
          <path d="M32 16l2.5 8L42 27l-7.5 2.5L32 38l-2.5-8.5L22 27l7.5-3z" />
          <circle cx="46" cy="42" r="2.5" />
          <circle cx="19" cy="41" r="2" />
        </g>
      )}
      {kind === "box" && (
        <g fill="none" stroke={c2} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M18 24l14-7 14 7v16l-14 7-14-7z" />
          <path d="M18 24l14 7 14-7M32 31v16" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [session, setSession] = useState(null); // { uid, email, role }
  const [products, setProducts] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const cartLoaded = useRef(false);

  // Live product feed
  useEffect(() => watchProducts(setProducts), []);

  // Restore a cart backup immediately, in case this tab was opened fresh
  // from a magic-link email (see authService.backupCart).
  useEffect(() => {
    const backup = readCartBackup();
    if (backup && Object.keys(backup).length) setCart(backup);
  }, []);

  // Complete magic-link sign-in if this tab was opened from the emailed link
  useEffect(() => {
    if (isFinishSignInLink()) {
      setFinishing(true);
      completeEmailLinkSignIn()
        .catch((e) => alert("Sign-in failed: " + e.message))
        .finally(() => setFinishing(false));
    }
  }, []);

  // Auth state
  useEffect(
    () =>
      watchAuth(async (user) => {
        if (user) {
          const role = await getUserRole(user.uid);
          setSession({ uid: user.uid, email: user.email, role });
          const saved = await loadCart(user.uid);
          if (Object.keys(saved).length) setCart(saved);
          cartLoaded.current = true;
        } else {
          setSession(null);
          cartLoaded.current = false;
        }
      }),
    []
  );

  // Persist cart (both to Firestore for the signed-in user, and to a local
  // backup so it survives a magic link opening in a different tab).
  useEffect(() => {
    if (session?.uid && session.uid !== "demo" && cartLoaded.current) {
      saveCart(session.uid, cart);
    }
    backupCart(cart);
  }, [cart, session]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (activeCategory === "All" || p.category === activeCategory) &&
          p.name.toLowerCase().includes(search.toLowerCase())
      ),
    [products, activeCategory, search]
  );

  const grouped = useMemo(() => {
    const g = {};
    for (const p of filtered) (g[p.category] ||= []).push(p);
    return g;
  }, [filtered]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find((x) => String(x.id) === String(id));
    return sum + (p ? p.finalPrice * qty : 0);
  }, 0);

  const changeQty = (id, delta) =>
    setCart((c) => {
      const next = { ...c };
      const q = (next[id] || 0) + delta;
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });

  if (finishing)
    return (
      <div className="page center-fill">
        <Sparkles size={28} color="#E8A33D" />
        <p>Finishing sign-in…</p>
      </div>
    );

  if (session?.role === "seller")
    return <SellerDashboard session={session} onLogout={signOutAnd(setSession)} products={products} />;

  return (
    <div className="page">
      {!firebaseReady && (
        <div className="demo-banner">
          Demo mode — Firebase not configured yet. Sign-in is simulated and data resets on refresh. See README to go live.
        </div>
      )}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.svg" alt="" className="logo-mark" />
            <span className="logo-text">{BRAND}</span>
          </div>
          <nav className="nav">
            <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
              <ShoppingCart size={18} />
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
            {session ? (
              <div className="user-chip">
                <User size={15} />
                <span>{session.email}</span>
                <button className="icon-btn" onClick={signOutAnd(setSession)} aria-label="Log out">
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button className="seller-btn" onClick={() => setAuthOpen(true)}>
                <User size={15} /> Login
              </button>
            )}
          </nav>
        </div>
      </header>

      <div className="hero">
        <div className="hero-glow" />
        <div className="hero-inner">
          <p className="hero-eyebrow">Diwali collection · handpicked &amp; tested</p>
          <h1 className="hero-title">
            Light up the night with <span className="gold">{BRAND}</span>
          </h1>
          <p className="hero-sub">
            Single sounds to sky shots, sparklers to gift boxes — from the factory floor to your family's celebration.
          </p>
        </div>
      </div>

      <main className="main">
        <div className="search-box">
          <Search size={16} color="#B8A9D9" />
          <input
            placeholder="Search crackers, sparklers, gift boxes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="category-row">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              className={"pill" + (activeCategory === c ? " active" : "")}
              onClick={() => setActiveCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {Object.keys(grouped).length === 0 && (
          <p className="empty-note">No products match your search.</p>
        )}

        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat} className="cat-section">
            <h2 className="cat-heading">{cat}</h2>
            <div className="grid">
              {items.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  qtyInCart={cart[p.id] || 0}
                  onAdd={() => changeQty(p.id, 1)}
                  onChangeQty={changeQty}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="footer">
        {BRAND} · Handle with care · Sale subject to local fireworks regulations and licensing
      </footer>

      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSignedIn={(result) => {
            setAuthOpen(false);
            if (result?.needsPhone) setNeedsPhone(true);
          }}
        />
      )}
      {needsPhone && session && (
        <PhonePrompt
          onClose={() => setNeedsPhone(false)}
          onSave={async (phone) => {
            await savePhoneNumber(session.uid, phone);
            setNeedsPhone(false);
          }}
        />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          products={products}
          total={cartTotal}
          onClose={() => setCartOpen(false)}
          onChangeQty={changeQty}
          isLoggedIn={!!session}
          onLoginPrompt={() => {
            setCartOpen(false);
            setAuthOpen(true);
          }}
        />
      )}
    </div>
  );
}

const signOutAnd = (setSession) => async () => {
  await signOut();
  setSession(null);
};

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function ProductCard({ product, qtyInCart, onAdd, onChangeQty }) {
  return (
    <div className="card">
      <div className="card-img">
        <Glyph category={product.category} imageUrl={product.imageUrl} size={72} />
      </div>
      <div className="card-body">
        <p className="card-unit">{product.unit}</p>
        <h3 className="card-name">{product.name}</h3>
        <div className="price-row">
          <span className="price-final">{fmt(product.finalPrice)}</span>
          <span className="price-orig">{fmt(product.price)}</span>
        </div>
        {qtyInCart > 0 ? (
          <div className="card-qty">
            <button onClick={() => onChangeQty(product.id, -1)} aria-label="Decrease">
              <Minus size={14} />
            </button>
            <span>{qtyInCart} in cart</span>
            <button onClick={() => onChangeQty(product.id, 1)} aria-label="Increase">
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button className="add-btn" onClick={onAdd}>
            Add to cart
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth modal — one entry point, two paths.
//   - "Continue with Google": one click, no redirect, cart never at risk.
//   - "Continue with email": for anyone without/not using Google.
//       -> unrecognized email shows "create account" (name, phone) first
//       -> then a sign-in link is emailed (cart is backed up locally in
//          case the link opens in a fresh tab).
// ---------------------------------------------------------------------------

function AuthModal({ onClose, onSignedIn }) {
  const [step, setStep] = useState("start"); // start | create | sent
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sellerFlow = isSeller(email);

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      onSignedIn(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail() {
    setError("");
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) return setError("Enter a valid email address.");
    setBusy(true);
    try {
      const exists = await checkAccountExists(clean);
      if (exists) {
        await sendLoginLink(clean);
        setStep("sent");
      } else {
        setStep("create");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateAccount() {
    setError("");
    if (!fullName.trim()) return setError("Enter your full name.");
    if (!phone.trim()) return setError("Enter your phone number.");
    setBusy(true);
    try {
      await sendLoginLink(email.trim().toLowerCase(), { fullName, phone });
      setStep("sent");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="modal-icon">
          {step === "create" ? (
            <UserPlus size={22} color="#E8A33D" />
          ) : sellerFlow ? (
            <Store size={22} color="#E8A33D" />
          ) : (
            <User size={22} color="#E8A33D" />
          )}
        </div>
        <h2 className="modal-title">
          {step === "start" && "Sign in"}
          {step === "create" && "Create your account"}
          {step === "sent" && "Check your email"}
        </h2>
        <p className="modal-sub">
          {step === "start" && "Use Google for one-tap sign-in, or continue with email."}
          {step === "create" && "We don't have an account for this email yet — tell us a bit about you."}
          {step === "sent" && (
            <>
              We emailed a sign-in link to <strong style={{ color: "#F4EEFA" }}>{email}</strong>. Open it on this device to finish signing in.
            </>
          )}
        </p>

        {step === "start" && (
          <>
            <button className="google-btn" onClick={handleGoogle} disabled={busy}>
              <GoogleIcon />
              {busy ? "Connecting…" : "Continue with Google"}
            </button>

            <div className="divider"><span>or</span></div>

            <label className="label">Email address</label>
            <div className="input-wrap">
              <Mail size={16} color="#8A7BAE" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                onKeyDown={(e) => e.key === "Enter" && submitEmail()}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="primary-btn" onClick={submitEmail} disabled={busy}>
              {busy ? "Checking…" : "Continue with email"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </>
        )}

        {step === "create" && (
          <>
            <label className="label">Full name</label>
            <div className="input-wrap">
              <User size={16} color="#8A7BAE" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <label className="label" style={{ marginTop: 10 }}>Phone number</label>
            <div className="input-wrap">
              <Phone size={16} color="#8A7BAE" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
            </div>
            <label className="label" style={{ marginTop: 10 }}>Email</label>
            <div className="input-wrap">
              <Mail size={16} color="#8A7BAE" />
              <input value={email} readOnly style={{ opacity: 0.7 }} />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="primary-btn" onClick={submitCreateAccount} disabled={busy}>
              {busy ? "Sending…" : "Create account & email me a link"}
              {!busy && <ArrowRight size={16} />}
            </button>
            <button className="link-btn" onClick={() => setStep("start")}>
              Use a different email
            </button>
          </>
        )}

        {step === "sent" && (
          <div className="sent-note">
            <CheckCircle2 size={36} color="#5DCAA5" />
            <p>Didn't get it? Check spam, or go back and try again.</p>
            <button className="link-btn" onClick={() => setStep("start")}>
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.17.27-1.7V4.97H.95A9 9 0 000 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Phone prompt — asked once after a new Google sign-in (Google doesn't
// provide a phone number, and we want it on file same as the email path).
// ---------------------------------------------------------------------------

function PhonePrompt({ onClose, onSave }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!phone.trim()) return setError("Enter your phone number.");
    setBusy(true);
    try {
      await onSave(phone.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="modal-icon">
          <Phone size={22} color="#E8A33D" />
        </div>
        <h2 className="modal-title">One more thing</h2>
        <p className="modal-sub">Add your phone number so we can reach you about orders.</p>
        <label className="label">Phone number</label>
        <div className="input-wrap">
          <Phone size={16} color="#8A7BAE" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary-btn" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save"}
          {!busy && <ArrowRight size={16} />}
        </button>
        <button className="link-btn" onClick={onClose}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cart drawer
// ---------------------------------------------------------------------------

function CartDrawer({ cart, products, total, onClose, onChangeQty, isLoggedIn, onLoginPrompt }) {
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => String(p.id) === String(id)), qty }))
    .filter((x) => x.product);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="modal-title">Your cart</h2>
          <button className="modal-close static" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="empty-note">Your cart is empty. Add some sparkle.</p>
        ) : (
          <>
            <div className="drawer-scroll">
              {items.map(({ product, qty }) => (
                <div key={product.id} className="cart-row">
                  <Glyph category={product.category} imageUrl={product.imageUrl} size={44} />
                  <div className="cart-row-main">
                    <p className="cart-row-name">{product.name}</p>
                    <p className="cart-row-price">
                      {fmt(product.finalPrice)} · {product.unit}
                    </p>
                  </div>
                  <div className="qty">
                    <button onClick={() => onChangeQty(product.id, -1)} aria-label="Decrease">
                      <Minus size={13} />
                    </button>
                    <span>{qty}</span>
                    <button onClick={() => onChangeQty(product.id, 1)} aria-label="Increase">
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-footer">
              <div className="total-row">
                <span>Total</span>
                <span className="total-amt">{fmt(total)}</span>
              </div>
              <button
                className="primary-btn"
                onClick={
                  isLoggedIn
                    ? () => alert("Checkout flow is the next milestone — orders collection + payment.")
                    : onLoginPrompt
                }
              >
                {isLoggedIn ? "Proceed to checkout" : "Sign in to checkout"} <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seller dashboard
// ---------------------------------------------------------------------------

function SellerDashboard({ session, onLogout, products }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [unit, setUnit] = useState("1 Box");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("20");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview("");
  }

  async function handleAdd() {
    if (!name.trim() || !price) return;
    const p = Number(price);
    const d = Math.round(p * (Number(discount || 0) / 100));
    setBusy(true);
    setNote("");
    try {
      let imageUrl = "";
      if (imageFile) {
        setUploading(true);
        imageUrl = await uploadProductImage(imageFile);
        setUploading(false);
      }
      await addProduct({
        name: name.trim(),
        category,
        unit,
        price: p,
        discount: d,
        finalPrice: p - d,
        imageUrl,
      });
      setName("");
      setPrice("");
      clearImage();
      setNote("Product added.");
    } catch (e) {
      setUploading(false);
      setNote(firebaseReady ? "Failed: " + e.message : "Demo mode — configure Firebase to save products.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSeed() {
    setBusy(true);
    setNote("");
    try {
      await seedCatalog();
      setNote("Full catalog seeded to Firestore.");
    } catch (e) {
      setNote(firebaseReady ? "Failed: " + e.message : "Demo mode — configure Firebase first.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id) {
    try {
      await removeProduct(id);
    } catch {
      setNote(firebaseReady ? "Delete failed." : "Demo mode — configure Firebase to manage products.");
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.svg" alt="" className="logo-mark" />
            <span className="logo-text">{BRAND}</span>
            <span className="seller-tag"><Store size={12} /> Seller</span>
          </div>
          <div className="user-chip">
            <span>{session.email}</span>
            <button className="icon-btn" onClick={onLogout} aria-label="Log out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="main narrow">
        <h1 className="dash-title">Product manager</h1>
        <p className="dash-sub">Add, price, and manage what buyers see in the storefront.</p>

        <div className="seller-form">
          <div className="form-grid">
            <div>
              <label className="label">Product name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={'e.g. 5" Bagupali'} />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>1 Pkt</option>
                <option>1 Box</option>
              </select>
            </div>
            <div>
              <label className="label">Price (₹)</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Discount (%)</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div>
              <label className="label">Product photo</label>
              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button type="button" className="image-remove" onClick={clearImage} aria-label="Remove photo">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="file-picker">
                  <ImageIcon size={16} color="#8A7BAE" />
                  <span>Choose photo…</span>
                  <input type="file" accept="image/*" onChange={handleFilePick} hidden />
                </label>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button className="primary-btn inline" onClick={handleAdd} disabled={busy}>
              <Plus size={16} /> {uploading ? "Uploading photo…" : busy ? "Adding…" : "Add product"}
            </button>
            <button className="ghost-btn" onClick={handleSeed} disabled={busy} title="Copy the built-in catalog into Firestore">
              <UploadCloud size={15} /> Seed full catalog
            </button>
          </div>
          {note && <p className="note">{note}</p>}
        </div>

        <h2 className="cat-heading list-heading">
          <Package size={16} /> Current catalog ({products.length} items)
        </h2>
        <div className="seller-list">
          {products.map((p) => (
            <div key={p.id} className="seller-row">
              <Glyph category={p.category} imageUrl={p.imageUrl} size={40} />
              <div className="cart-row-main">
                <p className="cart-row-name">{p.name}</p>
                <p className="cart-row-price">
                  {p.category} · {p.unit}
                </p>
              </div>
              <span className="row-price">{fmt(p.finalPrice)}</span>
              <button className="icon-btn" onClick={() => handleRemove(p.id)} aria-label="Remove">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
