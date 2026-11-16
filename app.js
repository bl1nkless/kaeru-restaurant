"use strict";

const pages = new Map(
  [...document.querySelectorAll("[data-page]")].map((page) => [page.dataset.page, page])
);
const rsvpRoutes = new Set(["registration", "confirmation", "koi", "invitation", "thanks"]);
const rsvpForm = document.querySelector("#rsvp-form");
const bookingForm = document.querySelector("#booking-form");
const checkoutForm = document.querySelector("#checkout-form");
const nav = document.querySelector("#site-nav");
const navToggle = document.querySelector(".nav-toggle");
const storageKey = "kaeru-session";

const koiGifts = {
  "1": {
    title: "Золотий ковток",
    desc: "Авторський welcome-коктейль або безалкогольна альтернатива",
  },
  "2": {
    title: "Сет Омакасе",
    desc: "Дегустаційний дует нігірі з диким тунцем та лососем",
  },
  "3": {
    title: "Мочі Сакура",
    desc: "Японський десерт ручної роботи з вишнею та кремом матча",
  },
};

let state = {};
try {
  state = JSON.parse(sessionStorage.getItem(storageKey)) ?? {};
} catch {
  state = {};
}

function saveState() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Keep state in memory if sessionStorage is restricted
  }
}

function setNavOpen(open) {
  nav.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Закрити навігацію" : "Відкрити навігацію");
}

function syncInvitationTicket() {
  const guestName = state.rsvp?.name?.trim() || "Ім’я гостя";
  const fishId = state.rsvp?.fish || "1";
  const gift = koiGifts[fishId] || koiGifts["1"];

  document.querySelector("#guest-name").textContent = guestName;
  document.querySelector("#ticket-gift-title").innerHTML = `<span aria-hidden="true">✧</span> ${gift.title}`;
  document.querySelector("#ticket-gift-desc").textContent = gift.desc;
}

function showPage(focusHeading = false) {
  const requested = location.hash.slice(1) || "about";
  const story = requested === "about-story" ? document.querySelector("#about-story") : null;
  let route = story ? "about" : requested;
  if (!pages.has(route)) route = "about";

  if (route === "invitation") {
    syncInvitationTicket();
  }
  if (route === "booking") {
    syncBookingTime();
    renderFloor();
    renderBookingResult();
  }

  for (const [name, page] of pages) {
    page.hidden = name !== route;
  }

  const navGroup = rsvpRoutes.has(route) ? "registration" : route;
  for (const link of nav.querySelectorAll("a")) {
    if (link.dataset.nav === navGroup) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  document.body.dataset.view = route;
  const heading = pages.get(route).querySelector("h1");
  const titleText = heading ? heading.innerText.replace(/\s+/g, " ").trim() : "Преміальний японський гастробар";
  document.title = "KAERU — " + titleText;

  setNavOpen(false);
  syncCountdown(route === "opening");

  if (story) {
    story.scrollIntoView({ behavior: "smooth" });
    if (focusHeading) story.querySelector("h2")?.focus({ preventScroll: true });
  } else if (focusHeading) {
    window.scrollTo({ top: 0, behavior: "instant" });
    heading?.focus({ preventScroll: true });
  }
}

function goTo(route) {
  if (location.hash === "#" + route) showPage(true);
  else location.hash = route;
}

navToggle.addEventListener("click", () => {
  setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
});

nav.addEventListener("click", (event) => {
  if (event.target.closest("a") && navToggle.offsetWidth) {
    setNavOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
    setNavOpen(false);
    navToggle.focus();
  }
});

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  pages.get(document.body.dataset.view)?.querySelector("h1")?.focus();
});

window.addEventListener("hashchange", () => showPage(true));

/* =========================================================
   FORM VALIDATION & RSVP FLOW
   ========================================================= */
for (const form of [rsvpForm, bookingForm, checkoutForm]) {
  for (const name of ["name", "phone"]) {
    const field = form.elements.namedItem(name);
    field?.addEventListener("input", () => field.setCustomValidity(""));
  }
}

function contactIsValid(form) {
  const name = form.elements.namedItem("name");
  const phone = form.elements.namedItem("phone");
  const digits = phone.value.replace(/[\s().-]/g, "");
  name.setCustomValidity(name.value.trim() ? "" : "Введіть своє ім’я.");
  phone.setCustomValidity(/^\+?[0-9]{7,15}$/.test(digits) ? "" : "Введіть дійсний номер телефону.");
  return form.reportValidity();
}

