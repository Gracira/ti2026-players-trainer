const DATA_URL = "./data/players.json";

const state = {
  people: [],
  deck: [],
  index: 0,
  view: "all",
  revealed: false,
  known: new Set(),
  learning: new Set()
};

const $ = (id) => document.getElementById(id);

const controls = {
  search: $("searchInput"),
  role: $("roleFilter"),
  region: $("regionFilter"),
  shuffle: $("shuffleButton"),
  reset: $("resetButton"),
  card: $("cardButton"),
  reveal: $("revealButton"),
  inlineReveal: $("inlineRevealButton"),
  prev: $("prevButton"),
  known: $("knownButton"),
  learning: $("learningButton")
};

const TEAM_LOGOS = {
  "1w Team": "https://liquipedia.net/commons/images/5/5c/1win_Team_2024_allmode.png",
  "Aurora Gaming": "https://liquipedia.net/commons/images/3/32/Aurora_Gaming_2025_full_allmode.png",
  "BetBoom Team": "https://liquipedia.net/commons/images/5/5b/BetBoom_Team_2024_allmode.png",
  "GamerLegion": "https://liquipedia.net/commons/images/6/69/GamerLegion_2023_lightmode.png",
  "HULIGANI": "https://liquipedia.net/commons/images/4/45/L1GA_TEAM_2026_lightmode.png",
  "LGD Gaming": "https://liquipedia.net/commons/images/2/2f/LGD_Gaming_Dec_2019_allmode.png",
  "Nigma Galaxy": "https://liquipedia.net/commons/images/e/e8/Nigma_Galaxy_full_lightmode.png",
  "OG": "https://liquipedia.net/commons/images/7/7b/OG_2026_allmode.png",
  "TEAM VISION": "https://liquipedia.net/commons/images/9/9d/PARIVISION_allmode.png",
  "Team Falcons": "https://liquipedia.net/commons/images/e/e9/Team_Falcons_2022_full_lightmode.png",
  "Team Liquid": "https://liquipedia.net/commons/images/f/f5/Team_Liquid_2024_full_lightmode.png",
  "Team Resilience": "https://liquipedia.net/commons/images/b/bf/Team_Resilience_%28DOTA2%29_full_lightmode.png",
  "Team Spirit": "https://liquipedia.net/commons/images/f/f2/Team_Spirit_2022_full_lightmode.png",
  "Team Yandex": "https://liquipedia.net/commons/images/9/9c/Team_Yandex_2026_lightmode.png",
  "Vici Gaming": "https://liquipedia.net/commons/images/2/24/VICI_Gaming_full_allmode.png",
  "Xtreme Gaming": "https://liquipedia.net/commons/images/9/97/Xtreme_Gaming_%28China%29_full_allmode.png"
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

function roleWithNumber(person) {
  if (!person?.roleLabel) return "";
  return /^\d+$/.test(person.role || "") ? `${person.roleLabel} (${person.role})` : person.roleLabel;
}

function profileFullName(person) {
  const given = person.info?.find((item) => item.label === "Given name")?.value || "";
  const family = person.info?.find((item) => item.label === "Family name")?.value || "";
  return person.romanizedName || [given, family].filter(Boolean).join(" ") || person.name || person.profileTitle || "";
}

function teamLogoUrl(team) {
  return TEAM_LOGOS[team] || "";
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function personSearchText(person) {
  return [
    person.nickname,
    profileFullName(person),
    person.romanizedName,
    person.country,
    person.team,
    person.roleLabel,
    roleWithNumber(person),
    person.region,
    person.aliases,
    person.earnings,
    ...(person.signatureHeroes || []).map((hero) => hero.name)
  ].join(" ");
}

function passesFilters(person) {
  const query = normalize(controls.search.value);
  if (query && !normalize(personSearchText(person)).includes(query)) return false;
  if (controls.role.value !== "all" && roleWithNumber(person) !== controls.role.value) return false;
  if (controls.region.value !== "all" && person.region !== controls.region.value) return false;
  if (state.view === "known" && !state.known.has(person.uid)) return false;
  if (state.view === "learning" && !state.learning.has(person.uid)) return false;
  return true;
}

function displayDateWithAge(value) {
  if (!value) return "";
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return value;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  const date = birth.toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "numeric" });
  return age > 0 ? `${date} (${age})` : date;
}

