/* ============================================
   ASCEND ROOFING GROUP — JavaScript
   Smooth scroll, nav, animations, counters
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ---- NAVBAR SCROLL EFFECT ----
  const navbar = document.getElementById("navbar");
  const handleNavScroll = () => {
    navbar.classList.toggle("scrolled", window.scrollY > 60);
  };
  window.addEventListener("scroll", handleNavScroll, { passive: true });
  handleNavScroll();

  // ---- MOBILE NAV TOGGLE ----
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  const navOverlay = document.getElementById("navOverlay");

  const closeNav = () => {
    navToggle.classList.remove("open");
    navMenu.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    if (navOverlay) navOverlay.classList.remove("active");
    document.body.style.overflow = "";
  };

  const openNav = () => {
    navToggle.classList.add("open");
    navMenu.classList.add("open");
    navToggle.setAttribute("aria-expanded", "true");
    if (navOverlay) navOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  };

  navToggle.addEventListener("click", () => {
    if (navMenu.classList.contains("open")) {
      closeNav();
    } else {
      openNav();
    }
  });

  // Escape closes the menu and returns focus to the toggle
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navMenu.classList.contains("open")) {
      closeNav();
      navToggle.focus();
    }
  });

  // Close mobile nav when tapping overlay
  if (navOverlay) {
    navOverlay.addEventListener("click", closeNav);
  }

  // Close mobile nav on link click
  navMenu.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  // ---- ACTIVE NAV LINK ON SCROLL ----
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-link:not(.nav-cta)");

  const updateActiveNav = () => {
    const scrollY = window.scrollY + 120;
    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute("id");
      if (scrollY >= top && scrollY < top + height) {
        navLinks.forEach((link) => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${id}`,
          );
        });
      }
    });
  };
  window.addEventListener("scroll", updateActiveNav, { passive: true });

  // ---- SCROLL REVEAL ----
  const revealElements = document.querySelectorAll("[data-reveal]");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger reveal if inside a grid
          const parent = entry.target.parentElement;
          const siblings = parent.querySelectorAll("[data-reveal]");
          let delay = 0;
          if (siblings.length > 1) {
            const idx = Array.from(siblings).indexOf(entry.target);
            delay = idx * 100;
          }
          setTimeout(() => {
            entry.target.classList.add("revealed");
          }, delay);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // ---- STATS COUNTER ANIMATION ----
  const statNumbers = document.querySelectorAll("[data-count]");
  let statsAnimated = false;

  const animateCounters = () => {
    if (statsAnimated) return;
    statsAnimated = true;

    if (prefersReducedMotion) {
      statNumbers.forEach((el) => {
        el.textContent = parseInt(el.dataset.count).toLocaleString();
      });
      return;
    }

    statNumbers.forEach((el) => {
      const target = parseInt(el.dataset.count);
      const duration = 2000;
      const startTime = performance.now();

      const easeOutQuad = (t) => t * (2 - t);

      const updateCounter = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuad(progress);
        const current = Math.floor(easedProgress * target);
        el.textContent = current.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          el.textContent = target.toLocaleString();
        }
      };

      requestAnimationFrame(updateCounter);
    });
  };

  // Trigger counter when hero-stats is visible
  const statsSection = document.querySelector(".hero-stats");
  if (statsSection) {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    statsObserver.observe(statsSection);
  }

  // ---- SMOOTH SCROLL (for browsers that need it) ----
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const href = anchor.getAttribute("href");
      if (href === "#") return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    });
  });

  // ---- CONTACT FORM HANDLER ----
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const btn = document.getElementById("submitBtn");
      const errorEl = document.getElementById("contactError");
      const originalHTML = btn.innerHTML;

      if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }

      btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                    <path d="M12 2a10 10 0 1 0 10 10"/>
                </svg>
                Sending...
            `;
      btn.disabled = true;

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch("/api/submit-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const wrapper = contactForm.parentElement;
          const firstName = (data.name || "").split(" ")[0].replace(/[<>&"']/g, "");
          wrapper.innerHTML = `
                        <div class="form-success">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="9 12 12 15 16 9"/>
                            </svg>
                            <h3>Quote Request Sent!</h3>
                            <p>Thanks for reaching out, ${firstName}. We'll get back to you within 24 hours.</p>
                        </div>
                    `;
        } else {
          throw new Error("Network response was not ok");
        }
      } catch (error) {
        console.error("Error:", error);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (errorEl) {
          errorEl.textContent = "Something went wrong. Please call us directly at 0490 196 284.";
          errorEl.style.display = "block";
        }
      }
    });
  }

  // ---- ADDRESS AUTOCOMPLETE (server-proxied) ----
  initAddressAutocomplete();

  // ---- FAQ ACCORDION ----
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    const btn = item.querySelector(".faq-question");
    if (btn) {
      btn.addEventListener("click", () => {
        const isActive = item.classList.contains("active");
        // Close all other items
        faqItems.forEach((other) => {
          other.classList.remove("active");
          const otherBtn = other.querySelector(".faq-question");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        });
        // Toggle current
        if (!isActive) {
          item.classList.add("active");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    }
  });
});

/* ============================================
   ADDRESS AUTOCOMPLETE (server-proxied)
   ------------------------------------------------
   Replaces the legacy Google Maps JS Places widget,
   which popped the blocking "This page can't load
   Google Maps correctly" dialog when the browser key
   was rejected. Instead we call our own origin-checked
   proxy (/api/places-autocomplete) and render a simple
   dropdown. On ANY failure we just hide the dropdown —
   the field stays a normal text input, never a dialog.

   Picking a suggestion then calls /api/place-details for
   the address components, so forms that split the address
   into separate fields (street / suburb / state / postcode)
   get every one of them filled in.
   ============================================ */

