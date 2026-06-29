const guessForm = document.getElementById("guessForm");
const revealButton = document.getElementById("revealButton");
const resetButton = document.getElementById("resetButton");
const shuffleButton = document.getElementById("shuffleButton");
const restoreButtons = ["nextButton", "prevButton", "shuffleButton"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

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

revealButton?.addEventListener("click", hideGuessFormSoon);

for (const button of restoreButtons) {
  button.addEventListener("click", showGuessFormSoon);
}

for (const filter of [document.getElementById("roleFilter"), document.getElementById("regionFilter")].filter(Boolean)) {
  filter.addEventListener("input", showGuessFormSoon);
}

document.querySelectorAll(".score-card[data-view]").forEach((button) => {
  button.addEventListener("click", showGuessFormSoon);
});

resetButton?.addEventListener("click", () => {
  window.setTimeout(() => {
    shuffleButton?.click();
    showGuessFormSoon();
  }, 0);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    showGuessFormSoon();
  }
});
