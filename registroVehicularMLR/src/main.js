import "./styles.css";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, authReady, db, googleProvider } from "./firebase.js";
import {
  DIRECTIONS,
  TIME_ZONE,
  formatTimer,
  getLocalDateKey,
  groupRecords,
  sanitizeCrossing,
  secondsFromMilliseconds,
  validateCycle,
} from "./domain.js";

const MAX_PHASE_SECONDS = 600;

const state = {
  user: null,
  view: "counter",
  phase: "green",
  running: false,
  startedAtMs: 0,
  timerId: null,
  elapsedMs: { green: 0, red: 0 },
  cars: 0,
  greenStartedAt: null,
  greenEndedAt: null,
  saving: false,
  deleting: false,
  pendingDeleteId: null,
  records: [],
  loadingRecords: false,
  dateFilter: "",
  crossingFilter: "",
  directionFilter: "",
};

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="login-screen" data-login-screen>
    <div class="brand-mark" aria-hidden="true">
      <span class="brand-light brand-light--red"></span>
      <span class="brand-light"></span>
      <span class="brand-light brand-light--green"></span>
    </div>
    <p class="eyebrow">Municipalidad de La Reina</p>
    <h1>Registro vehicular</h1>
    <button class="button button--primary login-button" data-login>Continuar con Google</button>
    <p class="login-status" data-login-status aria-live="polite"></p>
  </div>

  <div class="app-shell" data-app-shell hidden>
    <header class="topbar">
      <div>
        <p class="eyebrow">La Reina</p>
        <h1>Registro vehicular</h1>
      </div>
      <button class="icon-button" data-logout aria-label="Cerrar sesión" title="Cerrar sesión">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9"/></svg>
      </button>
    </header>

    <main>
      <section class="view counter-view" data-view="counter">
        <form class="setup-card" data-cycle-form>
          <label class="field">
            <span>Cruce</span>
            <input type="text" name="crossing" list="crossing-options" maxlength="100" placeholder="Av. Larraín / Tobalaba" autocomplete="off" required />
          </label>
          <datalist id="crossing-options" data-crossing-options></datalist>

          <label class="field">
            <span>Dirección</span>
            <select name="direction" required>
              ${DIRECTIONS.map((direction) => `<option value="${direction}">${direction}</option>`).join("")}
            </select>
          </label>
        </form>

        <div class="phase-picker" role="group" aria-label="Color que se está midiendo">
          <button class="traffic-choice is-active" type="button" data-phase="green" aria-pressed="true" aria-label="Medir semáforo verde">
            <span class="traffic-light traffic-light--green" aria-hidden="true">
              <i class="lens lens--red"></i><i class="lens lens--amber"></i><i class="lens lens--green"></i>
            </span>
            <span><strong>Verde</strong><small data-green-result>Sin medir</small></span>
          </button>
          <button class="traffic-choice" type="button" data-phase="red" aria-pressed="false" aria-label="Medir semáforo rojo">
            <span class="traffic-light traffic-light--red" aria-hidden="true">
              <i class="lens lens--red"></i><i class="lens lens--amber"></i><i class="lens lens--green"></i>
            </span>
            <span><strong>Rojo</strong><small data-red-result>Sin medir</small></span>
          </button>
        </div>

        <section class="count-card" aria-live="polite">
          <div class="timer-row">
            <span class="phase-dot" data-phase-dot></span>
            <div class="timer-copy">
              <small data-timer-label>Midiendo verde</small>
              <strong class="timer" data-timer>00:00</strong>
            </div>
            <button class="icon-button icon-button--reset" type="button" data-reset aria-label="Reiniciar ciclo" title="Reiniciar ciclo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6M5.2 15a7 7 0 0 0 11.5 2L20 14M4 10l3.3-3a7 7 0 0 1 11.5 2"/></svg>
            </button>
          </div>

          <button class="counter-button" type="button" data-add-car aria-label="Sumar un auto" disabled>
            <span data-car-count>0</span>
            <small>autos</small>
            <i aria-hidden="true">+</i>
          </button>

          <div class="count-actions">
            <button class="button button--secondary" type="button" data-remove-car aria-label="Restar un auto" disabled>−1</button>
            <button class="button button--primary play-button" type="button" data-toggle-timer>
              <svg viewBox="0 0 24 24" aria-hidden="true" data-play-icon><path d="m8 5 11 7-11 7z"/></svg>
              <span data-play-label>Iniciar</span>
            </button>
          </div>

          <button class="save-cycle" type="button" data-save-cycle disabled>Guardar registro</button>
        </section>
      </section>

      <section class="view history-view" data-view="history" hidden>
        <div class="history-head">
          <div>
            <p class="eyebrow">Historial</p>
            <h2>Registros</h2>
          </div>
          <button class="icon-button" type="button" data-refresh aria-label="Actualizar registros" title="Actualizar registros">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6M5.2 15a7 7 0 0 0 11.5 2L20 14M4 10l3.3-3a7 7 0 0 1 11.5 2"/></svg>
          </button>
        </div>

        <div class="filters" aria-label="Filtros de registros">
          <label><span>Fecha</span><input type="date" data-date-filter /></label>
          <label><span>Cruce</span><select data-crossing-filter><option value="">Todos</option></select></label>
          <label><span>Dirección</span><select data-direction-filter><option value="">Todas</option>${DIRECTIONS.map((direction) => `<option value="${direction}">${direction}</option>`).join("")}</select></label>
        </div>

        <div class="history-list" data-history-list>
          <div class="empty-state">Todavía no hay registros.</div>
        </div>
      </section>
    </main>

    <nav class="bottom-nav" aria-label="Secciones">
      <button class="is-active" data-nav="counter" aria-current="page">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V10M7 15h10M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z"/></svg>
        <span>Contar</span>
      </button>
      <button data-nav="history">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2zM7 9h10M7 13h10M7 17h6"/></svg>
        <span>Registros</span>
      </button>
    </nav>
  </div>

  <dialog class="delete-dialog" data-delete-dialog>
    <div class="dialog-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
    </div>
    <h2>¿Borrar registro?</h2>
    <p data-delete-summary>Esta acción no se puede deshacer.</p>
    <div class="dialog-actions">
      <button class="button button--secondary" type="button" data-cancel-delete>Cancelar</button>
      <button class="button button--danger" type="button" data-confirm-delete>Borrar</button>
    </div>
  </dialog>

  <div class="toast" data-toast role="status" aria-live="polite"></div>
