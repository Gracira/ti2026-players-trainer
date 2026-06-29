const guessForm = document.getElementById("guessForm");
const guessFeedback = document.getElementById("guessFeedback");
const revealButton = document.getElementById("revealButton");
const resetButton = document.getElementById("resetButton");
const shuffleButton = document.getElementById("shuffleButton");
const nextButton = document.getElementById("nextButton");
const portrait = document.getElementById("portrait");
const restoreButtons = ["nextButton", "prevButton", "shuffleButton"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

const progressLists = {
  known: new Set(),
  learning: new Set()
};

let people = [];
let currentPerson = null;
let activeListView = "";

const fixStyles = document.createElement("style");
fixStyles.textContent = `
  #knownCount {
    color: var(--green);
  }

  #learningCount {
    color: var(--red);
  }

  #streakCount {
    color: #a78bfa;
  }

  .progress-list-panel {
    margin: 10px 0 12px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.035);
    box-shadow: 0 12px 26px var(--shadow);
  }

  .progress-list-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .progress-list-panel__head strong {
    font-size: 17px;
  }

  .progress-list-panel__close {
    min-height: 32px;
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.05);
  }

  .progress-list-panel__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 8px;
  }

  .progress-list-card {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
  }

  .progress-list-card img,
  .progress-list-card__missing {
    width: 44px;
    height: 44px;
    border-radius: 7px;
    object-fit: cover;
    background: #0b0d11;
  }

  .progress-list-card__missing {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 11px;
  }

  .progress-list-card strong,
  .progress-list-card small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-list-card strong {
    font-size: 16px;
  }

  .progress-list-card small {
    color: var(--muted);
    font-size: 12px;
  }

  .progress-list-panel__empty {
    margin: 0;
    color: var(--muted);
  }
`;
document.head.appendChild(fixStyles);

const listPanel = document.createElement("section");
listPanel.className = "progress-list-panel";
listPanel.hidden = true;

const main = document.querySelector("main");
const toolbar = document.querySelector(".trainer-toolbar");
if (main && toolbar) {
  main.insertBefore(listPanel, toolbar);
}

function normalizeUrl(value) {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return String(value || "");
  }
}

function imageUrls(person) {
  return [
    person.image?.fullUrl,
    person.image?.localUrl,
    person.image?.url
  ].filter(Boolean);
}

function profileFullName(person) {
  const given = person.info?.find((item) => item.label === "Given name")?.value || "";
  const family = person.info?.find((item) => item.label === "Family name")?.value || "";
  return person.romanizedName || [given, family].filter(Boolean).join(" ") || person.name || person.profileTitle || "";
}

function roleWithNumber(person) {
  if (!person?.roleLabel) return "";
  return /^\d+$/.test(person.role || "") ? `${person.roleLabel} (${person.role})` : person.roleLabel;
}

function findCurrentPerson() {
  const image = portrait?.querySelector("img");
  if (!image?.src) return currentPerson;

  const source = normalizeUrl(image.src);
  return people.find((person) => imageUrls(person).some((url) => normalizeUrl(url) === source)) || currentPerson;
}

function syncCurrentPerson() {
  currentPerson = findCurrentPerson();
}

function hideGuessFormSoon() {
  window.setTimeout(() => {
    if (guessForm) guessForm.hidden = true;
  }, 0);
}

function showGuessFormSoon() {
  window.setTimeout(() => {
    if (guessForm) guessForm.hidden = false;
  }, 0);
}

function markCurrentAs(kind) {
  syncCurrentPerson();
  if (!currentPerson) return;

  if (kind === "known") {
    progressLists.known.add(currentPerson.uid);
    progressLists.learning.delete(currentPerson.uid);
  } else if (kind === "learning") {
    progressLists.learning.add(currentPerson.uid);
    progressLists.known.delete(currentPerson.uid);
  }

  renderActiveList();
}