if (state.rsvp) {
  if (state.rsvp.name) rsvpForm.elements.namedItem("name").value = state.rsvp.name;
  if (state.rsvp.phone) rsvpForm.elements.namedItem("phone").value = state.rsvp.phone;
  if (state.rsvp.attending) rsvpForm.elements.namedItem("attending").value = state.rsvp.attending;
}

rsvpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(rsvpForm);
  const name = String(fields.get("name") || "").trim() || "Ім’я гостя";
  const phone = String(fields.get("phone") || "").trim();
  const attending = String(fields.get("attending") || "yes");
  const fish = state.rsvp?.fish || "1";

  state.rsvp = { name, phone, attending, fish };
  saveState();
  goTo(attending === "yes" ? "confirmation" : "thanks");
});

for (const choice of document.querySelectorAll(".koi-choice")) {
  choice.addEventListener("click", () => {
    state.rsvp = {
      name: state.rsvp?.name || "Ім’я гостя",
      phone: state.rsvp?.phone || "",
      attending: "yes",
      fish: choice.dataset.fish,
    };
    saveState();
    syncInvitationTicket();
    goTo("invitation");
  });
}

/* =========================================================
   DOWNLOADABLE GOLDEN INVITATION TICKET (PNG CANVAS)
   ========================================================= */
const saveInvitation = document.querySelector("#save-invitation");
const qr = document.querySelector("#invitation-qr");

saveInvitation.addEventListener("click", async () => {
  const status = document.querySelector("#download-status");
  saveInvitation.disabled = true;
  status.textContent = "";
  try {
    await Promise.all([document.fonts.ready, qr.decode()]);
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 760;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");

    const paper = context.createLinearGradient(0, 0, 1500, 760);
    paper.addColorStop(0, "#fbf0db");
    paper.addColorStop(0.55, "#edd5ac");
    paper.addColorStop(1, "#e0c08a");
    context.fillStyle = paper;
    context.fillRect(0, 0, 1500, 760);

    context.strokeStyle = "#a87945";
    context.lineWidth = 4;
    context.strokeRect(14, 14, 1472, 732);
    context.lineWidth = 1.5;
    context.strokeRect(30, 30, 1440, 700);
    context.beginPath();
    context.moveTo(1000, 75);
    context.lineTo(1000, 685);
    context.moveTo(76, 343);
    context.lineTo(946, 343);
    context.stroke();

    const draw = (value, font, x, y, width = 870) => {
      context.font = font;
      context.fillText(value, x, y, width);
    };

    const guestName = state.rsvp?.name?.trim() || "Ім’я гостя";
    const gift = koiGifts[state.rsvp?.fish || "1"] || koiGifts["1"];

    context.fillStyle = "#2b0d10";
    draw("K A E R U", '600 64px "Cormorant Garamond", serif', 76, 130);
    draw("R E S T A U R A N T", '600 18px "Mulish", sans-serif', 80, 164);
    draw("ШАНОВНИЙ ГОСТЮ", '700 22px "Mulish", sans-serif', 76, 234);
    draw(guestName, 'italic 400 72px "Playfair Display", serif', 76, 314);

    const dateVal = document.querySelector("#ticket-date")?.textContent || "ДД.ММ.РРРР";
    const timeVal = document.querySelector("#ticket-time")?.textContent || "ГГ:ХХ";
    draw("ДАТА ВІДКРИТТЯ", '700 21px "Mulish", sans-serif', 76, 390, 270);
    draw(dateVal, '600 46px "Cormorant Garamond", serif', 76, 444, 270);
    draw("ЧАС", '700 21px "Mulish", sans-serif', 540, 390, 270);
    draw(timeVal, '600 46px "Cormorant Garamond", serif', 540, 444, 270);

    context.fillStyle = "#471116";
    context.fillRect(76, 480, 320, 44);
    context.fillStyle = "#f8e8c8";
    draw("ВАШ ПОДАРУНОК", '700 20px "Mulish", sans-serif', 114, 509);
    context.fillStyle = "#2b0d10";
    draw("✧ " + gift.title, '700 50px "Cormorant Garamond", serif', 76, 586);
    draw(gift.desc, '400 24px "Mulish", sans-serif', 76, 636, 860);

    context.fillStyle = "#ffffff";
    context.fillRect(1094, 190, 296, 296);
    context.drawImage(qr, 1110, 206, 264, 264);
    context.fillStyle = "#2b0d10";
    context.textAlign = "center";
    draw("QR-КОД ДЛЯ ВХОДУ", '700 24px "Mulish", sans-serif', 1242, 530);
    draw("ДЕМОНСТРАЦІЙНИЙ ЗРАЗОК", '500 19px "Mulish", sans-serif', 1242, 562);

    const file = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!file) throw new Error("PNG unavailable");
    const url = URL.createObjectURL(file);
    const download = document.createElement("a");
    download.href = url;
    download.download = "KAERU-запрошення.png";
    document.body.append(download);
    download.click();
    download.remove();
    status.textContent = "Запрошення успішно збережено (KAERU-запрошення.png).";
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch {
    status.textContent = "Не вдалося зберегти запрошення. Спробуйте ще раз.";
  } finally {
    saveInvitation.disabled = false;
  }
});