`;

const elements = {
  loginScreen: app.querySelector("[data-login-screen]"),
  appShell: app.querySelector("[data-app-shell]"),
  login: app.querySelector("[data-login]"),
  loginStatus: app.querySelector("[data-login-status]"),
  logout: app.querySelector("[data-logout]"),
  form: app.querySelector("[data-cycle-form]"),
  phaseButtons: [...app.querySelectorAll("[data-phase]")],
  phaseDot: app.querySelector("[data-phase-dot]"),
  timer: app.querySelector("[data-timer]"),
  timerLabel: app.querySelector("[data-timer-label]"),
  greenResult: app.querySelector("[data-green-result]"),
  redResult: app.querySelector("[data-red-result]"),
  reset: app.querySelector("[data-reset]"),
  addCar: app.querySelector("[data-add-car]"),
  removeCar: app.querySelector("[data-remove-car]"),
  carCount: app.querySelector("[data-car-count]"),
  toggleTimer: app.querySelector("[data-toggle-timer]"),
  playLabel: app.querySelector("[data-play-label]"),
  playIcon: app.querySelector("[data-play-icon]"),
  saveCycle: app.querySelector("[data-save-cycle]"),
  navButtons: [...app.querySelectorAll("[data-nav]")],
  views: [...app.querySelectorAll("[data-view]")],
  refresh: app.querySelector("[data-refresh]"),
  historyList: app.querySelector("[data-history-list]"),
  dateFilter: app.querySelector("[data-date-filter]"),
  crossingFilter: app.querySelector("[data-crossing-filter]"),
  directionFilter: app.querySelector("[data-direction-filter]"),
  crossingOptions: app.querySelector("[data-crossing-options]"),
  deleteDialog: app.querySelector("[data-delete-dialog]"),
  deleteSummary: app.querySelector("[data-delete-summary]"),
  cancelDelete: app.querySelector("[data-cancel-delete]"),
  confirmDelete: app.querySelector("[data-confirm-delete]"),
  toast: app.querySelector("[data-toast]"),
};

let toastTimeout;

function notify(message, type = "default") {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.add("is-visible");
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function vibrate(pattern = 12) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

function formValues() {
  const data = new FormData(elements.form);
  return {
    crossing: sanitizeCrossing(data.get("crossing")),
    direction: data.get("direction"),
    greenSeconds: secondsFromMilliseconds(state.elapsedMs.green),
    redSeconds: secondsFromMilliseconds(state.elapsedMs.red),
    cars: state.cars,
  };
}

function setupError() {
  const values = formValues();
  if (values.crossing.length < 3) return "Escribe el cruce antes de medir.";
  if (!DIRECTIONS.includes(values.direction)) return "Elige una dirección.";
  return "";
}

function currentElapsedMs(phase = state.phase) {
  const runningPart = state.running && phase === state.phase ? Date.now() - state.startedAtMs : 0;
  return Math.min(MAX_PHASE_SECONDS * 1000, state.elapsedMs[phase] + runningPart);
}

function measuredSeconds(phase) {
  return secondsFromMilliseconds(state.elapsedMs[phase]);
}

function updateCounter() {
  elements.carCount.textContent = state.cars;
  const canCount = state.phase === "green" && state.running && !state.saving;
  elements.addCar.disabled = !canCount;
  elements.removeCar.disabled = !canCount || state.cars === 0;
}

function updateTimer() {
  const seconds = secondsFromMilliseconds(currentElapsedMs());
  elements.timer.textContent = formatTimer(seconds);
  elements.timerLabel.textContent = `Midiendo ${state.phase === "green" ? "verde" : "rojo"}`;
  elements.playLabel.textContent = state.running ? "Pausar" : state.elapsedMs[state.phase] > 0 ? "Continuar" : "Iniciar";
  elements.playIcon.innerHTML = state.running
    ? '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>'
    : '<path d="m8 5 11 7-11 7z"/>';
  elements.toggleTimer.classList.toggle("is-pausing", state.running);
  elements.phaseDot.dataset.phase = state.phase;
  elements.greenResult.textContent = state.elapsedMs.green > 0 ? formatTimer(measuredSeconds("green")) : "Sin medir";
  elements.redResult.textContent = state.elapsedMs.red > 0 ? formatTimer(measuredSeconds("red")) : "Sin medir";

  const readyToSave = measuredSeconds("green") > 0 && measuredSeconds("red") > 0;
  elements.saveCycle.disabled = !readyToSave || state.running || state.saving;
  elements.saveCycle.textContent = state.saving ? "Guardando…" : "Guardar registro";
  elements.form.querySelectorAll("input, select").forEach((control) => {
    control.disabled = state.running || state.saving;
  });
  elements.phaseButtons.forEach((button) => {
    button.disabled = state.running || state.saving;
  });
  updateCounter();
}

function updatePhase() {
  elements.phaseButtons.forEach((button) => {
    const active = button.dataset.phase === state.phase;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.documentElement.dataset.phase = state.phase;
  updateTimer();
}

function stopTicker() {
  window.clearInterval(state.timerId);
  state.timerId = null;
  state.running = false;
  state.startedAtMs = 0;
}

function resetCycle() {
  stopTicker();
  state.phase = "green";
  state.elapsedMs = { green: 0, red: 0 };
  state.cars = 0;
  state.greenStartedAt = null;
  state.greenEndedAt = null;
  updatePhase();
  vibrate([8, 30, 8]);
}

function pauseMeasurement({ reachedLimit = false } = {}) {
  if (!state.running) return;

  const phase = state.phase;
  state.elapsedMs[phase] = currentElapsedMs(phase);
  stopTicker();

  if (phase === "green") {
    state.greenEndedAt = new Date();
  }

  if (reachedLimit) notify("La medición llegó al máximo de 10 minutos.", "error");
  else notify(`${phase === "green" ? "Verde" : "Rojo"} medido: ${formatTimer(measuredSeconds(phase))}`, "success");

  const nextPhase = phase === "green" ? "red" : "green";
  if (state.elapsedMs[nextPhase] === 0) state.phase = nextPhase;
  updatePhase();
  vibrate([12, 35, 12]);
}

function tick() {
  if (currentElapsedMs() >= MAX_PHASE_SECONDS * 1000) {
    pauseMeasurement({ reachedLimit: true });
    return;
  }
  updateTimer();
}

function startMeasurement() {
  const error = setupError();
  if (error) {
    notify(error, "error");
    return;
  }

  if (state.phase === "green" && !state.greenStartedAt) state.greenStartedAt = new Date();
  state.startedAtMs = Date.now();
  state.running = true;
  state.timerId = window.setInterval(tick, 200);
  updateTimer();
}

function toggleTimer() {
  if (state.saving) return;
  if (state.running) pauseMeasurement();
  else startMeasurement();
}

async function saveCycle() {
  if (!state.user || state.saving || state.running) return;

  const values = formValues();
  const error = validateCycle(values);
  if (error) {
    notify(error, "error");
    return;
  }

  state.saving = true;
  updatePhase();

  const endedAt = state.greenEndedAt || new Date();
  const startedAt = state.greenStartedAt || new Date(endedAt.getTime() - values.greenSeconds * 1000);

  try {
    await addDoc(collection(db, "registros"), {
      ownerUid: state.user.uid,
      cruce: values.crossing,
      direccion: values.direction,
      fechaLocal: getLocalDateKey(endedAt),
      zonaHoraria: TIME_ZONE,
      verdeSegundos: values.greenSeconds,
      rojoSegundos: values.redSeconds,
      autos: values.cars,
      cierre: "manual",
      inicioVerde: Timestamp.fromDate(startedAt),
      finVerde: Timestamp.fromDate(endedAt),
      createdAt: serverTimestamp(),
    });

    notify("Registro guardado", "success");
    vibrate([12, 40, 18]);
    resetCycle();
    await loadRecords({ quiet: true });
  } catch (error) {
    console.error(error);
    if (error.code === "permission-denied") {
      notify("Esta cuenta no tiene acceso.", "error");
      await signOut(auth);
    } else {
      notify("No se pudo guardar. Revisa la conexión.", "error");
    }
  } finally {
    state.saving = false;
    updatePhase();
  }
}

function selectPhase(phase) {
  if (phase === state.phase || state.running || state.saving) return;
  state.phase = phase;
  updatePhase();
  vibrate();
}

function switchView(view) {
  state.view = view;
  elements.views.forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  elements.navButtons.forEach((button) => {
    const active = button.dataset.nav === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (view === "history") renderHistory();
}

function formatDateLabel(dateKey) {
  if (dateKey === "Sin fecha") return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTimeLabel(timestamp) {
  if (!timestamp?.toDate) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(timestamp.toDate());
}

function filteredRecords() {
  return state.records.filter((record) => {
    if (state.dateFilter && record.fechaLocal !== state.dateFilter) return false;
    if (state.crossingFilter && record.cruce !== state.crossingFilter) return false;
    if (state.directionFilter && record.direccion !== state.directionFilter) return false;
    return true;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCrossingChoices() {
  const crossings = [...new Set(state.records.map((record) => record.cruce).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  elements.crossingOptions.innerHTML = crossings.map((crossing) => `<option value="${escapeHtml(crossing)}"></option>`).join("");
  elements.crossingFilter.innerHTML = `<option value="">Todos</option>${crossings.map((crossing) => `<option value="${escapeHtml(crossing)}">${escapeHtml(crossing)}</option>`).join("")}`;
  elements.crossingFilter.value = crossings.includes(state.crossingFilter) ? state.crossingFilter : "";
}

function renderHistory() {
  if (state.loadingRecords) {
    elements.historyList.innerHTML = `<div class="empty-state"><span class="spinner"></span>Cargando…</div>`;
    return;
  }

  const records = filteredRecords();
  if (!records.length) {
    elements.historyList.innerHTML = `<div class="empty-state">No hay registros para este filtro.</div>`;
    return;
  }

  const groups = groupRecords(records);
  elements.historyList.innerHTML = Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayRecords]) => `
      <section class="day-group">
        <div class="day-heading">
          <h3>${escapeHtml(formatDateLabel(date))}</h3>
          <span>${dayRecords.length}</span>
        </div>
        <div class="record-grid">
          ${dayRecords.map((record) => `
            <article class="record-card">
              <div class="record-main">
                <strong>${escapeHtml(record.cruce)}</strong>
                <span>${escapeHtml(record.direccion)} · ${formatTimeLabel(record.finVerde)}</span>
              </div>
              <div class="record-count"><strong>${record.autos}</strong><span>autos</span></div>
              <dl>
                <div><dt>Verde</dt><dd>${record.verdeSegundos}s</dd></div>
                <div><dt>Rojo</dt><dd>${record.rojoSegundos}s</dd></div>
              </dl>
              ${record.ownerUid === state.user?.uid ? `
                <button class="delete-record" type="button" data-delete-record="${escapeHtml(record.id)}" aria-label="Borrar registro de ${escapeHtml(record.cruce)}" title="Borrar registro">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
                </button>
              ` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `).join("");
}

