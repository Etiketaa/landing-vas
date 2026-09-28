// ==================== MOBILE MENU ====================
const menuBtn = document.getElementById("menu-btn");
const navLinks = document.getElementById("nav-links");
const menuBtnIcon = menuBtn?.querySelector("i");

menuBtn?.addEventListener("click", () => {
  navLinks.classList.toggle("open");
  const isOpen = navLinks.classList.contains("open");
  menuBtnIcon.setAttribute("class", isOpen ? "ri-close-line" : "ri-menu-line");
});

navLinks?.addEventListener("click", () => {
  navLinks.classList.remove("open");
  menuBtnIcon?.setAttribute("class", "ri-menu-line");
});

// ==================== SCROLL ANIMATIONS ====================
const sr = ScrollReveal();

sr.reveal(".header__content p", { origin: "bottom", distance: "30px", duration: 800, delay: 200 });
sr.reveal(".header__content h1", { origin: "bottom", distance: "30px", duration: 800, delay: 400 });
sr.reveal(".header__content .btn", { origin: "bottom", distance: "30px", duration: 800, delay: 600 });
sr.reveal(".header__image", { origin: "right", distance: "50px", duration: 1000, delay: 300 });

sr.reveal(".destination__card", { origin: "bottom", distance: "40px", duration: 700, interval: 150 });
sr.reveal(".journey__card", { origin: "bottom", distance: "40px", duration: 700, interval: 150 });
sr.reveal(".banner__card", { origin: "bottom", distance: "40px", duration: 700, interval: 150 });

sr.reveal(".showcase__image", { origin: "left", distance: "50px", duration: 900 });
sr.reveal(".showcase__content", { origin: "right", distance: "50px", duration: 900 });

sr.reveal(".footer__col", { origin: "bottom", distance: "30px", duration: 600, interval: 100 });

// ==================== BOOKING MODAL ====================
const openBtn = document.getElementById("open-booking");
const openBtnNav = document.getElementById("open-booking-nav");
const openBtn2 = document.getElementById("open-booking-2");
const modal = document.getElementById("booking-modal");
const overlay = document.getElementById("booking-overlay");
const closeBtn = document.getElementById("booking-close");
const form = document.getElementById("booking-form");
const msg = document.getElementById("booking-msg");
const serviceSelect = document.getElementById("booking-service");
const dateInput = document.getElementById("booking-date");
const timeSelect = document.getElementById("booking-time");
const priceDisplay = document.getElementById("price-display");
const priceFinal = document.getElementById("price-final");
const priceBase = document.getElementById("price-base");
const priceRules = document.getElementById("price-rules");
const submitBtn = document.getElementById("booking-submit");

let services = [];
let currentPriceData = null;

function openModal() {
  modal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

openBtn?.addEventListener("click", openModal);
openBtnNav?.addEventListener("click", openModal);
openBtn2?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
overlay?.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (modal?.getAttribute("aria-hidden") === "false") closeModal();
    if (marketingPopup?.classList.contains("show")) closeMarketingPopup();
  }
});