/* =========================================================
   MENU & SHOPPING CART
   ========================================================= */
const categories = [
  { id: "all", label: "Усе меню" },
  { id: "sushi", label: "Суші / роли" },
  { id: "sashimi", label: "Сашимі" },
  { id: "hot", label: "Гарячі страви" },
  { id: "soups", label: "Супи" },
  { id: "desserts", label: "Десерти" },
  { id: "drinks", label: "Напої" },
];

const dishes = [
  {
    id: "roll",
    category: "sushi",
    name: "Рол KAERU",
    description: "Лосось, авокадо, ніжний сир, ікра тобіко",
    price: 420,
    image: "assets/dish-roll.jpg",
  },
  {
    id: "nigiri",
    category: "sushi",
    name: "Нігірі тунець",
    description: "Дикий тунець акамі, теплий рис, витриманий соєвий соус",
    price: 240,
    image: "assets/dish-nigiri.jpg",
  },
  {
    id: "ramen",
    category: "soups",
    name: "Рамен тонкоцу",
    description: "Свинний бульйон, крафтова локшина, чашу, яйце аджітама",
    price: 380,
    image: "assets/dish-ramen.jpg",
  },
  {
    id: "mochi",
    category: "desserts",
    name: "Мочі сакура",
    description: "Японський десерт з вишнею, листом сакури та кремом матча",
    price: 190,
    image: "assets/dish-mochi.jpg",
  },
  {
    id: "sashimi",
    category: "sashimi",
    name: "Сашимі з тунця",
    description: "Свіжий тунець блюфін, дайкон, лист шісо та натуральний васабі",
    price: 450,
    image: "assets/sashimi.jpg",
  },
  {
    id: "tataki",
    category: "hot",
    name: "Татакі з тунця",
    description: "Обсмажений тунець у кунжуті, соус понзу та мікрогрін шісо",
    price: 460,
    image: "assets/dish-tataki.jpg",
  },
  {
    id: "yuzu",
    category: "drinks",
    name: "Юдзу-тонік",
    description: "Натуральний сік японського юдзу, крафтовий тонік, льодяна глибока свіжість",
    price: 180,
    image: "assets/dish-yuzu.jpg",
  },
  {
    id: "unagi-roll",
    category: "sushi",
    name: "Рол Золотий Дракон",
    description: "Вугор унагі, креветка темпура, авокадо, соус унагі та кунжут",
    price: 490,
    image: "assets/dish-roll.jpg",
  },
];

const filtersContainer = document.querySelector("#menu-filters");
const menuGrid = document.querySelector("#dish-grid");
const cartDialog = document.querySelector("#cart-dialog");
const cartToggle = document.querySelector("#cart-toggle");
const cartItems = document.querySelector("#cart-items");
const cartStatus = document.querySelector("#cart-status");
const money = (price) => price.toLocaleString("uk-UA") + " ₴";

const cart = new Map();
for (const dish of dishes) {
  const quantity = state.cart?.[dish.id];
  if (Number.isInteger(quantity) && quantity > 0) {
    cart.set(dish.id, Math.min(quantity, 99));
  }
}

function changeCart(id, amount) {
  const quantity = Math.min(99, (cart.get(id) ?? 0) + amount);
  if (quantity > 0) cart.set(id, quantity);
  else cart.delete(id);
  state.cart = Object.fromEntries(cart);
  saveState();
  renderCart();
  updateDishButtons();
  return quantity;
}

function updateDishButtons() {
  for (const btn of menuGrid.querySelectorAll(".dish-add-btn")) {
    const id = btn.dataset.dishId;
    const qty = cart.get(id) || 0;
    btn.textContent = qty > 0 ? `У кошику (${qty}) +` : "До кошика +";
  }
}

