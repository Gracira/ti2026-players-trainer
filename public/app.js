const DATA_URL = "./data/players.json";

const state = {
  people: [],
  deck: [],
  index: 0,
  revealed: false,
  known: new Set(),
  learning: new Set()
};

const $ = (id) => document.getElementById(id);

const controls = {
  search: $("searchInput"),
  team: $("teamFilter"),
  role: $("roleFilter"),
  region: $("regionFilter"),
  shuffle: $("shuffleButton"),
  reset: $("resetButton"),
  card: $("cardButton"),
  reveal: $("revealButton"),
  prev: $("prevButton"),
  next: $("nextButton"),
  known: $("knownButton"),
  learning: $("learningButton")
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
  return true;
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

function currentPerson() {
  return state.deck[state.index] || null;
}

function resetReveal() {
  state.revealed = false;
}

function applyFilters() {
  state.deck = state.people.filter(passesFilters);
  state.index = Math.min(state.index, Math.max(state.deck.length - 1, 0));
  resetReveal();
  render();
}

function shuffleDeck() {
  for (let i = state.deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
  }
  state.index = 0;
  resetReveal();
  render();
}

function go(delta) {
  if (!state.deck.length) return;
  state.index = (state.index + delta + state.deck.length) % state.deck.length;
  resetReveal();
  render();
}

function reveal() {
  state.revealed = true;
  render();
}

function mark(setName) {
  const person = currentPerson();
  if (!person) return;
  if (setName === "known") {
    state.known.add(person.uid);
    state.learning.delete(person.uid);
  } else {
    state.learning.add(person.uid);
    state.known.delete(person.uid);
  }
  go(1);
}

function resetProgress() {
  state.known.clear();
  state.learning.clear();
  resetReveal();
  render();
}

function imageUrl(person) {
  return person.image?.localUrl || person.image?.url || "";
}

function setPortrait(person) {
  const portrait = $("portrait");
  portrait.replaceChildren();
  const url = imageUrl(person);
  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = state.revealed ? `Фото ${person.nickname}` : "Фото игрока";
    portrait.appendChild(image);
    portrait.className = "flashcard__portrait";
  } else {
    const missing = document.createElement("span");
    missing.textContent = "Нет фото";
    portrait.appendChild(missing);
    portrait.className = "flashcard__portrait flashcard__portrait--missing";
  }
}

function infoRow(label, value) {
  if (!value) return null;
  const row = document.createElement("div");
  row.className = "info-row";
  const key = document.createElement("span");
  key.textContent = label;
  const val = document.createElement("strong");
  val.textContent = value;
  row.append(key, val);
  return row;
}

function renderInfo(person) {
  $("teamName").textContent = person.team || "";
  $("roleName").textContent = person.roleLabel || "";
  $("profileLink").href = person.profileUrl || "#";

  const rows = $("infoRows");
  rows.replaceChildren();

  if (!state.revealed) {
    $("infoTitle").textContent = "Сначала угадай ник";
    $("infoSummary").textContent = `${person.team} · ${person.roleLabel} · ${person.region}`;
    rows.append(
      infoRow("Команда", person.team),
      infoRow("Роль", person.roleLabel),
      infoRow("Регион", person.region)
    );
    return;
  }

  $("infoTitle").textContent = person.nickname;
  $("infoSummary").textContent = person.romanizedName || person.name || person.profileTitle || "";

  const detailRows = [
    infoRow("Name", person.name),
    infoRow("Romanized", person.romanizedName),
    infoRow("Возраст", ageFromBirthDate(person.birthDate)),
    infoRow("Родился", displayDate(person.birthDate)),
    infoRow("Страна", person.country),
    infoRow("Команда", person.team),
    infoRow("Роль", person.roleLabel),
    infoRow("Регион", person.region),
    infoRow("Статус", person.status),
    infoRow("Aliases", person.aliases),
    infoRow("Проф. роли", person.profileRoles)
  ].filter(Boolean);

  rows.append(...detailRows);
}

function render() {
  const person = currentPerson();
  const hasCards = Boolean(person);
  $("trainer").hidden = !hasCards;
  document.querySelector(".trainer-actions").hidden = !hasCards;
  $("emptyState").hidden = hasCards;

  $("visibleCount").textContent = `${state.deck.length} карточек после фильтров`;
  $("positionCount").textContent = hasCards ? `${state.index + 1}/${state.deck.length}` : "0/0";
  $("knownCount").textContent = state.known.size;
  $("learningCount").textContent = state.learning.size;

  if (!person) return;

  $("flashcard").className = `flashcard ${state.revealed ? "is-revealed" : "is-hidden"}`;
  $("answerNick").textContent = state.revealed ? person.nickname : "?";
  $("answerSub").textContent = state.revealed ? `${person.team} · ${person.roleLabel}` : `${person.team} · ${person.roleLabel}`;
  document.querySelector(".answer-panel__hint").textContent = state.revealed ? "Ответ открыт" : "Нажми, чтобы открыть ник";
  controls.reveal.textContent = state.revealed ? "Скрыть ник" : "Показать ник";

  setPortrait(person);
  renderInfo(person);
}

function bindControls() {
  for (const control of [controls.search, controls.team, controls.role, controls.region]) {
    control.addEventListener("input", applyFilters);
  }
  controls.shuffle.addEventListener("click", shuffleDeck);
  controls.reset.addEventListener("click", resetProgress);
  controls.card.addEventListener("click", reveal);
  controls.reveal.addEventListener("click", () => {
    state.revealed = !state.revealed;
    render();
  });
  controls.prev.addEventListener("click", () => go(-1));
  controls.next.addEventListener("click", () => go(1));
  controls.known.addEventListener("click", () => mark("known"));
  controls.learning.addEventListener("click", () => mark("learning"));
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") go(1);
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === " " || event.key === "Enter") {
      if (document.activeElement?.tagName === "INPUT") return;
      event.preventDefault();
      state.revealed = !state.revealed;
      render();
    }
  });
}

async function init() {
  bindControls();
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${DATA_URL}`);
  const data = await response.json();
  state.people = data.people || [];
  state.deck = [...state.people];

  fillSelect(controls.team, uniqueSorted(state.people, (person) => person.team), "Все команды");
  fillSelect(controls.role, uniqueSorted(state.people, (person) => person.roleLabel), "Все роли");
  fillSelect(controls.region, uniqueSorted(state.people, (person) => person.region), "Все регионы");

  if (data.metadata?.generatedAt) {
    const generated = new Date(data.metadata.generatedAt);
    $("dataUpdated").textContent = Number.isNaN(generated.getTime())
      ? ""
      : `Данные обновлены: ${generated.toLocaleString("ru-RU")}`;
  }

  render();
}

init().catch((error) => {
  $("trainer").hidden = true;
  document.querySelector(".trainer-actions").hidden = true;
  $("emptyState").hidden = false;
  $("emptyState").textContent = "Не удалось загрузить данные.";
  console.error(error);
});
