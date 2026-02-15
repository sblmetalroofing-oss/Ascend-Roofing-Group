/* ============================================
   ASCEND ROOFING GROUP — JavaScript
   Smooth scroll, nav, animations, counters
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ---- NAVBAR SCROLL EFFECT ----
    const navbar = document.getElementById('navbar');
    const handleNavScroll = () => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll();

    // ---- MOBILE NAV TOGGLE ----
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('open');
        navMenu.classList.toggle('open');
        document.body.style.overflow = navMenu.classList.contains('open') ? 'hidden' : '';
    });

    // Close mobile nav on link click
    navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('open');
            navMenu.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    // ---- ACTIVE NAV LINK ON SCROLL ----
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link:not(.nav-cta)');

    const updateActiveNav = () => {
        const scrollY = window.scrollY + 120;
        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');
            if (scrollY >= top && scrollY < top + height) {
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    };
    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // ---- SCROLL REVEAL ----
    const revealElements = document.querySelectorAll('[data-reveal]');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Stagger reveal if inside a grid
                const parent = entry.target.parentElement;
                const siblings = parent.querySelectorAll('[data-reveal]');
                let delay = 0;
                if (siblings.length > 1) {
                    const idx = Array.from(siblings).indexOf(entry.target);
                    delay = idx * 100;
                }
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // ---- STATS COUNTER ANIMATION ----
    const statNumbers = document.querySelectorAll('[data-count]');
    let statsAnimated = false;

    const animateCounters = () => {
        if (statsAnimated) return;
        statsAnimated = true;

        statNumbers.forEach(el => {
            const target = parseInt(el.dataset.count);
            const duration = 2000;
            const startTime = performance.now();

            const easeOutQuad = t => t * (2 - t);

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
    const statsSection = document.querySelector('.hero-stats');
    if (statsSection) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateCounters();
                statsObserver.disconnect();
            }
        }, { threshold: 0.5 });
        statsObserver.observe(statsSection);
    }

    // ---- SMOOTH SCROLL (for browsers that need it) ----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ---- CONTACT FORM HANDLER ----
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = document.getElementById('submitBtn');
            const originalHTML = btn.innerHTML;
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
                const response = await fetch('/api/submit-quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    const wrapper = contactForm.parentElement;
                    wrapper.innerHTML = `
                        <div class="form-success">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="9 12 12 15 16 9"/>
                            </svg>
                            <h3>Quote Request Sent!</h3>
                            <p>Thanks for reaching out, ${data.name.split(' ')[0]}. We'll get back to you within 24 hours.</p>
                        </div>
                    `;
                } else {
                    throw new Error('Network response was not ok');
                }
            } catch (error) {
                console.error('Error:', error);
                btn.innerHTML = originalHTML;
                btn.disabled = false;
                alert('Something went wrong. Please call us directly at 0490 196 284.');
            }
        });
    }

    // ---- SPIN ANIMATION FOR LOADING ----
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
    `;
    document.head.appendChild(style);

});