// Covers the contact form (#address), instant-quote form (#quoteAddress),
// colour-confirmation form (#jobAddress), the employee form (#streetAddress)
// and the subcontractor pack (#businessAddress) without per-page wiring.
const ADDRESS_AC_SELECTOR = [
  "input[data-address-autocomplete]",
  "#address",
  "#quoteAddress",
  "#jobAddress",
  "#streetAddress",
  "#businessAddress",
  'input[name="address"]',
].join(", ");

// Where the parts of a picked address get written. An explicit data attribute
// always wins; otherwise fall back to the conventional id/name, then to the
// autocomplete token the browser already uses for that same field.
const ADDRESS_PART_SELECTORS = {
  suburb: [
    "[data-address-suburb]",
    "#suburb",
    '[name="suburb"]',
    '[autocomplete="address-level2"]',
  ],
  state: [
    "[data-address-state]",
    "#state",
    '[name="state"]',
    '[autocomplete="address-level1"]',
  ],
  postcode: [
    "[data-address-postcode]",
    "#postcode",
    '[name="postcode"]',
    '[autocomplete="postal-code"]',
  ],
};

// One token per address lookup, rotated once Details closes the session, so
// Google bills the keystrokes and the lookup together instead of separately.
function newPlacesSessionToken() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch (err) {
    /* randomUUID unavailable (insecure context) — fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Look for a sibling field within the same form. Scoping to the form keeps a
// page with several forms from cross-filling the wrong one.
function findAddressPartField(input, part) {
  const scope = input.form || document;
  for (const selector of ADDRESS_PART_SELECTORS[part]) {
    const el = scope.querySelector(selector);
    if (el && el !== input) return el;
  }
  return null;
}

// Fill a field and let anything listening (validation, analytics) know.
// Selects only accept a value they actually have an option for, so an
// interstate address can't silently leave a bogus state selected.
function setAddressPartField(el, value) {
  if (!el || !value) return false;
  if (el.tagName === "SELECT") {
    const want = String(value).trim().toLowerCase();
    const option = Array.from(el.options).find(
      (o) =>
        o.value.trim().toLowerCase() === want ||
        o.textContent.trim().toLowerCase() === want,
    );
    if (!option) return false;
    el.value = option.value;
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function initAddressAutocomplete(root) {
  (root || document)
    .querySelectorAll(ADDRESS_AC_SELECTOR)
    .forEach(attachAddressAutocomplete);
}

function attachAddressAutocomplete(input) {
  if (!input || input.dataset.acBound === "1") return; // never double-bind
  input.dataset.acBound = "1";

  // The instant-quote form posts client coords to /api/roof-quote and falls
  // back to server-side geocoding when they're null. Place Details returns
  // the geometry, so a picked suggestion can hand over exact coordinates.
  const isQuote = input.id === "quoteAddress";

  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  // Wrap the input so the dropdown can be positioned relative to it.
  const wrap = document.createElement("div");
  wrap.className = "addr-ac";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement("ul");
  list.className = "addr-ac-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  wrap.appendChild(list);

  let predictions = [];
  let activeIdx = -1;
  let controller = null;
  let seq = 0;
  let debounceId = null;
  let sessionToken = newPlacesSessionToken();

  // Resolved lazily: these forms are static, but the lookup is cheap and this
  // keeps the binding correct if a form is built after script.js runs.
  function partFields() {
    return {
      suburb: findAddressPartField(input, "suburb"),
      state: findAddressPartField(input, "state"),
      postcode: findAddressPartField(input, "postcode"),
    };
  }

  function clearQuoteCoords() {
    if (isQuote) {
      window.__quoteAutoLat = null;
      window.__quoteAutoLng = null;
    }
  }

  function hide() {
    list.hidden = true;
    list.innerHTML = "";
    predictions = [];
    activeIdx = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function setActive(idx) {
    const lis = list.querySelectorAll(".addr-ac-item");
    lis.forEach((li, i) => {
      const on = i === idx;
      li.classList.toggle("is-active", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
    activeIdx = idx;
    if (idx >= 0 && lis[idx]) lis[idx].scrollIntoView({ block: "nearest" });
  }

  function choose(idx) {
    const p = predictions[idx];
    if (!p) return;
    // Show the full description straight away; applyPlaceDetails narrows it to
    // the street line if this form has somewhere to put the other parts.
    input.value = p.description;
    clearQuoteCoords();
    hide();
    input.focus();
    applyPlaceDetails(p);
  }

  // Pull the address components for a picked suggestion and distribute them.
  // Every failure path leaves the full description sitting in the field, which
  // is exactly what the form did before details existed.
  async function applyPlaceDetails(prediction) {
    if (!prediction.place_id) return;

    const token = sessionToken;
    sessionToken = newPlacesSessionToken(); // Details closes the billing session

    const fields = partFields();
    const hasPartFields = Boolean(
      fields.suburb || fields.state || fields.postcode,
    );
    // Nothing to gain from the extra billable call when the form is a single
    // address box and doesn't need coordinates.
    if (!hasPartFields && !isQuote) return;

    const params = new URLSearchParams({
      place_id: prediction.place_id,
      sessiontoken: token,
    });

    try {
      const resp = await fetch(`/api/place-details?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const result = data && data.result;
      if (!result) return;

      // A picked suggestion gives exact coordinates, so /api/roof-quote can
      // skip its fallback geocode.
      if (
        isQuote &&
        typeof result.lat === "number" &&
        typeof result.lng === "number"
      ) {
        window.__quoteAutoLat = result.lat;
        window.__quoteAutoLng = result.lng;
      }

      if (!hasPartFields) return;

      // The street line stays in this input and the rest move to their own
      // fields, so the suburb doesn't end up duplicated across both. Assigning
      // value directly (no input event) avoids re-opening the dropdown.
      if (result.street_address) input.value = result.street_address;

      setAddressPartField(fields.suburb, result.suburb);
      setAddressPartField(fields.state, result.state);
      setAddressPartField(fields.postcode, result.postcode);
    } catch (err) {
      /* details unavailable — the full description already in the field stands */
    }
  }

  function render(preds) {
    predictions = preds;
    activeIdx = -1;
    list.innerHTML = "";
    if (!preds.length) {
      hide();
      return;
    }
    preds.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "addr-ac-item";
      li.setAttribute("role", "option");
      li.textContent = p.description; // textContent → XSS-safe
      // mousedown (not click) so selection runs before the input's blur hides the list
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(i);
      });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  async function query(value) {
    const mySeq = ++seq;
    if (controller) controller.abort();
    controller = new AbortController();
    const params = new URLSearchParams({ input: value, sessiontoken: sessionToken });
    try {
      const resp = await fetch(`/api/places-autocomplete?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (mySeq !== seq) return; // a newer keystroke superseded this request
      if (!resp.ok) {
        hide();
        return;
      }
      const data = await resp.json();
      if (mySeq !== seq) return;
      const preds =
        data && Array.isArray(data.predictions) ? data.predictions : [];
      render(preds);
    } catch (err) {
      // Network/abort/parse error → degrade silently, never a dialog.
      if (err && err.name !== "AbortError") hide();
    }
  }

  input.addEventListener("input", () => {
    clearQuoteCoords();
    const value = input.value.trim();
    clearTimeout(debounceId);
    if (value.length < 3) {
      if (controller) controller.abort();
      seq++; // invalidate any in-flight request
      hide();
      return;
    }
    debounceId = setTimeout(() => query(value), 250);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden || !predictions.length) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((activeIdx + 1) % predictions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((activeIdx - 1 + predictions.length) % predictions.length);
        break;
      case "Enter":
        // Only intercept Enter when a suggestion is highlighted; otherwise
        // let the form submit normally.
        if (activeIdx >= 0) {
          e.preventDefault();
          choose(activeIdx);
        } else {
          hide();
        }
        break;
      case "Escape":
        hide();
        break;
    }
  });

  // Delay so a click/tap on a suggestion registers before the list hides.
  input.addEventListener("blur", () => setTimeout(hide, 150));
}
