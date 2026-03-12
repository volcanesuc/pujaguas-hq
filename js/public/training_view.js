// /js/public/training_view.js
import { db } from "../auth/firebase.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { loadHeader } from "../components/header.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TRAININGS_COL = "playbook_trainings";
const DRILLS_COL = "drills";

const $ = (id) => document.getElementById(id);

const tvTitle = $("tvTitle");
const tvSubtitle = $("tvSubtitle");
const tvDate = $("tvDate");
const tvNotes = $("tvNotes");
const tvPublicState = $("tvPublicState");
const tvError = $("tvError");
const tvDrills = $("tvDrills");
const tvEmpty = $("tvEmpty");
const tvShareBtn = $("tvShareBtn");

let loadedDrills = [];
let drillModal = null;

function showError(msg) {
  if (!tvError) return;
  tvError.textContent = msg;
  tvError.classList.remove("d-none");
}

function formatNotes(text) {
  if (!text) return "—";

  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
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
  return d.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
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
  const volume = (d?.volume || "—").toString().trim();
  const rest = (d?.restAfter || "—").toString().trim();

  return `
    <div class="col-12 col-lg-6">
      <div class="card h-100 shadow-sm">
        <div class="card-body">

          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="fw-semibold">${escapeHtml(name)}</div>

            <button
              type="button"
              class="btn btn-sm btn-outline-primary js-open-drill"
              data-drill-id="${escapeHtml(d.id)}"
            >
              Ver
            </button>
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

function ensureDrillModal() {
  if (document.getElementById("publicDrillModal")) {
    if (!drillModal && window.bootstrap?.Modal) {
      drillModal = new bootstrap.Modal(document.getElementById("publicDrillModal"));
    }
    return;
  }

  const modalHtml = `
    <div class="modal fade" id="publicDrillModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title mb-0" id="publicDrillModalTitle">Drill</h5>
              <small class="text-muted" id="publicDrillModalSubtitle">Detalle del drill</small>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>

          <div class="modal-body">
            <div class="row g-3 mb-3">
              <div class="col-6 col-md-3">
                <div class="small text-muted">Volumen</div>
                <div id="publicDrillVolume" class="fw-semibold">—</div>
              </div>

              <div class="col-6 col-md-3">
                <div class="small text-muted">Descanso</div>
                <div id="publicDrillRest" class="fw-semibold">—</div>
              </div>

              <div class="col-6 col-md-3">
                <div class="small text-muted">Tipo</div>
                <div id="publicDrillType" class="fw-semibold">—</div>
              </div>

              <div class="col-6 col-md-3">
                <div class="small text-muted">Players</div>
                <div id="publicDrillPlayers" class="fw-semibold">—</div>
              </div>
            </div>

            <div class="mb-3">
              <div class="small text-muted mb-1">Objetivo</div>
              <div id="publicDrillObjective">—</div>
            </div>

            <div class="mb-3">
              <div class="small text-muted mb-1">Descripción / Notas</div>
              <div id="publicDrillNotes">—</div>
            </div>
          </div>

          <div class="modal-footer">
            <a
              id="publicDrillTacticalBtn"
              class="btn btn-outline-primary d-none"
              href="#"
              target="_blank"
              rel="noopener"
            >
              Tactical Board
            </a>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  if (window.bootstrap?.Modal) {
    drillModal = new bootstrap.Modal(document.getElementById("publicDrillModal"));
  }
}

