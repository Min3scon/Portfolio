// Address the contact form sends to. Set this to your email before publishing.
const CONTACT_EMAIL = "";

// Blur and fade blocks as they scroll up under the header: the hero on the
// home page, then each page's title, project cards, photo and paragraphs.
const header = document.querySelector(".site-header");
const fading = [...document.querySelectorAll(".hero, .page-title, .card-grid.all .card, .about-side, .about-text p")];
if (header && fading.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const update = () => {
    const edge = header.getBoundingClientRect().bottom;
    // Measure everything before restyling anything, so it's one layout per frame.
    const tops = fading.map((el) => el.getBoundingClientRect().top);
    fading.forEach((el, i) => {
      const progress = Math.min(Math.max((edge - tops[i]) / 220, 0), 1);
      el.style.filter = progress > 0 ? `blur(${progress * 4}px)` : "";
      el.style.opacity = String(1 - progress * 0.6);
    });
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

// Contact form: open the visitor's mail client with the message filled in.
const form = document.querySelector(".contact-form");
if (form) {
  const status = form.querySelector(".form-status");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (!CONTACT_EMAIL) {
      status.textContent = "Contact email not set up yet.";
      return;
    }
    const subject = encodeURIComponent(`Portfolio message from ${data.get("name")}`);
    const body = encodeURIComponent(`${data.get("message")}\n\n${data.get("name")} (${data.get("email")})`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    status.textContent = "Opening your email app…";
  });
}

// Live view counter. GitHub Pages serves static files and can't count hits
// itself, so the count lives in Abacus (abacus.jasoncameron.dev), a free
// no-auth counting API. Counter: min3scon-portfolio/site-views
const VIEW_COUNTER = "min3scon-portfolio/site-views";

const viewCount = document.getElementById("view-count");
if (viewCount) {
  // Storage throws in some private-browsing modes, so never let it break the count.
  const read = (area, key) => { try { return area.getItem(key); } catch { return null; } };
  const write = (area, key, value) => { try { area.setItem(key, value); } catch {} };

  const render = (value) => {
    viewCount.textContent = `${value.toLocaleString()} ${value === 1 ? "View" : "Views"}`;
  };

  // Show the last known number immediately so the footer isn't a dash
  // while the request is in flight.
  const cached = Number(read(localStorage, "view-count"));
  if (cached > 0) render(cached);

  // Only the first page load of a session increments, so refreshing the page
  // doesn't inflate the count. Later loads just read the current value.
  const endpoint = read(sessionStorage, "view-counted") ? "get" : "hit";

  fetch(`https://abacus.jasoncameron.dev/${endpoint}/${VIEW_COUNTER}`, {
    signal: AbortSignal.timeout(8000),
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then(({ value }) => {
      write(sessionStorage, "view-counted", "1");
      write(localStorage, "view-count", String(value));
      render(value);
    })
    .catch(() => {
      // Offline, rate-limited or blocked by an extension: keep the cached
      // number if there is one, rather than showing a made-up count.
    });
}
