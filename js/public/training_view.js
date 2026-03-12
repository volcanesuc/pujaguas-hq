// /js/public/training_view.js
import { db } from "../auth/firebase.js";
import { showLoader, hideLoader } from "../ui/loader.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TRAININGS_COL = "playbook_trainings";
const DRILLS_COL = "drills";

const $ = (id) => document.getElementById(id);

const tvTitle = $("tvTitle");
const tvSubtitle = $("tvSubtitle");
const tvNotes = $("tvNotes");
const tvPublicState = $("tvPublicState");
const tvError = $("tvError");
const tvDrills = $("tvDrills");
const tvEmpty = $("tvEmpty");
const tvShareBtn = $("tvShareBtn");

function showError(msg) {
  if (!tvError) return;
  tvError.textContent = msg;
  tvError.classList.remove("d-none");
}

function formatNotes(text) {
  if (!text) return "—";

  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // **negrita**
    .replace(/\n/g, "<br>"); // saltos de linea
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = value?.toDate?.() ?? new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "2-digit" });
}

function extractOrderedIds(training) {
  if (Array.isArray(training?.drillRefs) && training.drillRefs.length) {
    return training.drillRefs
      .map((r, idx) => ({
        id: String(r?.drillId || "").trim(),
        order: Number.isFinite(Number(r?.order)) ? Number(r.order) : (idx + 1),
      }))
      .filter(x => !!x.id)
      .sort((a, b) => a.order - b.order)
      .map(x => x.id);
  }

  if (Array.isArray(training?.drillIds) && training.drillIds.length) {
    return training.drillIds.map(x => String(x || "").trim()).filter(Boolean);
  }

  if (Array.isArray(training?.drills) && training.drills.length) {
    return training.drills.map(x => String(x || "").trim()).filter(Boolean);
  }

  return [];
}

async function fetchDrillsByIds(ids) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, DRILLS_COL, id));
        if (!snap.exists()) return null;

        const data = { id: snap.id, ...snap.data() };

        // blindaje adicional
        if (data.isPublic !== true) return null;

        return data;
      } catch (err) {
        console.warn("No se pudo leer drill:", id, err);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

function drillCard(d) {
  const name = d?.name || "—";
  const tactical = safeUrl(d?.tacticalBoardUrl || "");
  const volume = (d?.volume || "—").toString().trim();
  const rest = (d?.restAfter || "—").toString().trim();

  return `
    <div class="col-12 col-lg-6">
      <div class="card h-100 shadow-sm">
        <div class="card-body">

          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="fw-semibold">${escapeHtml(name)}</div>

            ${
              tactical
                ? `<a class="btn btn-sm btn-outline-primary"
                      target="_blank"
                      rel="noopener"
                      href="${escapeHtml(tactical)}">Ver</a>`
                : ``
            }
          </div>

          <div class="row mt-3 g-2">
            <div class="col-6">
              <div class="small text-muted">Volumen</div>
              <div>${escapeHtml(volume)}</div>
            </div>
            <div class="col-6">
              <div class="small text-muted">Descanso</div>
              <div>${escapeHtml(rest)}</div>
            </div>
          </div>

          ${
            d?.objective
              ? `<div class="mt-3">
                   <div class="small text-muted">Objetivo</div>
                   <div class="text-muted">${escapeHtml(d.objective)}</div>
                 </div>`
              : ``
          }

        </div>
      </div>
    </div>
  `;
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "").trim();

  if (!id) {
    showError("Falta el parámetro id. Ej: training.html?id=XXXX");
    return;
  }

  tvShareBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      tvShareBtn.textContent = "Link copiado ✅";
      setTimeout(() => (tvShareBtn.textContent = "Compartir"), 1200);
    } catch {
      alert("No pude copiar el link. Copialo manualmente de la barra.");
    }
  });

  showLoader();
  try {
    const snap = await getDoc(doc(db, TRAININGS_COL, id));
    if (!snap.exists()) {
      showError("No se encontró este entrenamiento.");
      return;
    }

    const t = { id: snap.id, ...snap.data() };

    if (t.isPublic !== true) {
      showError("Este entrenamiento es privado.");
      return;
    }

    if (tvTitle) tvTitle.textContent = "Plan de Entrenamiento";
    if (tvSubtitle) tvSubtitle.textContent = t.name || "-";
    if (tvNotes) tvNotes.innerHTML = formatNotes(t.notes);
    if (tvPublicState) tvPublicState.textContent = "Público";

    const ids = extractOrderedIds(t);
    if (!ids.length) {
      tvEmpty?.classList.remove("d-none");
      return;
    }

    const drills = await fetchDrillsByIds(ids);

    tvDrills.innerHTML = drills.length
      ? drills.map(drillCard).join("")
      : "";

    tvEmpty?.classList.toggle("d-none", drills.length > 0);
  } catch (e) {
    console.error(e);
    showError("Error cargando el entrenamiento.");
  } finally {
    hideLoader();
  }
})();