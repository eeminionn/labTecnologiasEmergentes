import "./styles.css";

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth, authReady, db, googleProvider } from "./firebase.js";
import {
  DIRECTIONS,
  TIME_ZONE,
  formatTimer,
  getLocalDateKey,
  groupRecords,
  sanitizeCrossing,
  validateCycle,
} from "./domain.js";

const state = {
  user: null,
  view: "counter",
  phase: "green",
  remaining: 45,
  running: false,
  endAt: 0,
  timerId: null,
  cars: 0,
  greenStartedAt: null,
  saving: false,
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
    <p class="eyebrow">La Reina</p>
    <h1>Tránsito MLR</h1>
    <button class="button button--dark login-button" data-login>Entrar con Google</button>
    <p class="login-status" data-login-status aria-live="polite"></p>
  </div>

  <div class="app-shell" data-app-shell hidden>
    <header class="topbar">
      <div>
        <p class="eyebrow">La Reina</p>
        <h1>Tránsito MLR</h1>
      </div>
      <button class="icon-button" data-logout aria-label="Cerrar sesión" title="Cerrar sesión">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9"/></svg>
      </button>
    </header>

    <main>
      <section class="view counter-view" data-view="counter">
        <form class="setup-card" data-cycle-form>
          <label class="field field--wide">
            <span>Cruce</span>
            <input type="text" name="crossing" list="crossing-options" maxlength="100" placeholder="Av. Larraín / Tobalaba" autocomplete="off" required />
          </label>
          <datalist id="crossing-options" data-crossing-options></datalist>

          <label class="field field--wide">
            <span>Dirección</span>
            <select name="direction" required>
              ${DIRECTIONS.map((direction) => `<option value="${direction}">${direction}</option>`).join("")}
            </select>
          </label>

          <label class="field">
            <span>Verde</span>
            <div class="number-field"><input type="number" name="greenSeconds" min="1" max="600" value="45" inputmode="numeric" required /><small>s</small></div>
          </label>

          <label class="field">
            <span>Rojo</span>
            <div class="number-field"><input type="number" name="redSeconds" min="1" max="600" value="45" inputmode="numeric" required /><small>s</small></div>
          </label>
        </form>

        <div class="phase-picker" role="group" aria-label="Estado del semáforo">
          <button class="traffic-choice is-active" type="button" data-phase="green" aria-pressed="true" aria-label="Semáforo verde">
            <span class="traffic-light traffic-light--green" aria-hidden="true">
              <i class="lens lens--red"></i><i class="lens lens--amber"></i><i class="lens lens--green"></i>
            </span>
            <span>Verde</span>
          </button>
          <button class="traffic-choice" type="button" data-phase="red" aria-pressed="false" aria-label="Semáforo rojo">
            <span class="traffic-light traffic-light--red" aria-hidden="true">
              <i class="lens lens--red"></i><i class="lens lens--amber"></i><i class="lens lens--green"></i>
            </span>
            <span>Rojo</span>
          </button>
        </div>

        <section class="count-card" aria-live="polite">
          <div class="timer-row">
            <span class="phase-dot" data-phase-dot></span>
            <strong class="timer" data-timer>00:45</strong>
            <button class="icon-button icon-button--reset" type="button" data-reset aria-label="Reiniciar ciclo" title="Reiniciar ciclo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6M5.2 15a7 7 0 0 0 11.5 2L20 14M4 10l3.3-3a7 7 0 0 1 11.5 2"/></svg>
            </button>
          </div>

          <button class="counter-button" type="button" data-add-car aria-label="Sumar un auto">
            <span data-car-count>0</span>
            <small>autos</small>
            <i aria-hidden="true">+</i>
          </button>

          <div class="count-actions">
            <button class="button button--soft" type="button" data-remove-car aria-label="Restar un auto">−1</button>
            <button class="button button--dark" type="button" data-toggle-timer>Iniciar</button>
          </div>

          <button class="save-cycle" type="button" data-save-cycle>Guardar ciclo</button>
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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h2M13 15h2"/></svg>
        <span>Contar</span>
      </button>
      <button data-nav="history">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16M7 3v4M7 10v4M7 17v4"/></svg>
        <span>Registros</span>
      </button>
    </nav>
  </div>

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
  reset: app.querySelector("[data-reset]"),
  addCar: app.querySelector("[data-add-car]"),
  removeCar: app.querySelector("[data-remove-car]"),
  carCount: app.querySelector("[data-car-count]"),
  toggleTimer: app.querySelector("[data-toggle-timer]"),
  saveCycle: app.querySelector("[data-save-cycle]"),
  navButtons: [...app.querySelectorAll("[data-nav]")],
  views: [...app.querySelectorAll("[data-view]")],
  refresh: app.querySelector("[data-refresh]"),
  historyList: app.querySelector("[data-history-list]"),
  dateFilter: app.querySelector("[data-date-filter]"),
  crossingFilter: app.querySelector("[data-crossing-filter]"),
  directionFilter: app.querySelector("[data-direction-filter]"),
  crossingOptions: app.querySelector("[data-crossing-options]"),
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
    greenSeconds: Number(data.get("greenSeconds")),
    redSeconds: Number(data.get("redSeconds")),
    cars: state.cars,
  };
}

function phaseDuration(phase = state.phase) {
  const values = formValues();
  return phase === "green" ? values.greenSeconds : values.redSeconds;
}

function updateCounter() {
  elements.carCount.textContent = state.cars;
  elements.addCar.disabled = state.phase !== "green" || state.saving;
  elements.removeCar.disabled = state.phase !== "green" || state.cars === 0 || state.saving;
}

