/* === SCSU app — Part 12: Start screen + coachmark walkthrough === */
/* ============================================================
   START SCREEN + COACHMARK WALKTHROUGH
   ------------------------------------------------------------
   First-run welcome modal with two paths:

     • "Enter Experience" — dismisses the modal; the user
       gets the campus map in its default state.
     • "How to Use"       — runs a 3-step coachmark sequence
       that highlights the left sidebar, the top bar, and the
       right details panel.

   The coachmark sequence starts by selecting the first tour
   stop (Crawford-Zimmerman) so the right details panel is
   populated with real content the user can see being pointed
   to. When the walkthrough finishes (final step's "next" or
   the X button), we clear that selection and reset the
   campus view so the app is back to its untouched state.

   The walkthrough is also reachable from the burger menu's
   "How to use" link at any time after the initial visit.
   ============================================================ */
(function setupOnboarding() {
  // Pull the DOM nodes once. If any are missing we silently
  // disable the feature rather than throw — the rest of the
  // app should still work.
  const startScreen   = document.getElementById("startScreen");
  const startEnterBtn = document.getElementById("startEnterBtn");
  const startHowBtn   = document.getElementById("startHowToUseBtn");

  const overlay     = document.getElementById("coachmarkOverlay");
  const card        = document.getElementById("coachmarkCard");
  const ring        = document.getElementById("coachmarkRing");
  const titleEl     = document.getElementById("coachmarkTitle");
  const bodyEl      = document.getElementById("coachmarkBody");
  const prevBtn     = document.getElementById("coachmarkPrev");
  const nextBtn     = document.getElementById("coachmarkNext");
  const closeBtn    = document.getElementById("coachmarkClose");
  const currentEl   = document.getElementById("coachmarkCurrent");
  const totalEl     = document.getElementById("coachmarkTotal");
  const burgerHowTo = document.getElementById("burgerHowToUse");
  const burgerCheckbox = document.getElementById("burgerToggle");

  // New: the two mirrored controls for the "show start screen
  // on startup" preference. The start-screen one is worded
  // negatively ("Don't show again") so its `checked` state is
  // INVERTED relative to the underlying preference.
  const suppressCheckbox = document.getElementById("startScreenSuppress");
  const startupSwitch    = document.getElementById("burgerShowStartScreen");

  // Mirrored controls for the "show 3D navigation instructions"
  // preference. Same pattern: modal checkbox is inverted, burger
  // switch is direct. Separate localStorage key so the two
  // settings don't conflict.
  const navModal           = document.getElementById("navInstructions");
  const navGotItBtn        = document.getElementById("navInstructionsGotIt");
  const navSuppressCheckbox = document.getElementById("navInstructionsSuppress");
  const navInstructionsSwitch = document.getElementById("burgerShowNavInstructions");

  if (!startScreen || !overlay || !card) {
    console.warn("[onboarding] required nodes missing — disabled");
    return;
  }

  /* -- Preferences ------------------------------------------
     Two independent settings, both stored in localStorage:
       • scsu:showStartScreen   — welcome window on boot
       • scsu:showNavInstructions — 3D nav modal on first
                                    Explore click of a session
     Both default to "show" (true) when no value is stored.
     The same read/write helpers handle both, parameterized by
     storage key. --------------------------------------------- */
  const PREF_KEY = "scsu:showStartScreen";
  const NAV_PREF_KEY = "scsu:showNavInstructions";

  function readPref(key) {
    try {
      const v = localStorage.getItem(key);
      // Default to true when nothing is stored yet.
      return v === null ? true : v === "1";
    } catch (_) {
      // localStorage can throw in private mode / sandboxed
      // contexts — fall back to "always show".
      return true;
    }
  }

  function writePref(key, show) {
    try {
      localStorage.setItem(key, show ? "1" : "0");
    } catch (_) {
      // Silent — preference just won't persist this session.
    }
  }

  // Backwards-compatible aliases so the existing showStartScreen
  // call sites don't need to change.
  function readShowOnStartup()        { return readPref(PREF_KEY); }
  function writeShowOnStartup(show)   { writePref(PREF_KEY, show); }
  function readShowNavInstructions()  { return readPref(NAV_PREF_KEY); }
  function writeShowNavInstructions(show) { writePref(NAV_PREF_KEY, show); }

  // Push current preferences into all four controls. Called
  // at init and whenever any control changes so its mirror
  // stays in sync.
  function syncPrefControls() {
    const showStart = readShowOnStartup();
    if (suppressCheckbox) suppressCheckbox.checked = !showStart; // inverted
    if (startupSwitch)    startupSwitch.checked    = showStart;

    const showNav = readShowNavInstructions();
    if (navSuppressCheckbox)  navSuppressCheckbox.checked  = !showNav; // inverted
    if (navInstructionsSwitch) navInstructionsSwitch.checked = showNav;
  }

  // The four edge masks that collectively dim everything around
  // the highlighted target rectangle.
  const masks = {
    top:    overlay.querySelector('[data-mask="top"]'),
    right:  overlay.querySelector('[data-mask="right"]'),
    bottom: overlay.querySelector('[data-mask="bottom"]'),
    left:   overlay.querySelector('[data-mask="left"]')
  };

  /* -- Step definitions ------------------------------------
     `getRect()` returns the on-screen rect of the element to
     highlight. We resolve it lazily per-step so a layout shift
     between steps (e.g. details panel opening) is reflected.
     `placement` controls which side of the highlight the card
     sits on. ------------------------------------------------- */
     const STEPS = [
      {
        id: "left-sidebar",
        desktop: {
          title: "Locations Sidebar",
          body: "Browse all campus locations here. Search for buildings or " +
                "courses and tap to find out more about them, or simply take " +
                "a guided tour at bottom left. ",
          getRect: () => {
            const node = document.getElementById("locations");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "right"
        },
        mobile: {
          title: "Locations Menu",
          body: "Tap the Locations button to open the full list of all campus " +
                "locations here. Search for buildings or courses and tap to find " +
                "out more about them, or simply take a guided tour at bottom left. ",
          getRect: () => {
            const node = document.getElementById("locationsToggle");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        }
      },
      {
        id: "top-bar",
        desktop: {
          title: "Experience Toggle",
          body:"Choose Explore to discover SCSU or to find something specific; " +
               "choose Learn to access all immersive coursework available to you.",

          getRect: () => {
            const node = document.querySelector(".metabar");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        },
        mobile: {
          title: "Experience Toggle",
          body:"Choose Explore to discover SCSU or to find something specific; " +
               "choose Learn to access all immersive coursework available to you.",
          getRect: () => {
            const node = document.querySelector(".metabar");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "bottom"
        }
      },
      {
        id: "right-panel",
        desktop: {
          title: "Location Details",
          body: "Choose any location to see its details here. Tap Explore " +
                "to drop into an immersive street view (where available). " +
                "Explorable locations are shortcuts. ",

          getRect: () => {
            const node = document.getElementById("details");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "left"
        },
        mobile: {
          title: "Location Details",
          body: "Choose any location to see its details here. Tap Explore " +
                "to drop into an immersive street view (where available). " +
                "Explorable locations are shortcuts. ",
          getRect: () => {
            const node = document.getElementById("details");
            return node ? node.getBoundingClientRect() : null;
          },
          placement: "top"     // card sits ABOVE the bottom sheet on mobile
        }
      }
    ];

  let stepIndex = 0;
  let active    = false;
  let resizeRaf = 0;
  let prevFocus = null;

  /* -- Layout helpers ---------------------------------------
     positionCutout() applies inline geometry to the four mask
     rectangles so they cover everything except the supplied
     target rect. positionCard() places the tooltip relative
     to that rect and chooses an arrow orientation that points
     at the target. --------------------------------------- */

  function positionCutout(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect || rect.width === 0 || rect.height === 0) {
      // No measurable target — fully dim the screen and skip
      // the ring. The card will fall back to centered.
      masks.top.style.cssText    = "top:0;left:0;width:100%;height:100%";
      masks.right.style.cssText  = "top:0;left:0;width:0;height:0";
      masks.bottom.style.cssText = "top:0;left:0;width:0;height:0";
      masks.left.style.cssText   = "top:0;left:0;width:0;height:0";
      ring.style.display = "none";
      return;
    }

    // No padding: the cutout hugs the target's actual bounds so
    // the dim edges align cleanly with each panel (sidebar, top
    // bar, details panel) rather than spilling onto neighbouring
    // chrome. The ring itself is now invisible (see 08-start-
    // coachmark.css) so any spill would have nothing to mask it.
    const pad = 0;
    const x  = Math.max(0, rect.left   - pad);
    const y  = Math.max(0, rect.top    - pad);
    const w  = Math.min(vw - x, rect.width  + pad * 2);
    const h  = Math.min(vh - y, rect.height + pad * 2);

    // Top strip — full width, from 0 to y
    masks.top.style.top    = "0";
    masks.top.style.left   = "0";
    masks.top.style.width  = vw + "px";
    masks.top.style.height = y + "px";

    // Bottom strip — full width, from y+h to vh
    masks.bottom.style.top    = (y + h) + "px";
    masks.bottom.style.left   = "0";
    masks.bottom.style.width  = vw + "px";
    masks.bottom.style.height = Math.max(0, vh - (y + h)) + "px";

    // Left strip — only the band beside the cutout
    masks.left.style.top    = y + "px";
    masks.left.style.left   = "0";
    masks.left.style.width  = x + "px";
    masks.left.style.height = h + "px";

    // Right strip — only the band beside the cutout
    masks.right.style.top    = y + "px";
    masks.right.style.left   = (x + w) + "px";
    masks.right.style.width  = Math.max(0, vw - (x + w)) + "px";
    masks.right.style.height = h + "px";

    // Subtle outline on the cutout itself
    ring.style.display = "block";
    ring.style.top    = y + "px";
    ring.style.left   = x + "px";
    ring.style.width  = w + "px";
    ring.style.height = h + "px";
  }

  function positionCard(rect, placement) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = card.offsetWidth  || 360;
    const cardH = card.offsetHeight || 180;
    const gap   = 18;
    const edge  = 16;

    let top, left, arrow = "none";

    if (!rect || rect.width === 0 || rect.height === 0) {
      // Centered fallback
      top  = Math.max(edge, (vh - cardH) / 2);
      left = Math.max(edge, (vw - cardW) / 2);
      card.dataset.arrow = "none";
      card.style.top  = top  + "px";
      card.style.left = left + "px";
      return;
    }

    // Pick the placement, then clamp into viewport with a tiny
    // edge margin so the card never sits off-screen.
    switch (placement) {
      case "right":
        left  = rect.right + gap;
        top   = rect.top   + Math.min(40, rect.height / 2 - 24);
        arrow = "left";
        break;
      case "left":
        left  = rect.left - gap - cardW;
        top   = rect.top   + Math.min(40, rect.height / 2 - 24);
        arrow = "right";
        break;
      case "bottom":
        left  = rect.left + Math.min(40, rect.width / 2 - 24);
        top   = rect.bottom + gap;
        arrow = "top";
        break;
      case "top":
      default:
        left  = rect.left + Math.min(40, rect.width / 2 - 24);
        top   = rect.top - gap - cardH;
        arrow = "bottom";
        break;
    }

    // If the chosen placement runs off-screen, fall back to a
    // centered (no-arrow) position rather than clamping the
    // card on top of the highlight.
    const fitsHoriz = left >= edge && (left + cardW) <= (vw - edge);
    const fitsVert  = top  >= edge && (top  + cardH) <= (vh - edge);

    if (!fitsHoriz || !fitsVert) {
      // Try to keep the original axis intent if possible.
      if (placement === "right" || placement === "left") {
        // Horizontal placement failed — center horizontally,
        // place under the target.
        left  = Math.max(edge, Math.min(vw - cardW - edge, (vw - cardW) / 2));
        top   = rect.bottom + gap;
        if (top + cardH > vh - edge) {
          top = Math.max(edge, rect.top - gap - cardH);
        }
        arrow = "none";
      } else {
        // Vertical placement failed — center vertically, place
        // beside the target on whichever side has more room.
        const roomRight = vw - rect.right;
        const roomLeft  = rect.left;
        if (roomRight >= roomLeft) {
          left  = Math.min(vw - cardW - edge, rect.right + gap);
          arrow = "left";
        } else {
          left  = Math.max(edge, rect.left - gap - cardW);
          arrow = "right";
        }
        top = Math.max(edge, Math.min(vh - cardH - edge, (vh - cardH) / 2));
      }

      // Final clamp
      left = Math.max(edge, Math.min(vw - cardW - edge, left));
      top  = Math.max(edge, Math.min(vh - cardH - edge, top));
    }

    card.dataset.arrow = arrow;
    card.style.top  = top  + "px";
    card.style.left = left + "px";
  }

  function renderStep() {
    const stepBase = STEPS[stepIndex];
    if (!stepBase) return;

    // Resolve the variant for the current viewport. Fall back to
    // desktop if the mobile variant isn't defined for some step.
    const step = (isMobile() && stepBase.mobile) ? stepBase.mobile
                                                 : stepBase.desktop;

    titleEl.textContent = step.title;
    bodyEl.textContent  = step.body;
    currentEl.textContent = String(stepIndex + 1);
    totalEl.textContent   = String(STEPS.length);

    const isFirst = stepIndex === 0;
    const isLast  = stepIndex === STEPS.length - 1;
    // Always show Previous so the "X of 3" counter stays centered
    // (matches the Figma). On the first step it's disabled rather
    // than hidden so it still occupies its grid cell.
    prevBtn.hidden = false;
    prevBtn.disabled = isFirst;
    nextBtn.hidden = false;
    nextBtn.disabled = false;
    nextBtn.textContent = isLast ? "Finish" : "Next";
    nextBtn.classList.toggle("coachmark-nav-finish", isLast);

    requestAnimationFrame(() => {
      const rect = step.getRect && step.getRect();
      positionCutout(rect);
      requestAnimationFrame(() => positionCard(rect, step.placement));
    });
  }

  function onResize() {
    if (!active) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const stepBase = STEPS[stepIndex];
      if (!stepBase) return;
      const step = (isMobile() && stepBase.mobile) ? stepBase.mobile
                                                   : stepBase.desktop;
      const rect = step.getRect && step.getRect();
      positionCutout(rect);
      positionCard(rect, step.placement);
    });
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeWalkthrough();
    } else if (e.key === "ArrowRight") {
      if (stepIndex < STEPS.length - 1) {
        stepIndex += 1;
        renderStep();
      }
    } else if (e.key === "ArrowLeft") {
      if (stepIndex > 0) {
        stepIndex -= 1;
        renderStep();
      }
    }
  }

  /* -- Open / close ----------------------------------------- */

  function openWalkthrough() {
    if (active) return;
    active = true;
    stepIndex = 0;

    // Remember focus so we can restore it on close.
    prevFocus = document.activeElement;

    // Programmatically pick the first tour stop so the right
    // details panel has real content to point at. This drives
    // the same `selectFeature` path that a normal click would.
    try {
      if (Array.isArray(tourStops) && tourStops.length) {
        // goToStop already handles selecting + flying to bounds.
        goToStop(0);
      }
    } catch (err) {
      console.warn("[onboarding] could not focus first tour stop:", err);
    }

    document.body.classList.add("coachmarks-active");
    overlay.setAttribute("aria-hidden", "false");

    // Allow the details panel layout transition to settle
    // before measuring. 320ms covers the 260ms map-refresh
    // delay used elsewhere.
    setTimeout(() => {
      renderStep();
      // Move focus into the card and trap Tab navigation
      // there. We do this after renderStep so the buttons
      // hidden state for the current step is settled (the
      // first step has no Previous button so focus shouldn't
      // start there).
      try { closeBtn.focus({ preventScroll: true }); }
      catch (_) { /* ignore */ }
      installFocusTrap(card);
    }, 320);

    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
  }

  function closeWalkthrough() {
    if (!active) return;
    active = false;

    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("coachmarks-active");
    removeFocusTrap();

    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);

    // Defensive: collapse the masks/ring/card to zero size so
    // even if a browser leaves them paintable for a frame, they
    // can't swallow clicks. The CSS pointer-events guard should
    // already prevent this, but inline-style cleanup is cheap
    // insurance.
    try {
      Object.values(masks).forEach((m) => {
        m.style.cssText = "top:0;left:0;width:0;height:0";
      });
      ring.style.cssText = "display:none;top:0;left:0;width:0;height:0";
      card.style.top = "";
      card.style.left = "";
      card.dataset.arrow = "none";
    } catch (_) { /* ignore */ }

    // Reset everything we touched: clear the auto-selected
    // building, close the details panel, and put the map
    // back at the campus-wide default view.
    try { if (typeof clearSelection === "function") clearSelection(); }
    catch (err) { console.warn("[onboarding] clearSelection failed:", err); }

    try {
      if (typeof resetCampusView === "function") resetCampusView(true);
    } catch (err) {
      console.warn("[onboarding] resetCampusView failed:", err);
    }

    // Restore focus
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus({ preventScroll: true }); }
      catch (_) { /* ignore */ }
    }
    prevFocus = null;
  }

  function nextStep() {
    if (stepIndex >= STEPS.length - 1) {
      // Last step — "Next" finishes the walkthrough. Per the
      // spec, the final step's button is hidden, so this is
      // really only reachable via ArrowRight. Treat it as a
      // graceful close.
      closeWalkthrough();
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function prevStep() {
    if (stepIndex <= 0) return;
    stepIndex -= 1;
    renderStep();
  }

  /* -- Start screen ---------------------------------------- */

  /* -- Focus trap -------------------------------------------
     A modal that visually blocks the page must also block
     keyboard navigation, otherwise Tab can land focus on the
     burger button or the search input behind the dim layer.
     We install a single document-level keydown listener while
     a trap is active and bounce focus back when it tries to
     leave the trapped container.

     The trap also intercepts Tab cycling so Shift+Tab from
     the first focusable wraps to the last and vice versa,
     which is the standard accessible-modal pattern. -------- */
  let activeTrapContainer = null;

  function getFocusables(container) {
    if (!container) return [];
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(container.querySelectorAll(selector))
      .filter((node) => {
        // Skip nodes that are visually hidden — the visually-
        // hidden checkbox inputs we use under custom styling
        // are still focusable, which is what we want, so the
        // only thing we filter out here is `display: none`.
        if (node.offsetParent === null && node.getClientRects().length === 0) {
          // Allow our visually-hidden-but-focusable inputs through:
          // they have offsetParent null only when truly hidden.
          // The clip-path trick keeps offsetParent set, but the
          // CSS `clip` rect trick we use does not. Detect ours
          // by class so they stay reachable.
          if (node.matches('input[type="checkbox"]')) return true;
          return false;
        }
        return true;
      });
  }

  function onTrapKeydown(e) {
    if (e.key !== "Tab" || !activeTrapContainer) return;
    const focusables = getFocusables(activeTrapContainer);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const current = document.activeElement;

    if (e.shiftKey) {
      if (current === first || !activeTrapContainer.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (current === last || !activeTrapContainer.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function installFocusTrap(container) {
    activeTrapContainer = container;
    document.addEventListener("keydown", onTrapKeydown, true);
  }

  function removeFocusTrap() {
    activeTrapContainer = null;
    document.removeEventListener("keydown", onTrapKeydown, true);
  }

  function showStartScreen(opts) {
    // If the user has previously checked "Don't show again",
    // skip the modal on natural boots. Burger-menu re-opens
    // pass { force: true } to override.
    const force = !!(opts && opts.force);
    if (!force && !readShowOnStartup()) return;

    // Always re-sync the controls before showing — the user
    // might have toggled the burger-panel switch in a previous
    // session and we want the checkbox to reflect that state.
    syncPrefControls();

    startScreen.setAttribute("aria-hidden", "false");

    // Mark the body so any global keyboard shortcuts (Escape
    // to close panels, Shift+A for align, etc.) can opt out
    // while the modal is open.
    document.body.classList.add("modal-open");

    // Move focus into the modal for screen readers and keyboard
    // users, then trap Tab navigation inside it so the user
    // can't accidentally focus the burger button or any other
    // background control sitting visually-hidden behind the dim
    // layer.
    if (startEnterBtn) {
      requestAnimationFrame(() => {
        try { startEnterBtn.focus({ preventScroll: true }); }
        catch (_) { /* ignore */ }
      });
    }
    installFocusTrap(startScreen);
  }

  function hideStartScreen() {
    startScreen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    removeFocusTrap();
  }

  /* -- Navigation Instructions modal ------------------------
     Same modal pattern as the start screen but for the 3D
     street view onboarding. Shows the first time the user
     clicks Explore on a building's details panel (or any
     other path that opens street view), unless they've
     opted out. Single "Got it" button + "Don't show again"
     checkbox.

     Which instruction image is shown (mouse-and-keyboard vs.
     VR controllers) is driven entirely by the existing
     `body.xr-mode` class that applyTreedisProfile() in
     01-utils.js sets at boot. The CSS in 10-nav-instructions.css
     keys off that class so no JS coordination is needed here. */

  function showNavInstructions(opts) {
    if (!navModal) return false;

    const force = !!(opts && opts.force);
    if (!force && !readShowNavInstructions()) return false;

    syncPrefControls();
    navModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (navGotItBtn) {
      requestAnimationFrame(() => {
        try { navGotItBtn.focus({ preventScroll: true }); }
        catch (_) { /* ignore */ }
      });
    }
    installFocusTrap(navModal);
    return true;
  }

  function hideNavInstructions() {
    if (!navModal) return;
    navModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    removeFocusTrap();
  }

  /* -- openStreetView gating wrapper ------------------------
     The 3D nav-instructions modal must show on the first
     street-view open within a session. There are several call
     sites that open street view (the Explore CTA, the sub-list
     "Room 100"/etc rows, the locations list while inside SV,
     internal warm-ups), so the cleanest seam is the function
     itself: we monkey-patch window.openStreetView once, and
     every caller automatically goes through the gate.

     Skipped when:
       • the preference is off
       • street view is already active (mid-session navigation
         between sweeps shouldn't re-prompt)
     ------------------------------------------------------- */
  let pendingStreetViewArgs = null;
  let originalOpenStreetView = null;

  function installStreetViewGate() {
    if (typeof window.openStreetView !== "function") {
      console.warn("[onboarding] openStreetView not on window — gate disabled");
      return;
    }
    originalOpenStreetView = window.openStreetView;

    window.openStreetView = function gatedOpenStreetView() {
      const args = Array.prototype.slice.call(arguments);

      // Mid-session navigation between sweeps — skip the modal.
      if (typeof streetViewActive !== "undefined" && streetViewActive) {
        return originalOpenStreetView.apply(this, args);
      }

      // Preference says skip → straight through.
      if (!readShowNavInstructions()) {
        return originalOpenStreetView.apply(this, args);
      }

      // Cache the args, show the modal. The "Got it" handler
      // replays the call by invoking the original function
      // directly with these same arguments.
      pendingStreetViewArgs = args;
      showNavInstructions();
      // Returning undefined matches the original's signature.
    };
  }

  function replayPendingStreetView() {
    if (!pendingStreetViewArgs || !originalOpenStreetView) return;
    const args = pendingStreetViewArgs;
    pendingStreetViewArgs = null;
    try { originalOpenStreetView.apply(null, args); }
    catch (err) {
      console.warn("[onboarding] failed to replay street view:", err);
    }
  }

  // Expose to boot()
  window.showStartScreen = showStartScreen;

  /* -- Wire up event listeners ----------------------------- */

  if (startEnterBtn) {
    startEnterBtn.addEventListener("click", () => {
      hideStartScreen();
    });
  }

  if (startHowBtn) {
    startHowBtn.addEventListener("click", () => {
      hideStartScreen();
      // Brief pause so the start-screen fade-out completes
      // before the coachmark fade-in begins.
      setTimeout(openWalkthrough, 200);
    });
  }

  prevBtn.addEventListener("click", prevStep);
  nextBtn.addEventListener("click", nextStep);
  closeBtn.addEventListener("click", closeWalkthrough);

  // The burger menu's "How to use" link reopens the walkthrough.
  // We close the burger panel first by unchecking its checkbox.
  if (burgerHowTo) {
    burgerHowTo.addEventListener("click", (e) => {
      e.preventDefault();
      if (burgerCheckbox) burgerCheckbox.checked = false;
      // Wait for the panel slide-out animation (.26s) before
      // starting so the dim layer doesn't fight the slide.
      setTimeout(openWalkthrough, 280);
    });
  }

  /* -- Mirrored "show on startup" preference controls -------
     The start-screen checkbox is worded negatively
     ("Don't show again") and the burger-panel switch is worded
     positively ("Show welcome screen on startup"). They both
     write the same flag, so toggling either one immediately
     updates the other for visual consistency. -------------- */
  if (suppressCheckbox) {
    suppressCheckbox.addEventListener("change", () => {
      writeShowOnStartup(!suppressCheckbox.checked);
      syncPrefControls();
    });
  }
  if (startupSwitch) {
    startupSwitch.addEventListener("change", () => {
      writeShowOnStartup(startupSwitch.checked);
      syncPrefControls();
    });
  }

  /* -- Nav-instructions modal: button + mirrored controls -- */
  if (navGotItBtn) {
    navGotItBtn.addEventListener("click", () => {
      hideNavInstructions();
      // Replay the deferred openStreetView() call that
      // triggered this modal.
      replayPendingStreetView();
    });
  }
  if (navSuppressCheckbox) {
    navSuppressCheckbox.addEventListener("change", () => {
      writeShowNavInstructions(!navSuppressCheckbox.checked);
      syncPrefControls();
    });
  }
  if (navInstructionsSwitch) {
    navInstructionsSwitch.addEventListener("change", () => {
      writeShowNavInstructions(navInstructionsSwitch.checked);
      syncPrefControls();
    });
  }

  // Install the gate AFTER the rest of app.js has run, so
  // window.openStreetView exists. The IIFE itself runs at
  // script-load time, but openStreetView is declared at
  // top-level above this IIFE so it's already on `window`.
  installStreetViewGate();

  // Reflect any stored preference into both controls now so
  // they're correct even before the start screen ever opens.
  syncPrefControls();
})();

boot().catch((err) => {
  console.error("[metaversity] fatal:", err);
  el.splash.innerHTML =
    "<div style='font-family:monospace;padding:24px;color:#b91c1c;" +
    "text-align:center;max-width:480px'>" +
    "Failed to initialise the map:<br><br><code>" +
    String(err && err.message || err) + "</code></div>";
});