function renderCart() {
  let total = 0;
  let count = 0;
  cartItems.replaceChildren();

  for (const dish of dishes) {
    const quantity = cart.get(dish.id);
    if (!quantity) continue;
    count += quantity;
    total += dish.price * quantity;

    const item = document.createElement("li");
    const title = document.createElement("strong");
    const price = document.createElement("span");
    const controls = document.createElement("div");
    const units = document.createElement("span");

    item.className = "cart-item";
    controls.className = "cart-quantity";
    title.textContent = dish.name;
    price.textContent = money(dish.price * quantity);
    units.textContent = String(quantity);

    for (const [value, label, delta] of [
      ["−", "Зменшити кількість", -1],
      ["+", "Збільшити кількість", 1],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value;
      button.setAttribute("aria-label", `${label} — ${dish.name}`);
      button.disabled = delta > 0 && quantity === 99;
      button.addEventListener("click", () => changeCart(dish.id, delta));
      controls.append(button);
      if (delta < 0) controls.append(units);
    }

    item.append(title, price, controls);
    cartItems.append(item);
  }

  document.querySelector("#cart-count").textContent = String(count);
  document.querySelector("#cart-total").textContent = money(total);
  checkoutForm.hidden = count === 0;
  cartStatus.textContent = count
    ? ""
    : state.lastOrder
    ? `Замовлення ${state.lastOrder.id} на суму ${money(state.lastOrder.total)} успішно оформлено.`
    : "У кошику поки порожньо. Оберіть страви у меню.";
}

function createDishCard(dish) {
  const card = document.createElement("article");
  card.className = "dish-card";

  const media = document.createElement("div");
  media.className = "dish-card-media";
  const img = document.createElement("img");
  img.src = dish.image;
  img.alt = dish.name;
  img.loading = "lazy";
  img.width = 504;
  img.height = 504;
  media.append(img);

  const body = document.createElement("div");
  body.className = "dish-card-body";

  const title = document.createElement("h2");
  title.className = "dish-card-title";
  title.textContent = dish.name;

  const desc = document.createElement("p");
  desc.className = "dish-card-desc";
  desc.textContent = dish.description;

  const footer = document.createElement("div");
  footer.className = "dish-card-footer";

  const price = document.createElement("span");
  price.className = "dish-card-price";
  price.textContent = money(dish.price);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dish-add-btn";
  addBtn.dataset.dishId = dish.id;
  const qty = cart.get(dish.id) || 0;
  addBtn.textContent = qty > 0 ? `У кошику (${qty}) +` : "До кошика +";
  addBtn.addEventListener("click", () => {
    const nextQty = changeCart(dish.id, 1);
    document.querySelector("#menu-status").textContent = `${dish.name} додано до кошика (${nextQty})`;
  });

  footer.append(price, addBtn);
  body.append(title, desc, footer);
  card.append(media, body);
  return card;
}

function filterMenu(categoryId) {
  for (const button of filtersContainer.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.category === categoryId));
  }
  const visible = categoryId === "all" ? dishes : dishes.filter((d) => d.category === categoryId);
  menuGrid.replaceChildren(...visible.map(createDishCard));
}

for (const category of categories) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-filter-btn";
  button.dataset.category = category.id;
  button.innerHTML = `<span>${category.label}</span><span class="filter-chevron" aria-hidden="true">∨</span>`;
  button.addEventListener("click", () => filterMenu(category.id));
  filtersContainer.append(button);
}

filterMenu("all");
renderCart();

cartToggle.addEventListener("click", () => {
  renderCart();
  setNavOpen(false);
  cartDialog.showModal();
});

document.querySelector("#cart-to-menu").addEventListener("click", () => {
  cartDialog.close();
});

checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (cart.size === 0 || !contactIsValid(checkoutForm)) return;
  const total = dishes.reduce((sum, dish) => sum + dish.price * (cart.get(dish.id) ?? 0), 0);
  state.lastOrder = {
    id: "K-" + Date.now().toString(36).slice(-5).toUpperCase(),
    total,
  };
  cart.clear();
  delete state.cart;
  saveState();
  checkoutForm.reset();
  renderCart();
  updateDishButtons();
});

/* =========================================================
   BOOKING PAGE (SINGLE-SCREEN LUXURY FORM + TABLE SELECTOR)
   ========================================================= */