function currentPerson() {
  return state.deck[state.index] || null;
}

function applyFilters({ keepReveal = false } = {}) {
  const currentUid = currentPerson()?.uid;
  state.deck = state.people.filter(passesFilters);
  const currentIndex = state.deck.findIndex((person) => person.uid === currentUid);
  state.index = currentIndex >= 0 ? currentIndex : Math.min(state.index, Math.max(state.deck.length - 1, 0));
  if (!keepReveal) state.revealed = false;
  render();
}

function shuffleDeck() {
  const filteredIds = new Set(state.deck.map((person) => person.uid));
  const shuffledVisible = shuffleArray(state.deck);
  const hidden = state.people.filter((person) => !filteredIds.has(person.uid));
  state.people = [...shuffledVisible, ...hidden];
  state.index = 0;
  state.revealed = false;
  applyFilters();
}

function goPrevious() {
  if (!state.deck.length) return;
  state.index = (state.index - 1 + state.deck.length) % state.deck.length;
  state.revealed = false;
  render();
}

function moveAfterAnswer(answeredUid) {
  applyFilters();
  if (!state.deck.length) return;
  const stillHere = state.deck.findIndex((person) => person.uid === answeredUid);
  if (stillHere >= 0) {
    state.index = (stillHere + 1) % state.deck.length;
  } else {
    state.index = Math.min(state.index, state.deck.length - 1);
  }
  state.revealed = false;
  render();
}

function mark(kind) {
  const person = currentPerson();
  if (!person) return;
  if (kind === "known") {
    state.known.add(person.uid);
    state.learning.delete(person.uid);
  } else {
    state.learning.add(person.uid);
    state.known.delete(person.uid);
  }
  moveAfterAnswer(person.uid);
}

function resetProgress() {
  state.known.clear();
  state.learning.clear();
  state.view = "all";
  state.revealed = false;
  applyFilters();
}

function imageUrls(person) {
  return [
    person.image?.fullUrl,
    person.image?.localUrl,
    person.image?.url
  ].filter((url, index, urls) => url && urls.indexOf(url) === index);
}

function setPortrait(person) {
  const portrait = $("portrait");
  portrait.replaceChildren();
  const urls = imageUrls(person);
  if (urls.length) {
    const image = document.createElement("img");
    let sourceIndex = 0;
    image.alt = state.revealed ? `Фото ${person.nickname}` : "Фото игрока";
    image.referrerPolicy = "no-referrer";
    const tryNextSource = () => {
      sourceIndex += 1;
      if (urls[sourceIndex]) {
        image.src = urls[sourceIndex];
      }
    };
    image.addEventListener("error", tryNextSource);
    image.addEventListener("load", () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        tryNextSource();
      }
    });
    image.src = urls[sourceIndex];
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

function heroesRow(heroes) {
  const usable = (heroes || []).filter((hero) => hero.localUrl || hero.url);
  if (!usable.length) return null;
  const row = document.createElement("div");
  row.className = "info-row info-row--heroes";
  const key = document.createElement("span");
  key.textContent = "Герои";
  const list = document.createElement("div");
  list.className = "hero-list";
  for (const hero of usable) {
    const item = document.createElement("span");
    item.className = "hero-chip";
    const image = document.createElement("img");
    image.src = hero.localUrl || hero.url;
    image.alt = hero.name;
    const name = document.createElement("span");
    name.textContent = hero.name;
    item.append(image, name);
    list.appendChild(item);
  }
  row.append(key, list);
  return row;
}

function renderInfo(person) {
  $("roleName").textContent = roleWithNumber(person);
  const rows = $("infoRows");
  rows.replaceChildren();

  if (!state.revealed) {
    return;
  }

  rows.append(
    ...[
      infoRow("Имя", profileFullName(person)),
      infoRow("Родился", displayDateWithAge(person.birthDate)),
      infoRow("Страна", person.country),
      infoRow("Ники", person.aliases),
      infoRow("Заработал", person.earnings),
      heroesRow(person.signatureHeroes)
    ].filter(Boolean)
  );
}