async function loadRecords({ quiet = false } = {}) {
  if (!state.user || state.loadingRecords) return;
  state.loadingRecords = true;
  if (!quiet) renderHistory();
  try {
    const recordsQuery = query(collection(db, "registros"), orderBy("createdAt", "desc"), limit(500));
    const snapshot = await getDocs(recordsQuery);
    state.records = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    renderCrossingChoices();
  } catch (error) {
    console.error(error);
    if (error.code === "permission-denied") {
      notify("Esta cuenta no tiene acceso.", "error");
      await signOut(auth);
    } else {
      notify("No se pudieron cargar los registros.", "error");
    }
  } finally {
    state.loadingRecords = false;
    renderHistory();
  }
}

function openDeleteDialog(recordId) {
  if (state.deleting) return;
  const record = state.records.find(({ id }) => id === recordId);
  if (!record) return;
  state.pendingDeleteId = recordId;
  elements.deleteSummary.textContent = `${record.cruce} · ${record.direccion} · ${record.autos} autos. Esta acción no se puede deshacer.`;
  elements.deleteDialog.showModal();
}

function closeDeleteDialog() {
  if (state.deleting) return;
  state.pendingDeleteId = null;
  elements.deleteDialog.close();
}

async function confirmDelete() {
  if (!state.user || !state.pendingDeleteId || state.deleting) return;
  const recordId = state.pendingDeleteId;
  state.deleting = true;
  elements.confirmDelete.disabled = true;
  elements.cancelDelete.disabled = true;
  elements.confirmDelete.textContent = "Borrando…";

  try {
    await deleteDoc(doc(db, "registros", recordId));
    state.records = state.records.filter(({ id }) => id !== recordId);
    state.pendingDeleteId = null;
    elements.deleteDialog.close();
    renderCrossingChoices();
    renderHistory();
    notify("Registro borrado", "success");
    vibrate([12, 35, 12]);
  } catch (error) {
    console.error(error);
    if (error.code === "permission-denied") notify("No tienes permiso para borrar este registro.", "error");
    else notify("No se pudo borrar. Revisa la conexión.", "error");
  } finally {
    state.deleting = false;
    elements.confirmDelete.disabled = false;
    elements.cancelDelete.disabled = false;
    elements.confirmDelete.textContent = "Borrar";
  }
}