const bookingDate = bookingForm.elements.namedItem("date");
const bookingTime = bookingForm.elements.namedItem("time");
const bookingGuests = bookingForm.elements.namedItem("guests");
const tableList = document.querySelector("#floor-tables");
const floorStatus = document.querySelector("#floor-status");
const tables = [2, 2, 4, 4, 6, 8];
let selectedTable = 3;

const kyivClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

for (let hour = 12; hour <= 22; hour += 1) {
  for (const minute of hour === 22 ? ["00"] : ["00", "30"]) {
    const time = `${hour}:${minute}`;
    bookingTime.add(new Option(time, time));
  }
}

for (let guests = 1; guests <= 8; guests += 1) {
  const suffix = guests === 1 ? "гість" : guests <= 4 ? "гості" : "гостей";
  bookingGuests.add(new Option(`${guests} ${suffix}`, String(guests)));
}

function syncBookingTime() {
  const [today] = kyivClock.format(new Date()).split(" ");
  bookingDate.min = today;
  if (!bookingDate.value) bookingDate.value = today;
  if (!bookingTime.value) bookingTime.value = "19:00";
  if (!bookingGuests.value) bookingGuests.value = "2";
}

function renderFloor() {
  const neededGuests = Number(bookingGuests.value || 2);
  for (const button of tableList.children) {
    const id = Number(button.dataset.table);
    const capacity = tables[id - 1];
    const fits = capacity >= neededGuests;
    button.disabled = !fits;
    const active = id === selectedTable && fits;
    button.setAttribute("aria-pressed", String(active));
  }

  if (selectedTable && tables[selectedTable - 1] < neededGuests) {
    const firstFit = tables.findIndex((cap) => cap >= neededGuests);
    selectedTable = firstFit >= 0 ? firstFit + 1 : null;
  }

  floorStatus.textContent = selectedTable
    ? `Обрано столик №${String(selectedTable).padStart(2, "0")} (до ${tables[selectedTable - 1]} гостей)`
    : "Автоматичний підбір столика за кількістю гостей";
}

tables.forEach((seats, index) => {
  const id = index + 1;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "floor-table";
  button.dataset.table = String(id);
  button.innerHTML = `<strong>№${String(id).padStart(2, "0")}</strong><small>${seats} місць</small>`;
  button.addEventListener("click", () => {
    selectedTable = id;
    renderFloor();
  });
  tableList.append(button);
});

for (const field of [bookingDate, bookingTime, bookingGuests]) {
  field.addEventListener("change", () => {
    renderFloor();
  });
}

function renderBookingResult() {
  const result = document.querySelector("#booking-result");
  result.hidden = !state.booking;
  if (state.booking) {
    const { name, date, time, guests, table } = state.booking;
    result.textContent = `Дякуємо, ${name}! Ваш стіл №${String(table || 3).padStart(2, "0")} заброньовано на ${date} о ${time} (гостей: ${guests}).`;
  }
}

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  syncBookingTime();
  if (!contactIsValid(bookingForm)) return;

  state.booking = {
    name: bookingForm.elements.namedItem("name").value.trim(),
    phone: bookingForm.elements.namedItem("phone").value.trim(),
    date: bookingDate.value,
    time: bookingTime.value,
    guests: bookingGuests.value,
    table: selectedTable || 3,
  };
  saveState();
  renderBookingResult();
});

/* =========================================================
   OPENING COUNTDOWN TIMER
   ========================================================= */
const openingSection = pages.get("opening");
const openingTarget = Date.parse(openingSection.dataset.openingAt);
const digits = [...openingSection.querySelectorAll("[data-time]")];
let countdownId;

function updateCountdown() {
  let remaining = Math.floor((openingTarget - Date.now()) / 1000);
  if (!(remaining > 0)) {
    // Fallback demo offset so mockup always shows live ticking countdown
    remaining = 12 * 86400 + 18 * 3600 + 53 * 60 + (60 - new Date().getSeconds());
  }

  const values = [
    Math.floor(remaining / 86400),
    Math.floor(remaining / 3600) % 24,
    Math.floor(remaining / 60) % 60,
    remaining % 60,
  ];
  digits.forEach((digit, index) => {
    digit.textContent = String(values[index]).padStart(2, "0");
  });
}

function syncCountdown(visible) {
  clearInterval(countdownId);
  if (visible) {
    updateCountdown();
    countdownId = window.setInterval(updateCountdown, 1000);
  }
}

syncBookingTime();
renderFloor();
showPage();