function updateScoreButtons() {
  document.querySelectorAll(".score-card").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
    button.setAttribute("aria-pressed", button.dataset.view === state.view ? "true" : "false");
  });
}

function render() {
  const person = currentPerson();
  const hasCards = Boolean(person);
  $("trainer").hidden = !hasCards;
  document.querySelector(".trainer-actions").hidden = !hasCards;
  $("emptyState").hidden = hasCards;

  $("positionCount").textContent = hasCards ? `${state.index + 1}/${state.deck.length}` : "0/0";
  $("knownCount").textContent = state.known.size;
  $("learningCount").textContent = state.learning.size;
  updateScoreButtons();

  if (!person) return;

  $("flashcard").className = `flashcard ${state.revealed ? "is-revealed" : "is-hidden"}`;
  $("answerNick").textContent = state.revealed ? person.nickname : "?";
  $("answerFullName").textContent = state.revealed ? profileFullName(person) : "";
  controls.inlineReveal.hidden = state.revealed;
  $("answerTeam").hidden = !state.revealed;
  $("answerTeamLogo").src = teamLogoUrl(person.team);
  $("answerTeamLogo").alt = person.team ? `Логотип ${person.team}` : "";
  $("answerTeamName").textContent = person.team || "";
  $("answerHint").textContent = state.revealed ? "Ответ открыт" : "Ответ скрыт";
  $("cardHint").textContent = state.revealed ? "Ответ открыт справа" : "Нажми, чтобы открыть ответ";
  controls.reveal.textContent = state.revealed ? "Скрыть ответ" : "Показать ответ";
  controls.known.classList.toggle("is-selected", state.known.has(person.uid));
  controls.learning.classList.toggle("is-selected", state.learning.has(person.uid));
  controls.known.setAttribute("aria-pressed", state.known.has(person.uid) ? "true" : "false");
  controls.learning.setAttribute("aria-pressed", state.learning.has(person.uid) ? "true" : "false");

  setPortrait(person);
  renderInfo(person);
}

function bindControls() {
  for (const control of [controls.search, controls.role, controls.region]) {
    control.addEventListener("input", () => applyFilters());
  }
  controls.shuffle.addEventListener("click", shuffleDeck);
  controls.reset.addEventListener("click", resetProgress);
  controls.card.addEventListener("click", () => {
    state.revealed = true;
    render();
  });
  controls.reveal.addEventListener("click", () => {
    state.revealed = !state.revealed;
    render();
  });
  controls.inlineReveal.addEventListener("click", () => {
    state.revealed = true;
    render();
  });
  document.querySelectorAll(".score-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.index = 0;
      state.revealed = false;
      applyFilters();
    });
  });
  controls.prev.addEventListener("click", goPrevious);
  controls.known.addEventListener("click", () => mark("known"));
  controls.learning.addEventListener("click", () => mark("learning"));
  window.addEventListener("keydown", (event) => {
    if (document.activeElement?.tagName === "INPUT") return;
    if (event.key === "ArrowLeft") goPrevious();
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      state.revealed = !state.revealed;
      render();
    }
    if (event.key.toLowerCase() === "z") mark("known");
    if (event.key.toLowerCase() === "x") mark("learning");
  });
}

async function init() {
  bindControls();
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${DATA_URL}`);
  const data = await response.json();
  state.people = shuffleArray(data.people || []);
  state.deck = [...state.people];

  fillSelect(controls.role, uniqueSorted(state.people, roleWithNumber), "Все роли");
  fillSelect(controls.region, uniqueSorted(state.people, (person) => person.region), "Все регионы");

  render();
}

init().catch((error) => {
  $("trainer").hidden = true;
  document.querySelector(".trainer-actions").hidden = true;
  $("emptyState").hidden = false;
  $("emptyState").textContent = "Не удалось загрузить данные.";
  console.error(error);
});
