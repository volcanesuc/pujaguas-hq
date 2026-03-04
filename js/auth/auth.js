// js/auth.js
import { auth } from "../auth/firebase.js";
import { db } from "../auth/firebase.js";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const provider = new GoogleAuthProvider();

// evita correr getRedirectResult 2 veces
let _redirectHandled = false;

const STORAGE_KEY = "google_login_paths";

/* =========================================================
   Google Login (redirect)
========================================================= */
export async function loginWithGoogle(opts = {}) {
  const dashboardPath = opts.dashboardPath ?? "dashboard.html";
  const registerPath = opts.registerPath ?? "public/register.html";

  try {
    // guardá paths para usarlos cuando regrese del redirect
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dashboardPath, registerPath })
    );

    provider.setCustomParameters({ prompt: "select_account" });

    // 👇 navega a Google (no popup)
    await signInWithRedirect(auth, provider);
  } catch (err) {
    console.error("loginWithGoogle error:", err?.code, err?.message, err);
    alert(`Error al iniciar sesión: ${err?.code || ""} ${err?.message || ""}`);
  }
}

/* =========================================================
   Handle redirect result (call once on app boot)
   - Si users/{uid}.onboardingComplete === true => dashboard
   - Si no => public/register.html?google=1
========================================================= */
export async function handleGoogleRedirectResult() {
  console.log("🔵 handleGoogleRedirectResult BOOT", location.href);

  if (_redirectHandled) {
    console.log("⚠️ Redirect ya procesado");
    return null;
  }
  _redirectHandled = true;

  let cred = null;

  try {
    cred = await getRedirectResult(auth);
    console.log("🔵 getRedirectResult:", cred?.user?.uid || "NO CRED");
  } catch (err) {
    console.error("❌ getRedirectResult error:", err?.code, err?.message, err);
    return null;
  }

  // Si no viene de redirect, salir silenciosamente
  if (!cred?.user) {
    console.log("🟡 No hay redirect result");
    return null;
  }

  const user = cred.user;
  console.log("🟢 Usuario autenticado:", user.uid, user.email);

  // Obtener paths guardados
  const stored = safeJson(sessionStorage.getItem(STORAGE_KEY)) || {};
  const dashboardPath = stored.dashboardPath ?? "dashboard.html";
  const registerPath =
    stored.registerPath ?? "public/register.html?google=1";

  // Limpiar storage para evitar loops
  sessionStorage.removeItem(STORAGE_KEY);

  const email = (user.email || "").toLowerCase();

  // Prefill siempre
  sessionStorage.setItem(
    "prefill_register",
    JSON.stringify({
      fullName: user.displayName || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
    })
  );

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data() || {};
      const done = data.onboardingComplete === true;

      console.log("📄 User doc existe. onboardingComplete:", done);

      // Mantener email actualizado
      if (email && data.email !== email) {
        await setDoc(
          userRef,
          { email, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      window.location.href = done ? dashboardPath : registerPath;
      return cred;
    }

    console.log("📄 User doc NO existe. Creando...");

    // Crear doc mínimo
    await setDoc(
      userRef,
      {
        email: email || null,
        onboardingComplete: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ User doc creado. Redirigiendo a register");

    window.location.href = registerPath;
    return cred;

  } catch (err) {
    console.error("❌ Firestore error:", err?.code, err?.message, err);
    alert(`Firestore error: ${err?.code} ${err?.message}`);
    return cred;
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* =========================================================
   Guard / watchAuth
========================================================= */
export function watchAuth(onLoggedIn, opts = {}) {
  const redirectTo = opts.redirectTo ?? "/index.html";

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace(redirectTo);
      return;
    }
    onLoggedIn?.(user);
  });
}

/* =========================================================
   Logout
========================================================= */
export async function logout(opts = {}) {
  const redirectTo = opts.redirectTo ?? "index.html";
  await signOut(auth);
  window.location.href = redirectTo;
}