function updateTimer() {
  elements.timer.textContent = formatTimer(state.remaining);
  elements.toggleTimer.textContent = state.running ? "Pausar" : "Iniciar";
  elements.phaseDot.dataset.phase = state.phase;
  elements.saveCycle.disabled = state.phase !== "green" || state.saving;
  elements.saveCycle.textContent = state.saving ? "Guardando…" : "Guardar ciclo";
  elements.form.querySelectorAll("input, select").forEach((control) => {
    control.disabled = state.running || state.saving;
  });
}

function updatePhase() {
  elements.phaseButtons.forEach((button) => {
    const active = button.dataset.phase === state.phase;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.documentElement.dataset.phase = state.phase;
  updateCounter();
  updateTimer();
}

function stopTimer() {
  window.clearInterval(state.timerId);
  state.timerId = null;
  state.running = false;
  if (state.endAt) state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  state.endAt = 0;
  updateTimer();
}

function setPhase(phase, { keepRunning = false } = {}) {
  const wasRunning = keepRunning && state.running;
  stopTimer();
  state.phase = phase;
  state.remaining = phaseDuration(phase);

  if (phase === "green") {
    state.cars = 0;
    state.greenStartedAt = new Date();
  } else {
    state.greenStartedAt = null;
  }

  updatePhase();
  if (wasRunning) startTimer();
}

function resetCycle() {
  stopTimer();
  state.remaining = phaseDuration();
  if (state.phase === "green") {
    state.cars = 0;
    state.greenStartedAt = null;
  }
  updatePhase();
  vibrate([8, 30, 8]);
}

async function finishPhase() {
  stopTimer();
  if (state.phase === "green") {
    const saved = await saveCycle("automatico");
    if (!saved) return;
    state.running = true;
    setPhase("red", { keepRunning: true });
  } else {
    state.running = true;
    setPhase("green", { keepRunning: true });
  }
}

function tick() {
  state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  updateTimer();
  if (state.remaining === 0) finishPhase();
}

function startTimer() {
  const values = formValues();
  const error = validateCycle(values);
  if (error) {
    notify(error, "error");
    return;
  }

  if (state.phase === "green" && !state.greenStartedAt) state.greenStartedAt = new Date();
  state.endAt = Date.now() + state.remaining * 1000;
  state.running = true;
  state.timerId = window.setInterval(tick, 250);
  updateTimer();
}

function toggleTimer() {
  if (state.saving) return;
  if (state.running) stopTimer();
  else startTimer();
}

async function saveCycle(closeType) {
  if (!state.user || state.saving) return false;

  const values = formValues();
  const error = validateCycle(values);
  if (error) {
    notify(error, "error");
    return false;
  }

  state.saving = true;
  updatePhase();

  const endedAt = new Date();
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
      cierre: closeType,
      inicioVerde: Timestamp.fromDate(startedAt),
      finVerde: Timestamp.fromDate(endedAt),
      createdAt: serverTimestamp(),
    });

    notify("Ciclo guardado", "success");
    vibrate([12, 40, 18]);
    await loadRecords({ quiet: true });
    return true;
  } catch (error) {
    console.error(error);
    if (error.code === "permission-denied") {
      notify("Esta cuenta no tiene acceso.", "error");
      await signOut(auth);
    } else {
      notify("No se pudo guardar. Revisa la conexión.", "error");
    }
    return false;
  } finally {
    state.saving = false;
    updatePhase();
  }
}

async function saveNow() {
  if (state.phase !== "green") return;
  stopTimer();
  const saved = await saveCycle("manual");
  if (saved) {
    state.running = true;
    setPhase("red", { keepRunning: true });
  }
}

function selectPhase(phase) {
  if (phase === state.phase || state.saving) return;
  if (phase === "red" && state.phase === "green" && state.cars > 0) {
    notify("Guarda el ciclo antes de pasar a rojo.", "error");
    return;
  }
  setPhase(phase);
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

function renderCrossingChoices() {
  const crossings = [...new Set(state.records.map((record) => record.cruce).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  elements.crossingOptions.innerHTML = crossings.map((crossing) => `<option value="${escapeHtml(crossing)}"></option>`).join("");
  elements.crossingFilter.innerHTML = `<option value="">Todos</option>${crossings.map((crossing) => `<option value="${escapeHtml(crossing)}">${escapeHtml(crossing)}</option>`).join("")}`;
  elements.crossingFilter.value = crossings.includes(state.crossingFilter) ? state.crossingFilter : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

elements.login.addEventListener("click", async () => {
  elements.login.disabled = true;
  elements.loginStatus.textContent = "Abriendo Google…";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error de autenticación", error);
    if (error.code !== "auth/popup-closed-by-user") {
      elements.loginStatus.textContent = "No se pudo iniciar sesión.";
    } else {
      elements.loginStatus.textContent = "";
    }
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
elements.saveCycle.addEventListener("click", saveNow);
elements.navButtons.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.nav)));
elements.refresh.addEventListener("click", () => loadRecords());

elements.form.addEventListener("input", (event) => {
  if (state.running || !["greenSeconds", "redSeconds"].includes(event.target.name)) return;
  if ((event.target.name === "greenSeconds" && state.phase === "green") || (event.target.name === "redSeconds" && state.phase === "red")) {
    state.remaining = phaseDuration();
    updateTimer();
  }
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
    stopTimer();
    elements.loginScreen.hidden = false;
    elements.appShell.hidden = true;
  }
});

updatePhase();
