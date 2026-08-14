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

  // Close mobile nav on link click. Two header markups are in play — the
  // legacy `.nav-link` bar (blog, 404) and the template `.t-nav-menu` drawer
  // (everywhere else), whose links carry no class. Matching on `a` covers
  // both; matching on `.nav-link` left the drawer open — and the body
  // scroll-locked — on every page built from the template.
  navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  // A drawer left open across a rotate/resize would keep the body locked
  // once the desktop nav takes over, with no visible control to close it.
  window.addEventListener("resize", () => {
    if (
      navMenu.classList.contains("open") &&
      getComputedStyle(navToggle).display === "none"
    ) {
      closeNav();
    }
  });

  // ---- ACTIVE NAV LINK ON SCROLL ----
  const sections = document.querySelectorAll("section[id]");
  const navLinks = navMenu.querySelectorAll("a:not(.nav-cta)");

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

      // The five service pages carry #contactForm but no #submitBtn, so this
      // lookup returned null and threw on .innerHTML below. preventDefault()
      // has already run by then, so the native POST fallback died with it and
      // the submission vanished silently. Fall back to the form's own submit
      // control, and treat the button as optional from here on.
      const btn =
        document.getElementById("submitBtn") ||
        contactForm.querySelector('button[type="submit"], input[type="submit"]');
      const errorEl = document.getElementById("contactError");
      const originalHTML = btn ? btn.innerHTML : "";

      if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }

      if (btn) {
        btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                    <path d="M12 2a10 10 0 1 0 10 10"/>
                </svg>
                Sending...
            `;
        btn.disabled = true;
      }

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
        if (btn) {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }
        if (errorEl) {
          errorEl.textContent = "Something went wrong. Please call us directly at 0419 098 049.";
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

  // ---- STICKY CALL BUTTON ----
  // It sat on top of the hero's own "call us" button on phones. Fade it out
  // while the hero is on screen and bring it back once the user scrolls past.
  // No JS (or no hero) leaves it visible, which is the safe default.
  const floatingCta = document.querySelector(".floating-phone-cta");
  const heroSection = document.querySelector(".t-hero, .hero");
  if (floatingCta && heroSection && "IntersectionObserver" in window) {
    const ctaObserver = new IntersectionObserver(
      (entries) => {
        floatingCta.classList.toggle("is-hidden", entries[0].isIntersecting);
      },
      { threshold: 0 },
    );
    ctaObserver.observe(heroSection);
  }
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
   ============================================ */

// Covers the contact form (#address), instant-quote form (#quoteAddress)
// and colour-confirmation form (#jobAddress) without per-page wiring.
const ADDRESS_AC_SELECTOR =
  'input[data-address-autocomplete], #address, #quoteAddress, #jobAddress, input[name="address"]';

function initAddressAutocomplete(root) {
  (root || document)
    .querySelectorAll(ADDRESS_AC_SELECTOR)
    .forEach(attachAddressAutocomplete);
}

function attachAddressAutocomplete(input) {
  if (!input || input.dataset.acBound === "1") return; // never double-bind
  input.dataset.acBound = "1";

  // The instant-quote form posts client coords to /api/roof-quote and falls
  // back to server-side geocoding when they're null. We no longer capture
  // coordinates from Google, so keep these null and let the server geocode.
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
    input.value = p.description;
    clearQuoteCoords();
    hide();
    input.focus();
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
    try {
      const resp = await fetch(
        `/api/places-autocomplete?input=${encodeURIComponent(value)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
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