function fillDrillModal(drill) {
  const title = $("publicDrillModalTitle");
  const subtitle = $("publicDrillModalSubtitle");
  const volume = $("publicDrillVolume");
  const rest = $("publicDrillRest");
  const type = $("publicDrillType");
  const players = $("publicDrillPlayers");
  const objective = $("publicDrillObjective");
  const notes = $("publicDrillNotes");
  const tacticalBtn = $("publicDrillTacticalBtn");

  if (title) title.textContent = drill?.name || "Drill";
  if (subtitle) subtitle.textContent = "Detalle del drill";

  if (volume) volume.textContent = (drill?.volume || "—").toString().trim() || "—";
  if (rest) rest.textContent = (drill?.restAfter || "—").toString().trim() || "—";
  if (type) type.textContent = (drill?.type || drill?.category || "—").toString().trim() || "—";
  if (players) {
    const v =
      drill?.playersNeeded ??
      drill?.minPlayers ??
      drill?.players ??
      "—";
    players.textContent = String(v).trim() || "—";
  }

  if (objective) {
    objective.innerHTML = drill?.objective
      ? formatNotes(drill.objective)
      : "—";
  }

  if (notes) {
    const noteText =
      drill?.description ||
      drill?.notes ||
      drill?.instructions ||
      "";
    notes.innerHTML = noteText
      ? formatNotes(noteText)
      : "—";
  }

  if (tacticalBtn) {
    const tactical = safeUrl(drill?.tacticalBoardUrl || "");
    if (tactical) {
      tacticalBtn.href = tactical;
      tacticalBtn.classList.remove("d-none");
    } else {
      tacticalBtn.href = "#";
      tacticalBtn.classList.add("d-none");
    }
  }
}

function openDrillModalById(drillId) {
  const drill = loadedDrills.find(d => d.id === drillId);
  if (!drill) return;

  ensureDrillModal();
  fillDrillModal(drill);

  if (!drillModal && window.bootstrap?.Modal) {
    drillModal = new bootstrap.Modal(document.getElementById("publicDrillModal"));
  }

  drillModal?.show();
}

function bindDrillActions() {
  tvDrills?.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-open-drill");
    if (!btn) return;

    const drillId = btn.getAttribute("data-drill-id");
    if (!drillId) return;

    openDrillModalById(drillId);
  });
}

async function initHeader() {
  try {
    await loadHeader("home", {
      enabledTabs: {}
    });

    const brand = document.querySelector("#app-header .navbar-brand, #app-header .brand-text, #app-header .header-brand");
    if (brand) {
      brand.style.cursor = "pointer";
      brand.addEventListener("click", () => {
        window.location.href = "/pages/admin/dashboard.html";
      });
    }

    const selectorsToHide = [
      "#app-header .navbar-nav",
      "#app-header .nav",
      "#app-header .header-tabs",
      "#app-header .header-actions",
      "#app-header .logout-btn",
      "#app-header #logoutBtn",
      "#app-header .btn",
      "#app-header .dropdown",
      "#app-header .user-menu"
    ];

    selectorsToHide.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.display = "none";
      });
    });
  } catch (err) {
    console.warn("No se pudo cargar el header:", err);
  }
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "").trim();

  if (!id) {
    showError("Falta el parámetro id. Ej: training.html?id=XXXX");
    return;
  }

  showLoader();

  try {
    ensureDrillModal();
    bindDrillActions();
    await initHeader();

    const snap = await getDoc(doc(db, TRAININGS_COL, id));
    if (!snap.exists()) {
      showError("No se encontró este Plan de Entrenamiento.");
      return;
    }

    const t = { id: snap.id, ...snap.data() };

    if (t.isPublic !== true) {
      showError("Este Plan de Entrenamiento es privado.");
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

    if (tvTitle) tvTitle.textContent = t.name || "Plan de Entrenamiento";
    if (tvSubtitle) tvSubtitle.textContent = "Plan de Entrenamiento";
    if (tvDate) tvDate.textContent = fmtDate(t.date);
    if (tvNotes) tvNotes.innerHTML = formatNotes(t.notes);
    if (tvPublicState) tvPublicState.textContent = "Público";

    const ids = extractOrderedIds(t);
    if (!ids.length) {
      tvEmpty?.classList.remove("d-none");
      return;
    }

    const drills = await fetchDrillsByIds(ids);
    loadedDrills = drills;

    tvDrills.innerHTML = drills.length
      ? drills.map(drillCard).join("")
      : "";

    tvEmpty?.classList.toggle("d-none", drills.length > 0);
  } catch (e) {
    console.error(e);
    showError("Error cargando el Plan de Entrenamiento.");
  } finally {
    hideLoader();
  }
})();