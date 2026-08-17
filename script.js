/* ============================================
   ASCEND ROOFING GROUP — JavaScript
   Smooth scroll, nav, animations, counters
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // ---- SCROLL REVEAL ----
  // First, deliberately. Everything with [data-reveal] is hidden by CSS until
  // this runs, and that is most of the page — so if anything below throws,
  // the reader must not be left staring at a blank page.
  const revealElements = document.querySelectorAll("[data-reveal]");
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
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

  // Below the drawer breakpoint the menu is an off-canvas panel pushed off-screen
  // by a transform — still focusable, so keyboard users tabbed through eight
  // invisible links. `inert` takes it out of the tab order and the accessibility
  // tree while closed. Above the breakpoint it is the ordinary horizontal nav and
  // must stay reachable, so this is re-evaluated whenever the layout can change.
  const isDrawer = () => getComputedStyle(navToggle).display !== "none";

  const syncDrawerInert = () => {
    if (isDrawer() && !navMenu.classList.contains("open")) {
      navMenu.setAttribute("inert", "");
    } else {
      navMenu.removeAttribute("inert");
    }
  };

  const closeNav = () => {
    // Move focus out before the panel goes inert, otherwise the browser drops it
    // to <body> and the next Tab restarts from the top of the document.
    if (navMenu.contains(document.activeElement)) navToggle.focus();
    navToggle.classList.remove("open");
    navMenu.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    if (navOverlay) navOverlay.classList.remove("active");
    document.body.style.overflow = "";
    syncDrawerInert();
  };

  const openNav = () => {
    navToggle.classList.add("open");
    navMenu.classList.add("open");
    navToggle.setAttribute("aria-expanded", "true");
    if (navOverlay) navOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
    syncDrawerInert();
    // The drawer covers the page behind a scrim, so send focus into it rather
    // than leaving it on the toggle with the rest of the page still tabbable.
    const first = navMenu.querySelector('a[href], button:not([disabled])');
    if (first) first.focus();
  };

  // The drawer behaves as a modal, so Tab must cycle within it instead of
  // wandering onto page content hidden behind the scrim.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !navMenu.classList.contains("open")) return;
    const items = [
      navToggle,
      ...navMenu.querySelectorAll('a[href], button:not([disabled])'),
    ];
    if (items.length < 2) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  syncDrawerInert();

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
    // Crossing the breakpoint changes whether the menu is a drawer or the
    // desktop nav, so its inert state has to be re-evaluated either way.
    syncDrawerInert();
  });

  // ---- ACTIVE NAV LINK ON SCROLL ----
  const sections = document.querySelectorAll("section[id]");
  const navLinks = navMenu.querySelectorAll("a:not(.nav-cta)");

  // Only sections a nav link actually points at can be "current". Spying on every
  // section[id] meant scrolling into one with no link (#gallery, #process,
  // #why-us, #team) ran the toggle with false for every link and blanked the
  // highlight — so which link lit up depended on the path taken, not the position.
  const linkByTarget = new Map();
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#") && href.length > 1) {
      linkByTarget.set(href.slice(1), link);
    }
  });
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const spiedSections = [...sections]
    .filter((section) => linkByTarget.has(section.id))
    .sort((a, b) => docTop(a) - docTop(b));

  // offsetTop is relative to the offset parent, and the old +120 was a guess at
  // the header height. Measure the header instead so the line sits just under it.
  const headerOffset = () => {
    const header = document.querySelector(".t-header, .navbar");
    return (header ? header.getBoundingClientRect().height : 120) + 8;
  };

  // Screen readers take the current item from aria-current, not from a CSS class,
  // so the two are kept in step. Only the spied links are touched: the generated
  // pages mark a cross-page item (Blog, Areas) active in the markup, and that is
  // not this function's to move.
  const spiedLinks = [...linkByTarget.values()];
  const markCurrent = (link, on) => {
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  };

  const updateActiveNav = () => {
    if (!spiedSections.length) return;
    const line = window.scrollY + headerOffset();
    let current = null;
    for (const section of spiedSections) {
      if (docTop(section) <= line) current = section;
      else break;
    }
    // The final section can be shorter than the viewport, so it never reaches the
    // line. At the bottom of the document it is the one being read.
    if (
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 2
    ) {
      current = spiedSections[spiedSections.length - 1];
    }
    // Above the first spied section nothing is current. Suburb pages link only
    // #contact, far down the page — defaulting to the first section lit "Contact
    // Us" from page load on all 314 of them.
    const active = current ? linkByTarget.get(current.id) : null;
    spiedLinks.forEach((link) => markCurrent(link, link === active));
  };
  window.addEventListener("scroll", updateActiveNav, { passive: true });
  // Set the initial state rather than trusting the class baked into the markup,
  // which is wrong whenever the page is opened at a hash or restored mid-scroll.
  updateActiveNav();

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

/* ============================================
   LIVE GOOGLE REVIEWS
   ------------------------------------------------
   The header rating and the review rail were hard
   to keep honest: a number typed into the markup
   is stale the moment another review lands, and an
   unverified one should never be published at all.
   Both now come from /api/google-reviews, which
   reads the Business Profile.

   Everything here is additive. If the endpoint is
   unconfigured, rate-limited or failing, the rating
   stays hidden and the rail keeps the representative
   quotes already in the HTML.
   ============================================ */
(function initGoogleReviews() {
  const ratingEl = document.getElementById("googleRating");
  const rail = document.getElementById("reviewRail");
  if (!ratingEl && !rail) return;

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);

  const stars = (n) => "★★★★★".slice(0, Math.max(0, Math.round(n))) +
                       "☆☆☆☆☆".slice(0, 5 - Math.max(0, Math.round(n)));

  fetch("/api/google-reviews", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !data.available) return;

      if (ratingEl && typeof data.rating === "number") {
        ratingEl.querySelector("[data-gr-rating]").textContent = data.rating.toFixed(1);
        ratingEl.querySelector("[data-gr-stars]").textContent = stars(data.rating);
        ratingEl.querySelector("[data-gr-total]").textContent = data.total;
        if (data.profileUrl) {
          ratingEl.href = data.profileUrl;
          ratingEl.target = "_blank";
        }
        ratingEl.hidden = false;
      }

      // Only replace the fallback quotes when there are enough real ones to
      // fill the rail; a single live review beside two placeholders would
      // read as inconsistent.
      if (rail && Array.isArray(data.reviews) && data.reviews.length >= 3) {
        const tilt = ["t-review-card t-tilt-l", "t-review-card t-feature", "t-review-card t-tilt-r"];
        rail.innerHTML = data.reviews.slice(0, 3).map((rev, i) => `
                <div class="${tilt[i]}">
                    <div class="t-stars" aria-hidden="true">${stars(rev.rating || 5)}</div>
                    <div class="t-who">${escapeHtml(rev.author)}${rev.when ? " &middot; " + escapeHtml(rev.when) : ""}</div>
                    <p>${escapeHtml(rev.text)}</p>
                </div>`).join("");
        rail.removeAttribute("data-gr-fallback");

        const subtitle = document.querySelector("[data-gr-subtitle]");
        if (subtitle) {
          subtitle.innerHTML = data.profileUrl
            ? `Recent reviews from our <a href="${escapeHtml(data.profileUrl)}" target="_blank" rel="noopener">Google Business Profile</a>.`
            : "Recent reviews from our Google Business Profile.";
        }
      }
    })
    .catch(() => {
      /* keep the page exactly as served */
    });
})();
