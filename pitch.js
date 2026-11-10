(() => {
  const slides = [...document.querySelectorAll(".slide")];
  const dotsRoot = document.querySelector("[data-deck-dots]");
  const currentLabel = document.querySelector("[data-deck-current]");
  const totalLabel = document.querySelector("[data-deck-total]");
  const progress = document.querySelector("[data-deck-progress]");
  let current = Math.max(0, slides.findIndex((slide) => `#${slide.id}` === location.hash));
  let touchStartX = null;

  totalLabel.textContent = String(slides.length);
  dotsRoot.innerHTML = slides.map((slide, index) => `<button type="button" data-slide-index="${index}" aria-label="${index + 1}. ${slide.dataset.title}"></button>`).join("");

  function desktopDeck() {
    return matchMedia("(min-width: 901px)").matches;
  }

  function show(index, { updateHistory = true } = {}) {
    if (!desktopDeck()) return;
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    dotsRoot.querySelectorAll("button").forEach((dot, dotIndex) => dot.setAttribute("aria-current", String(dotIndex === current)));
    currentLabel.textContent = String(current + 1);
    progress.style.width = `${((current + 1) / slides.length) * 100}%`;
    document.title = current === 0 ? "Ärtan — tillsammans varje dag" : `${slides[current].dataset.title} — Ärtan`;
    if (updateHistory) history.replaceState(null, "", `#${slides[current].id}`);
  }

  function move(delta) {
    show(current + delta);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-deck-action]")?.dataset.deckAction;
    if (action === "previous") move(-1);
    if (action === "next") move(1);
    if (action === "print") window.print();
    const dot = event.target.closest("[data-slide-index]");
    if (dot) show(Number(dot.dataset.slideIndex));
  });

  document.addEventListener("keydown", (event) => {
    if (!desktopDeck()) return;
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); move(1); }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); move(-1); }
    if (event.key === "Home") { event.preventDefault(); show(0); }
    if (event.key === "End") { event.preventDefault(); show(slides.length - 1); }
    if (event.key.toLocaleLowerCase("sv-SE") === "f") toggleFullscreen();
  });

  document.addEventListener("touchstart", (event) => {
    if (!desktopDeck()) return;
    touchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (touchStartX === null || !desktopDeck()) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    touchStartX = null;
    if (Math.abs(distance) > 60) move(distance < 0 ? 1 : -1);
  }, { passive: true });

  addEventListener("hashchange", () => {
    const index = slides.findIndex((slide) => `#${slide.id}` === location.hash);
    if (index >= 0) show(index, { updateHistory: false });
  });

  addEventListener("resize", () => {
    if (desktopDeck()) show(current, { updateHistory: false });
    else slides.forEach((slide) => slide.setAttribute("aria-hidden", "false"));
  });

  if (desktopDeck()) show(current, { updateHistory: false });
  else slides.forEach((slide) => slide.setAttribute("aria-hidden", "false"));
})();