elements.login.addEventListener("click", async () => {
  elements.login.disabled = true;
  elements.loginStatus.textContent = "Abriendo Google…";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error de autenticación", error);
    elements.loginStatus.textContent = error.code === "auth/popup-closed-by-user" ? "" : "No se pudo iniciar sesión.";
  } finally {
    elements.login.disabled = false;
  }
});

elements.logout.addEventListener("click", () => signOut(auth));
elements.phaseButtons.forEach((button) => button.addEventListener("click", () => selectPhase(button.dataset.phase)));
elements.addCar.addEventListener("click", () => {
  state.cars = Math.min(5000, state.cars + 1);
  updateCounter();
  vibrate();
});
elements.removeCar.addEventListener("click", () => {
  state.cars = Math.max(0, state.cars - 1);
  updateCounter();
  vibrate();
});
elements.toggleTimer.addEventListener("click", toggleTimer);
elements.reset.addEventListener("click", resetCycle);
elements.saveCycle.addEventListener("click", saveCycle);
elements.navButtons.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.nav)));
elements.refresh.addEventListener("click", () => loadRecords());
elements.historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-record]");
  if (button) openDeleteDialog(button.dataset.deleteRecord);
});
elements.cancelDelete.addEventListener("click", closeDeleteDialog);
elements.confirmDelete.addEventListener("click", confirmDelete);
elements.deleteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDeleteDialog();
});
elements.deleteDialog.addEventListener("click", (event) => {
  if (event.target === elements.deleteDialog) closeDeleteDialog();
});

elements.dateFilter.addEventListener("change", (event) => {
  state.dateFilter = event.target.value;
  renderHistory();
});
elements.crossingFilter.addEventListener("change", (event) => {
  state.crossingFilter = event.target.value;
  renderHistory();
});
elements.directionFilter.addEventListener("change", (event) => {
  state.directionFilter = event.target.value;
  renderHistory();
});

elements.login.disabled = true;
authReady
  .then(() => {
    elements.login.disabled = false;
  })
  .catch((error) => {
    console.error("No se pudo preparar la sesión", error);
    elements.loginStatus.textContent = "No se pudo preparar el acceso.";
  });

onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.user = user;
    elements.loginScreen.hidden = true;
    elements.appShell.hidden = false;
    elements.loginStatus.textContent = "";
    await loadRecords({ quiet: true });
  } else {
    state.user = null;
    stopTicker();
    elements.loginScreen.hidden = false;
    elements.appShell.hidden = true;
  }
});

updatePhase();
