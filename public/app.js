const DATA_URL = "./data/players.json";
const SUGGESTION_LIMIT = 8;

const state = {
  people: [],
  deck: [],
  index: 0,
  view: "all",
  revealed: false,
  feedback: "",
  streak: 0,
  known: new Set(),
  learning: new Set()
};

const $ = (id) => document.getElementById(id);

const controls = {
  role: $("roleFilter"),
  region: $("regionFilter"),
  shuffle: $("shuffleButton"),
  reset: $("resetButton"),
  reveal: $("revealButton"),
  prev: $("prevButton"),
  next: $("nextButton"),
  guessForm: $("guessForm"),
  guessInput: $("guessInput"),
  guessButton: $("guessButton"),
  guessSuggestions: $("guessSuggestions"),
  guessFeedback: $("guessFeedback"),
  progressList: $("progressList")
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

function normalizeGuess(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
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

function roleOrderValue(roleName) {
  const position = roleName.match(/\((\d+)\)$/)?.[1];
  if (position) return Number(position);

  const normalizedRole = normalize(roleName);
  if (normalizedRole.includes("assistant") || normalizedRole.includes("помощ")) return 7;
  if (normalizedRole.includes("coach") || normalizedRole.includes("тренер")) return 6;
  return 99;
}

function orderedRoles(people) {
  return uniqueSorted(people, roleWithNumber).sort((a, b) => {
    const orderDelta = roleOrderValue(a) - roleOrderValue(b);
    return orderDelta || a.localeCompare(b);
  });
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

function isAnswered(person) {
  return Boolean(person && (state.known.has(person.uid) || state.learning.has(person.uid)));
}

function passesBaseFilters(person) {
  if (controls.role.value !== "all" && roleWithNumber(person) !== controls.role.value) return false;
  if (controls.region.value !== "all" && person.region !== controls.region.value) return false;
  return true;
}

function passesDeckFilters(person) {
  return passesBaseFilters(person) && !isAnswered(person);
}

function progressItems(kind) {
  const ids = kind === "known" ? state.known : state.learning;
  return state.people
    .filter((person) => passesBaseFilters(person) && ids.has(person.uid))
    .sort((a, b) => `${a.team} ${a.role} ${a.nickname}`.localeCompare(`${b.team} ${b.role} ${b.nickname}`));
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

function hideGuessSuggestions() {
  controls.guessSuggestions.replaceChildren();
  controls.guessSuggestions.hidden = true;
}

function resetRound() {
  state.revealed = false;
  state.feedback = "";
  controls.guessInput.value = "";
  controls.guessForm.hidden = false;
  hideGuessSuggestions();
}

function applyFilters({ keepRound = false, randomStart = false } = {}) {
  const currentUid = currentPerson()?.uid;
  state.deck = state.people.filter(passesDeckFilters);

  if (randomStart) {
    state.index = 0;
  } else {
    const currentIndex = state.deck.findIndex((person) => person.uid === currentUid);
    state.index = currentIndex >= 0 ? currentIndex : Math.min(state.index, Math.max(state.deck.length - 1, 0));
  }

  if (!keepRound) resetRound();
  render();
}

function shuffleDeck() {
  state.people = shuffleArray(state.people);
  state.index = 0;
  resetRound();
  applyFilters({ keepRound: true, randomStart: true });
}

function goPrevious() {
  if (state.view !== "all" || !state.deck.length) return;
  state.index = (state.index - 1 + state.deck.length) % state.deck.length;
  resetRound();
  render();
}

function goNext() {
  if (state.view !== "all") return;
  applyFilters();
}

function revealAsLearning() {
  const person = currentPerson();
  if (!person) return;
  state.learning.add(person.uid);
  state.known.delete(person.uid);
  state.streak = 0;
  state.revealed = true;
  state.feedback = "answer";
  controls.guessForm.hidden = true;
  hideGuessSuggestions();
  render();
}

function answerCandidates(person) {
  const aliases = String(person.aliases || "")
    .split(/[,;/|]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);
  const id = person.info?.find((item) => item.label === "ID")?.value || "";
  return [person.nickname, id, ...aliases].filter(Boolean);
}

function suggestionSearchValues(person) {
  const nameInfo = person.info?.find((item) => item.label === "Name")?.value || "";
  const id = person.info?.find((item) => item.label === "ID")?.value || "";
  return [
    person.nickname,
    id,
    person.profileTitle,
    profileFullName(person),
    person.romanizedName,
    person.name,
    nameInfo,
    person.aliases
  ].filter(Boolean);
}

function isCorrectGuess(person, guess) {
  const normalizedGuess = normalizeGuess(guess);
  if (!normalizedGuess) return false;
  return answerCandidates(person).some((candidate) => normalizeGuess(candidate) === normalizedGuess);
}

function personMatchesSuggestion(person, normalizedQuery) {
  return suggestionSearchValues(person).some((value) => normalizeGuess(value).includes(normalizedQuery));
}

function renderGuessSuggestions() {
  if (state.view !== "all" || state.revealed || controls.guessForm.hidden || controls.guessInput.disabled) {
    hideGuessSuggestions();
    return;
  }

  const normalizedQuery = normalizeGuess(controls.guessInput.value);
  if (!normalizedQuery) {
    hideGuessSuggestions();
    return;
  }

  const seen = new Set();
  const matches = state.people
    .filter(passesDeckFilters)
    .filter((person) => personMatchesSuggestion(person, normalizedQuery))
    .filter((person) => {
      const key = normalizeGuess(person.nickname);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_LIMIT);

  if (!matches.length) {
    hideGuessSuggestions();
    return;
  }

  controls.guessSuggestions.replaceChildren(
    ...matches.map((person) => {
      const button = document.createElement("button");
      const fullName = profileFullName(person);
      const nickname = document.createElement("strong");
      const details = document.createElement("small");
      button.type = "button";
      button.className = "guess-suggestion";
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", fullName ? `${person.nickname}, ${fullName}` : person.nickname);
      nickname.textContent = person.nickname;
      details.textContent = [fullName, person.team].filter(Boolean).join(" · ");
      button.append(nickname, details);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        controls.guessInput.value = person.nickname;
        hideGuessSuggestions();
        controls.guessInput.focus({ preventScroll: true });
      });
      return button;
    })
  );
  controls.guessSuggestions.hidden = false;
}

function checkGuess() {
  const person = currentPerson();
  if (!person || state.revealed || state.view !== "all") return;
  const guess = controls.guessInput.value;
  hideGuessSuggestions();

  if (isCorrectGuess(person, guess)) {
    state.known.add(person.uid);
    state.learning.delete(person.uid);
    state.streak += 1;
    state.feedback = "correct";
  } else {
    state.learning.add(person.uid);
    state.known.delete(person.uid);
    state.streak = 0;
    state.feedback = "wrong";
  }

  state.revealed = true;
  controls.guessForm.hidden = true;
  render();
}

function resetProgress() {
  state.known.clear();
  state.learning.clear();
  state.streak = 0;
  state.view = "all";
  state.people = shuffleArray(state.people);
  state.index = 0;
  resetRound();
  applyFilters({ keepRound: true, randomStart: true });
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
  document.querySelectorAll(".score-card[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
    button.setAttribute("aria-pressed", button.dataset.view === state.view ? "true" : "false");
  });
}

function renderFeedback() {
  controls.guessFeedback.className = `guess-feedback ${state.feedback ? `guess-feedback--${state.feedback}` : ""}`;
  if (state.feedback === "correct") {
    controls.guessFeedback.textContent = "Правильно";
  } else if (state.feedback === "wrong") {
    controls.guessFeedback.textContent = "Не тот ник";
  } else if (state.feedback === "answer") {
    controls.guessFeedback.textContent = "Ответ раскрыт";
  } else {
    controls.guessFeedback.textContent = "";
  }
}

function createProgressCard(person) {
  const card = document.createElement("article");
  const imageSource = person.image?.localUrl || person.image?.url || person.image?.fullUrl;
  const media = imageSource ? document.createElement("img") : document.createElement("span");
  const body = document.createElement("div");
  const nick = document.createElement("strong");
  const details = document.createElement("small");

  card.className = "progress-card";
  if (imageSource) {
    media.src = imageSource;
    media.alt = person.nickname;
    media.referrerPolicy = "no-referrer";
  } else {
    media.className = "progress-card__missing";
    media.textContent = "нет";
  }

  nick.textContent = person.nickname;
  details.textContent = [profileFullName(person), person.team, roleWithNumber(person)].filter(Boolean).join(" · ");
  body.append(nick, details);
  card.append(media, body);
  return card;
}

function renderProgressList(kind) {
  const title = kind === "known" ? "Верно" : "Ошибки";
  const items = progressItems(kind);
  const head = document.createElement("div");
  const heading = document.createElement("strong");
  const back = document.createElement("button");

  head.className = "progress-list__head";
  heading.textContent = `${title}: ${items.length}`;
  back.type = "button";
  back.textContent = "К карточкам";
  back.addEventListener("click", () => {
    state.view = "all";
    resetRound();
    applyFilters({ keepRound: true });
  });
  head.append(heading, back);

  controls.progressList.replaceChildren(head);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "progress-list__empty";
    empty.textContent = kind === "known" ? "Пока нет верных ответов." : "Пока нет ошибок.";
    controls.progressList.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "progress-list__grid";
    grid.append(...items.map(createProgressCard));
    controls.progressList.appendChild(grid);
  }
}

function renderEmptyState() {
  const filteredTotal = state.people.filter(passesBaseFilters).length;
  if (!filteredTotal) {
    $("emptyState").textContent = "Нет карточек по выбранным фильтрам.";
  } else {
    $("emptyState").textContent = "В общей колоде больше нет карточек. Нажми «Сбросить», чтобы начать заново.";
  }
}

function renderTrainerView() {
  const person = currentPerson();
  const hasCards = Boolean(person);
  const trainer = $("trainer");

  controls.progressList.hidden = true;
  trainer.hidden = !hasCards;
  trainer.dataset.feedback = state.feedback || "";
  document.querySelector(".trainer-actions").hidden = !hasCards;
  $("emptyState").hidden = hasCards;

  $("positionCount").textContent = hasCards ? `${state.index + 1}/${state.deck.length}` : `0/${state.deck.length}`;
  $("knownCount").textContent = state.known.size;
  $("learningCount").textContent = state.learning.size;
  $("streakCount").textContent = state.streak;
  updateScoreButtons();

  if (!person) {
    hideGuessSuggestions();
    renderEmptyState();
    return;
  }

  $("flashcard").className = `flashcard ${state.revealed ? "is-revealed" : "is-hidden"}`;
  $("answerNick").textContent = state.revealed ? person.nickname : "?";
  $("answerFullName").textContent = state.revealed ? profileFullName(person) : "";
  $("answerTeam").hidden = !state.revealed;
  $("answerTeamLogo").src = teamLogoUrl(person.team);
  $("answerTeamLogo").alt = person.team ? `Логотип ${person.team}` : "";
  $("answerTeamName").textContent = person.team || "";
  $("answerHint").textContent = state.revealed ? (state.feedback === "correct" ? "Верно" : "Ответ открыт") : "Ответ скрыт";
  controls.guessInput.disabled = state.revealed;
  controls.guessButton.disabled = state.revealed;
  controls.reveal.hidden = state.revealed;
  controls.next.hidden = !state.revealed;
  renderFeedback();

  setPortrait(person);
  renderInfo(person);
  renderGuessSuggestions();

  if (!state.revealed && !controls.guessForm.hidden && !["INPUT", "SELECT"].includes(document.activeElement?.tagName)) {
    controls.guessInput.focus({ preventScroll: true });
  }
}

function renderListView() {
  const trainer = $("trainer");
  trainer.hidden = true;
  document.querySelector(".trainer-actions").hidden = true;
  $("emptyState").hidden = true;
  controls.progressList.hidden = false;

  $("positionCount").textContent = state.deck.length ? `${Math.min(state.index + 1, state.deck.length)}/${state.deck.length}` : `0/${state.deck.length}`;
  $("knownCount").textContent = state.known.size;
  $("learningCount").textContent = state.learning.size;
  $("streakCount").textContent = state.streak;
  updateScoreButtons();
  hideGuessSuggestions();
  renderProgressList(state.view);
}

function render() {
  if (state.view === "known" || state.view === "learning") {
    renderListView();
  } else {
    renderTrainerView();
  }
}

function setView(view) {
  state.view = view;
  state.index = 0;
  resetRound();
  applyFilters({ keepRound: true });
}

function bindControls() {
  for (const control of [controls.role, controls.region]) {
    control.addEventListener("input", () => {
      state.index = 0;
      resetRound();
      applyFilters({ keepRound: true });
    });
  }
  controls.shuffle.addEventListener("click", shuffleDeck);
  controls.reset.addEventListener("click", resetProgress);
  controls.reveal.addEventListener("click", revealAsLearning);
  controls.next.addEventListener("click", goNext);
  controls.guessInput.addEventListener("input", renderGuessSuggestions);
  controls.guessInput.addEventListener("focus", renderGuessSuggestions);
  controls.guessInput.addEventListener("blur", () => {
    window.setTimeout(hideGuessSuggestions, 120);
  });
  controls.guessInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideGuessSuggestions();
  });
  controls.guessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    checkGuess();
  });
  document.querySelectorAll(".score-card[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  controls.prev.addEventListener("click", goPrevious);
  window.addEventListener("keydown", (event) => {
    if (document.activeElement?.tagName === "INPUT") return;
    if (event.key === "ArrowLeft") goPrevious();
    if (event.key === "ArrowRight" && state.revealed) goNext();
  });
}

async function init() {
  bindControls();
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${DATA_URL}`);
  const data = await response.json();
  state.people = shuffleArray(data.people || []);
  state.deck = state.people.filter(passesDeckFilters);

  fillSelect(controls.role, orderedRoles(state.people), "Все роли");
  fillSelect(controls.region, uniqueSorted(state.people, (person) => person.region), "Все регионы");

  render();
}

init().catch((error) => {
  $("trainer").hidden = true;
  document.querySelector(".trainer-actions").hidden = true;
  controls.progressList.hidden = true;
  $("emptyState").hidden = false;
  $("emptyState").textContent = "Не удалось загрузить данные.";
  console.error(error);
});