// ==================== SERVICES LOADING ====================
async function loadServices() {
  try {
    const res = await fetch("/api/services");
    if (!res.ok) throw new Error("Error al cargar servicios");
    services = await res.json();

    serviceSelect.innerHTML = '<option value="">Selecciona un servicio</option>';
    services.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.name} - $${s.base_price.toLocaleString("es-AR")}`;
      serviceSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading services:", err);
    serviceSelect.innerHTML = '<option value="">Error al cargar servicios</option>';
  }
}

// ==================== SLOTS LOADING ====================
function getMinDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

dateInput.min = getMinDate();

async function loadAvailableSlots() {
  const serviceId = serviceSelect.value;
  const date = dateInput.value;

  if (!serviceId || !date) {
    timeSelect.innerHTML = '<option value="">Elegi fecha y servicio</option>';
    timeSelect.disabled = true;
    priceDisplay.style.display = "none";
    return;
  }

  timeSelect.innerHTML = '<option value="">Cargando horarios...</option>';
  timeSelect.disabled = true;

  try {
    const res = await fetch(`/api/available-slots?service_id=${serviceId}&date=${date}`);
    if (!res.ok) throw new Error("Error al cargar horarios");
    const data = await res.json();

    currentPriceData = data;

    timeSelect.innerHTML = '<option value="">Elegi un horario</option>';
    const availableSlots = data.slots.filter((s) => s.available);

    if (availableSlots.length === 0) {
      const motivo = data.schedule?.closed
        ? data.schedule.reason || "El centro está cerrado ese día"
        : "No hay horarios disponibles";
      timeSelect.innerHTML = `<option value="">${motivo}</option>`;
      timeSelect.disabled = true;
      priceDisplay.style.display = "none";
      return;
    }

    availableSlots.forEach((slot) => {
      const opt = document.createElement("option");
      opt.value = slot.time;
      opt.textContent = slot.time;
      timeSelect.appendChild(opt);
    });
    timeSelect.disabled = false;

    renderPriceForTime(data, timeSelect.value);
    priceDisplay.style.display = "block";
  } catch (err) {
    console.error("Error loading slots:", err);
    timeSelect.innerHTML = '<option value="">Error al cargar horarios</option>';
  }
}

// Cada horario puede tener su propio precio (reglas por franja horaria).
// Antes se mostraba siempre el cálculo hecho a las 10:00.
function renderPriceForTime(data, time) {
  const slot = data.slots.find((s) => s.time === time);
  const finalPrice = slot ? slot.final_price : data.final_price;
  const rules = slot ? slot.applied_rules : data.price_breakdown.applied_rules.map((r) => r.name);

  priceFinal.textContent = `$${finalPrice.toLocaleString("es-AR")}`;

  if (finalPrice !== data.base_price) {
    priceBase.textContent = `Precio base: $${data.base_price.toLocaleString("es-AR")}`;
    priceBase.style.display = "inline";
  } else {
    priceBase.style.display = "none";
  }

  if (rules && rules.length > 0) {
    priceRules.textContent = rules.join(", ");
    priceRules.style.display = "inline";
  } else {
    priceRules.style.display = "none";
  }
}

timeSelect?.addEventListener("change", () => {
  if (currentPriceData) renderPriceForTime(currentPriceData, timeSelect.value);
});

serviceSelect?.addEventListener("change", loadAvailableSlots);
dateInput?.addEventListener("change", loadAvailableSlots);

// ==================== BOOKING SUBMIT ====================
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("booking-name").value.trim();
  const contact = document.getElementById("booking-contact").value.trim();
  const service_id = serviceSelect.value;
  const date = dateInput.value;
  const time = timeSelect.value;
  const notes = document.getElementById("booking-notes").value.trim();

  if (!name || !contact || !service_id || !date || !time) {
    msg.textContent = "Completa todos los campos.";
    msg.style.color = "#e63946";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";
  msg.textContent = "";

  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact, service_id, date, time, notes }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Error");

    const whatsappLink = data.whatsapp?.client || '#';
    const bk = data.booking || {};

    // La seña es obligatoria: si hay que pagar, el turno todavía no está
    // confirmado y el mensaje tiene que decirlo con el importe, el vencimiento
    // y el link para pagar. Antes solo ofrecía mandar los datos por WhatsApp,
    // sin monto ni link, y el turno quedaba sin pagar para siempre.
    if (bk.deposit_required) {
      const mins = bk.deposit_deadline
        ? Math.max(0, Math.round((new Date(bk.deposit_deadline) - Date.now()) / 60000))
        : 10;
      const money = (n) => '$' + Number(n).toLocaleString('es-AR');

      msg.innerHTML = `
        <div style="text-align: center;">
          <p style="margin-bottom: 6px;">Turno reservado ✨</p>
          <p style="font-size: 13px; color: #666; margin-bottom: 14px;">
            ${bk.service} · ${bk.date} a las ${bk.time}
          </p>

          <div style="background: #fff5f5; border: 1px solid #f4c7c3; border-radius: 10px; padding: 14px; margin-bottom: 14px; text-align: left;">
            <p style="font-size: 13px; color: #8c2f2f; margin-bottom: 4px;">
              Falta pagar la seña para confirmar el turno
            </p>
            <p style="font-size: 22px; font-weight: 700; color: #8c2f2f; margin: 0 0 6px;">
              ${money(bk.deposit_amount)}
            </p>
            <p style="font-size: 12px; color: #a45050; margin: 0;">
              Vence en ${mins} ${mins === 1 ? 'minuto' : 'minutos'}. Pasado ese tiempo el horario se libera.
            </p>
          </div>

          ${data.payment_url ? `
            <a href="${data.payment_url}"
               style="display: inline-block; background: #b3543f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 10px;">
              Pagar seña y subir comprobante
            </a>
            <p style="font-size: 12px; color: #666; margin-bottom: 14px;">
              Te transfers por CBU o alias y subís la foto del comprobante
            </p>
          ` : `
            <p style="font-size: 12px; color: #666; margin-bottom: 14px;">
              Escribinos por WhatsApp para que te enviemos los datos de la transferencia
            </p>
          `}

          <br>
          <a href="${whatsappLink}" target="_blank" rel="noopener"
             style="display: inline-block; background: #25d366; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            <i class="ri-whatsapp-line"></i> Consultar por WhatsApp
          </a>
        </div>
      `;
    } else {
      msg.innerHTML = `
        <div style="text-align: center;">
          <p style="margin-bottom: 12px;">Turno reservado exitosamente ✨</p>
          <a href="${whatsappLink}" target="_blank" rel="noopener"
             style="display: inline-block; background: #25d366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 8px;">
            <i class="ri-whatsapp-line"></i> Confirmar por WhatsApp
          </a>
          <p style="font-size: 12px; color: #666;">Hacé click para enviar los datos del turno</p>
        </div>
      `;
    }
    msg.style.color = "#7f5539";

    form.reset();
    priceDisplay.style.display = "none";
    timeSelect.innerHTML = '<option value="">Elegi fecha y servicio</option>';
    timeSelect.disabled = true;
  } catch (err) {
    msg.style.color = "#e63946";
    msg.textContent = err.message || "Error al enviar. Intenta nuevamente.";
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar turno";
  }
});

// ==================== MARKETING POPUP ====================
const marketingPopup = document.getElementById("marketing-popup");
const marketingOverlay = document.getElementById("marketing-overlay");
const marketingClose = document.getElementById("marketing-close");
const marketingForm = document.getElementById("marketing-form");
const marketingSkip = document.getElementById("marketing-skip");

const MARKETING_KEY = "vas_marketing_dismissed";

function showMarketingPopup() {
  if (localStorage.getItem(MARKETING_KEY)) return;

  setTimeout(() => {
    marketingPopup?.classList.add("show");
    document.body.style.overflow = "hidden";
  }, 5000);
}

function closeMarketingPopup() {
  marketingPopup?.classList.remove("show");
  document.body.style.overflow = "";
  localStorage.setItem(MARKETING_KEY, "true");
}

marketingClose?.addEventListener("click", closeMarketingPopup);
marketingOverlay?.addEventListener("click", closeMarketingPopup);
marketingSkip?.addEventListener("click", closeMarketingPopup);

marketingForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("marketing-name").value.trim();
  const phone = document.getElementById("marketing-phone").value.trim();

  if (!name || !phone) return;

  try {
    const res = await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });

    if (res.ok) {
      const submitBtn = marketingForm.querySelector(".btn");
      submitBtn.textContent = "¡Gracias!";
      submitBtn.disabled = true;
      setTimeout(closeMarketingPopup, 2000);
    }
  } catch (err) {
    console.error("Error:", err);
    closeMarketingPopup();
  }
});

// ==================== INIT ====================
loadServices();
showMarketingPopup();