function peopleFor(kind) {
  const ids = progressLists[kind] || new Set();
  return people
    .filter((person) => ids.has(person.uid))
    .sort((a, b) => `${a.team} ${a.role} ${a.nickname}`.localeCompare(`${b.team} ${b.role} ${b.nickname}`));
}

function createPersonCard(person) {
  const card = document.createElement("article");
  const image = document.createElement("img");
  const missing = document.createElement("span");
  const body = document.createElement("div");
  const nick = document.createElement("strong");
  const details = document.createElement("small");
  const imageSource = person.image?.localUrl || person.image?.url || person.image?.fullUrl;

  card.className = "progress-list-card";
  missing.className = "progress-list-card__missing";
  missing.textContent = "нет";
  nick.textContent = person.nickname;
  details.textContent = [profileFullName(person), person.team, roleWithNumber(person)].filter(Boolean).join(" · ");
  body.append(nick, details);

  if (imageSource) {
    image.src = imageSource;
    image.alt = person.nickname;
    image.referrerPolicy = "no-referrer";
    card.append(image, body);
  } else {
    card.append(missing, body);
  }

  return card;
}

function renderList(kind) {
  activeListView = kind;
  const title = kind === "known" ? "Верно" : "Ошибки";
  const items = peopleFor(kind);
  const head = document.createElement("div");
  const heading = document.createElement("strong");
  const close = document.createElement("button");

  head.className = "progress-list-panel__head";
  heading.textContent = `${title}: ${items.length}`;
  close.type = "button";
  close.className = "progress-list-panel__close";
  close.textContent = "Скрыть";
  close.addEventListener("click", () => {
    activeListView = "";
    listPanel.hidden = true;
  });
  head.append(heading, close);

  listPanel.replaceChildren(head);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "progress-list-panel__empty";
    empty.textContent = kind === "known" ? "Пока нет верных ответов." : "Пока нет ошибок.";
    listPanel.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "progress-list-panel__grid";
    grid.append(...items.map(createPersonCard));
    listPanel.appendChild(grid);
  }

  listPanel.hidden = false;
}

function renderActiveList() {
  if (activeListView) renderList(activeListView);
}

function hideList() {
  activeListView = "";
  listPanel.hidden = true;
}

fetch("./data/players.json", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : { people: [] })
  .then((data) => {
    people = data.people || [];
    syncCurrentPerson();
  })
  .catch(() => {
    people = [];
  });

new MutationObserver(syncCurrentPerson).observe(portrait, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"]
});

revealButton?.addEventListener("click", () => {
  syncCurrentPerson();
  window.setTimeout(() => markCurrentAs("learning"), 0);
  hideGuessFormSoon();
});

guessForm?.addEventListener("submit", () => {
  syncCurrentPerson();
  window.setTimeout(() => {
    const feedback = guessFeedback?.textContent.trim();
    if (feedback === "Правильно") {
      markCurrentAs("known");
      hideGuessFormSoon();
    } else if (feedback === "Не тот ник") {
      markCurrentAs("learning");
    }
  }, 0);
});

for (const button of restoreButtons) {
  button.addEventListener("click", () => {
    showGuessFormSoon();
    window.setTimeout(syncCurrentPerson, 0);
  });
}

for (const filter of [document.getElementById("roleFilter"), document.getElementById("regionFilter")].filter(Boolean)) {
  filter.addEventListener("input", () => {
    showGuessFormSoon();
    hideList();
  });
}

document.querySelectorAll(".score-card[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    showGuessFormSoon();
    if (button.dataset.view === "known" || button.dataset.view === "learning") {
      window.setTimeout(() => renderList(button.dataset.view), 0);
    } else {
      hideList();
    }
  });
});

resetButton?.addEventListener("click", () => {
  progressLists.known.clear();
  progressLists.learning.clear();
  hideList();
  window.setTimeout(() => {
    shuffleButton?.click();
    showGuessFormSoon();
    syncCurrentPerson();
  }, 0);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    showGuessFormSoon();
    window.setTimeout(syncCurrentPerson, 0);
  }
});
