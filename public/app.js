const DATA_URL = "./data/players.json";

const state = {
  people: [],
  visible: [],
  revealed: new Set(),
  order: []
};

const $ = (id) => document.getElementById(id);

const controls = {
  search: $("searchInput"),
  team: $("teamFilter"),
  role: $("roleFilter"),
  region: $("regionFilter"),
  reveal: $("revealFilter"),
  shuffle: $("shuffleButton"),
  hideAll: $("hideAllButton"),
  showAll: $("showAllButton")
};

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function option(value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}

function fillSelect(select, values, allLabel) {
  select.replaceChildren(option("all", allLabel));
  for (const value of values) {
    select.appendChild(option(value, value));
  }
}

function uniqueSorted(items, key) {
  return [...new Set(items.map(key).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function displayDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
}

function ageFromBirthDate(value) {
  if (!value) return "";
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age > 0 ? `${age}` : "";
}

function personSearchText(person) {
  return [
    person.nickname,
    person.name,
    person.romanizedName,
    person.country,
    person.team,
    person.roleLabel,
    person.region,
    person.profileTitle,
    ...(person.info || []).map((item) => item.value)
  ].join(" ");
}

function passesFilters(person) {
  const query = normalize(controls.search.value);
  if (query && !normalize(personSearchText(person)).includes(query)) return false;
  if (controls.team.value !== "all" && person.team !== controls.team.value) return false;
  if (controls.role.value !== "all" && person.roleLabel !== controls.role.value) return false;
  if (controls.region.value !== "all" && person.region !== controls.region.value) return false;
  if (controls.reveal.value === "hidden" && state.revealed.has(person.uid)) return false;
  if (controls.reveal.value === "revealed" && !state.revealed.has(person.uid)) return false;
  return true;
}

function detailRow(label, value) {
  if (!value) return null;
  const dl = document.createElement("dl");
  dl.className = "detail-row";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
  return dl;
}

function renderCard(person) {
  const revealed = state.revealed.has(person.uid);
  const article = document.createElement("article");
  article.className = `player-card ${revealed ? "is-revealed" : "is-hidden"}`;

  const button = document.createElement("button");
  button.className = "card-button";
  button.type = "button";
  button.setAttribute("aria-label", revealed ? `Скрыть ${person.nickname}` : "Открыть ник");
  button.addEventListener("click", () => {
    if (state.revealed.has(person.uid)) state.revealed.delete(person.uid);
    else state.revealed.add(person.uid);
    applyFilters();
  });

  const portrait = document.createElement("div");
  portrait.className = person.image?.url ? "portrait" : "portrait portrait--missing";

  if (person.image?.url) {
    const image = document.createElement("img");
    image.src = person.image.url;
    image.alt = revealed ? `Фото ${person.nickname}` : "Фото игрока";
    image.loading = "lazy";
    portrait.appendChild(image);
  } else {
    const missing = document.createElement("span");
    missing.textContent = "Нет фото";
    portrait.appendChild(missing);
  }

  const role = document.createElement("span");
  role.className = "role-badge";
  role.textContent = person.roleLabel || person.role || "Role";

  const region = document.createElement("span");
  region.className = "region-badge";
  region.textContent = person.region || "Invite";

  const mask = document.createElement("span");
  mask.className = "nick-mask";
  mask.textContent = person.nickname || "Unknown";

  portrait.append(role, region, mask);

  const body = document.createElement("div");
  body.className = "card-body";

  const team = document.createElement("p");
  team.className = "team-name";
  team.textContent = person.team;

  const realName = document.createElement("p");
  realName.className = "real-name";
  realName.textContent = revealed ? (person.romanizedName || person.name || person.profileTitle || "") : " ";

  const details = document.createElement("div");
  details.className = "details";

  const rows = [
    detailRow("Name", person.name),
    detailRow("Romanized", person.romanizedName),
    detailRow("Возраст", ageFromBirthDate(person.birthDate)),
    detailRow("Родился", displayDate(person.birthDate)),
    detailRow("Страна", person.country),
    detailRow("Команда", person.team),
    detailRow("Роль", person.roleLabel),
    detailRow("Статус", person.status),
    detailRow("Aliases", person.aliases),
    detailRow("Проф. роли", person.profileRoles)
  ].filter(Boolean);

  for (const row of rows) details.appendChild(row);

  for (const item of person.info || []) {
    if (!item.value || rows.some((row) => row.firstChild?.textContent === item.label)) continue;
    details.appendChild(detailRow(item.label, item.value));
  }

  const link = document.createElement("a");
  link.className = "detail-link";
  link.href = person.profileUrl;
  link.rel = "noreferrer";
  link.target = "_blank";
  link.textContent = "Профиль Liquipedia";
  details.appendChild(link);

  body.append(team, realName, details);
  button.append(portrait, body);
  article.appendChild(button);
  return article;
}

function updateStats() {
  $("totalCount").textContent = state.people.length;
  $("revealedCount").textContent = state.revealed.size;
  $("visibleCount").textContent = `Показано: ${state.visible.length}`;
}

function applyFilters() {
  const byId = new Map(state.people.map((person) => [person.uid, person]));
  state.visible = state.order.map((uid) => byId.get(uid)).filter(Boolean).filter(passesFilters);
  const cards = $("cards");
  cards.replaceChildren(...state.visible.map(renderCard));
  $("emptyState").hidden = state.visible.length !== 0;
  updateStats();
}

function shuffle() {
  for (let i = state.order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }
  applyFilters();
}

function bindControls() {
  for (const control of [controls.search, controls.team, controls.role, controls.region, controls.reveal]) {
    control.addEventListener("input", applyFilters);
  }
  controls.shuffle.addEventListener("click", shuffle);
  controls.hideAll.addEventListener("click", () => {
    state.revealed.clear();
    applyFilters();
  });
  controls.showAll.addEventListener("click", () => {
    state.revealed = new Set(state.people.map((person) => person.uid));
    applyFilters();
  });
}

async function init() {
  bindControls();
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${DATA_URL}`);
  const data = await response.json();
  state.people = data.people || [];
  state.order = state.people.map((person) => person.uid);

  fillSelect(controls.team, uniqueSorted(state.people, (person) => person.team), "Все команды");
  fillSelect(controls.role, uniqueSorted(state.people, (person) => person.roleLabel), "Все роли");
  fillSelect(controls.region, uniqueSorted(state.people, (person) => person.region), "Все регионы");

  if (data.metadata?.generatedAt) {
    const generated = new Date(data.metadata.generatedAt);
    $("dataUpdated").textContent = Number.isNaN(generated.getTime())
      ? ""
      : `Данные обновлены: ${generated.toLocaleString("ru-RU")}`;
  }

  applyFilters();
}

init().catch((error) => {
  $("cards").replaceChildren();
  $("emptyState").hidden = false;
  $("emptyState").textContent = "Не удалось загрузить данные.";
  console.error(error);
});
