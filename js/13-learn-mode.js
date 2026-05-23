/* === SCSU app — Part 13: Learn mode (self-contained IIFE) === */
/* ===========================================================
   LEARN MODE
   -----------------------------------------------------------
   The Explore/Learn pill in the header swaps which "shell" is
   visible. Explore is the existing map experience; Learn shows
   a course catalog (left list, right detail). Course content is
   read from window.SCSU_DATA.courses, populated by data/courses.js.

   This block is intentionally self-contained — it doesn't reach
   into the map module beyond the small `setAppMode` call. If
   data/courses.js fails to load, the page degrades to an empty
   list with a friendly message (the script tag has onerror and
   the array fallback below ensures we never throw).
   =========================================================== */
(function initLearnMode() {
  const courses = (window.SCSU_DATA && window.SCSU_DATA.courses) || [];

  // Cache learn-mode DOM. None of these are required for Explore
  // to function — if the markup is missing for any reason, every
  // method below quietly no-ops.
  const L = {
    shell:        document.getElementById("learnShell"),
    list:         document.getElementById("courseList"),
    count:        document.getElementById("coursesCount"),
    empty:        document.getElementById("courseEmpty"),
    body:         document.getElementById("courseBody"),
    actions:      document.getElementById("courseActions"),
    heroStamp:    document.getElementById("courseHeroStamp"),
    hero:      document.getElementById("courseHero"),
    code:         document.getElementById("courseCode"),
    credits:      document.getElementById("courseCredits"),
    updated:      document.getElementById("courseUpdated"),
    title:        document.getElementById("courseTitle"),
    lede:         document.getElementById("courseLede"),
    overview:     document.getElementById("courseOverview"),
    curriculum:   document.getElementById("courseCurriculum"),
    beginBtn:     document.getElementById("courseBeginBtn"),
    back:         document.getElementById("courseBack"),
    vr:           document.getElementById("courseVr"),
    vrHelp:       document.getElementById("courseVrHelp"),
    vrTooltip:    document.getElementById("courseVrTooltip"),
    vrNote:       document.getElementById("courseVrNote")
  };

  // Bail if the Learn shell isn't in the DOM. We still expose
  // setAppMode below so the click handler doesn't error out;
  // it'll just no-op the learn half.
  if (!L.shell) {
    window.setAppMode = function (mode) {
      document.body.classList.toggle("mode-learn", mode === "learn");
    };
    return;
  }

  /* ---- Quest / XR detection (local to Learn mode) ----
     Explore mode has its own UA + WebXR detection in 01-utils.js,
     but that file's helpers are not exported by name and we want
     Learn mode to stay self-contained. So we inline a small UA-only
     check here. Same tokens as `isXRUserAgent()` in 01-utils.js:
     OculusBrowser appears in every Meta Quest Browser UA (mobile
     or desktop mode), and `Pico` catches Pico headsets.

     We deliberately don't await navigator.xr.isSessionSupported()
     here — that's an async signal, and the Begin Course click
     handler must call window.open() synchronously inside the
     user-gesture frame or popup blockers will kill the new tab.
     The UA check is enough to route Quest browsers correctly. */
  function isQuestUA() {
    try {
      const ua = (navigator.userAgent || "").toString();
      return /OculusBrowser|Quest\s|Quest\)| VR |Mobile VR|Pico/i.test(ua);
    } catch (_) {
      return false;
    }
  }

  /* ---- Pick the right EON launch URL for the current device ----
     Quest → vrUrl when present, else fall back to desktopUrl so
     headset users still get *something* useful. Desktop / tablet
     / phone → desktopUrl always.
     Returns null if the course has no EON target at all, which
     is how callers know to disable the button. */
  function pickEonUrl(course) {
    const eon = course && course.eon;
    if (!eon) return null;
    if (isQuestUA() && eon.vrUrl) return eon.vrUrl;
    return eon.desktopUrl || eon.vrUrl || null;
  }

  let activeCourseId = null;

  /* ---- Render: course list ---- */
  function renderCourseList() {
    if (!L.list) return;
    L.list.innerHTML = "";
    if (L.count) L.count.textContent = String(courses.length);

    if (!courses.length) {
      const empty = document.createElement("li");
      empty.className = "locations-empty";          // reuses existing style
      empty.textContent = "No courses available yet.";
      L.list.appendChild(empty);
      return;
    }

    courses.forEach((c) => {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "course-row";
      btn.dataset.courseId = c.id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", "false");

      const text = document.createElement("div");
      text.className = "course-row-text";
      const name = document.createElement("div");
      name.className = "course-row-name";
      name.textContent = c.title || "(untitled)";
      const code = document.createElement("div");
      code.className = "course-row-code";
      code.textContent = c.code || "";
      text.appendChild(name);
      text.appendChild(code);

      const chev = document.createElement("span");
      chev.className = "course-row-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "›";

      btn.appendChild(text);
      btn.appendChild(chev);
      btn.addEventListener("click", () => selectCourse(c.id));

      li.appendChild(btn);
      L.list.appendChild(li);
    });
  }

  /* ---- Render: course detail panel ---- */
  function renderCourseDetail(course) {
    if (!course) {
      // No selection — show empty state, hide article AND the
      // persistent action bar (it has no course to act on).
      if (L.empty)   L.empty.style.display = "";
      if (L.body)    L.body.hidden = true;
      if (L.actions) L.actions.hidden = true;
      return;
    }

    if (L.empty)   L.empty.style.display = "none";
    if (L.body)    L.body.hidden = false;
    if (L.actions) L.actions.hidden = false;

    if (L.code)     L.code.textContent     = course.code || "";
    if (L.credits)  L.credits.textContent  = course.credits || "";
    if (L.updated)  L.updated.textContent  = course.lastUpdated || "—";
    if (L.title)    L.title.textContent    = course.title || "";
    if (L.lede)     L.lede.textContent     = course.lede || "";
    if (L.overview) L.overview.textContent = course.overview || "";

    // Hero — bind real artwork if the course has an `image` field;
    // otherwise fall back to the watermarked placeholder. Mirrors
    // the .details-image.has-image bind used in Explore mode so
    // the two modes stay visually consistent.
    if (L.hero) {
      // Reset to placeholder state first so navigating between
      // courses doesn't leave a stale <img> behind.
      L.hero.classList.remove("has-image");
      const oldImg = L.hero.querySelector("img");
      if (oldImg) oldImg.remove();

      if (course.image) {
        const img = document.createElement("img");
        img.src = course.image;
        img.alt = course.title || "";
        // If the file 404s, drop back to the placeholder.
        img.onerror = () => {
          L.hero.classList.remove("has-image");
          img.remove();
        };
        L.hero.appendChild(img);
        L.hero.classList.add("has-image");
      }
    }

    // Hero watermark — still set even when an image is bound, so
    // the placeholder is correct if the image fails to load.
    if (L.heroStamp) {
      const stamp = (course.code || "").replace(/\s+/g, "");
      L.heroStamp.textContent = stamp;
    }

    if (L.curriculum) {
      L.curriculum.innerHTML = "";
      (course.curriculum || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        L.curriculum.appendChild(li);
      });
    }

    // VR-Enabled chip + tooltip.
    // The chip shows when either:
    //   • the course has an EON VR launch URL (`eon.vrUrl`), OR
    //   • the course has an explicit `immersive` block.
    // The tooltip prose comes from `immersive.note` when present,
    // falling back to a generic line so courses with only an EON
    // VR URL still get a sensible tooltip.
    const imm        = course.immersive;
    const hasEonVr   = !!(course.eon && course.eon.vrUrl);
    const isImmersive = hasEonVr || !!imm;
    if (L.vr) {
      if (isImmersive) {
        L.vr.hidden = false;
        if (L.vrNote) {
          L.vrNote.textContent =
            (imm && imm.note) ||
            "Sign in to EON Reality in your headset to enter the " +
            "immersive version of this course.";
        }
      } else {
        L.vr.hidden = true;
        hideVrTooltip();
      }
    }

    // Begin Course CTA — hand off to EON Reality's login page.
    // EON's login wall will catch the user and redirect them to
    // the course after auth. Quest UA → vrUrl (if defined),
    // everything else → desktopUrl. No EON target on the course
    // at all → button is disabled with an explanatory title.
    if (L.beginBtn) {
      const targetUrl = pickEonUrl(course);
      const canLaunch = !!targetUrl;

      L.beginBtn.disabled = !canLaunch;
      L.beginBtn.setAttribute("aria-disabled", canLaunch ? "false" : "true");
      L.beginBtn.title = canLaunch
        ? "Sign in to EON Reality to begin this course"
        : "Course launch coming soon";

      L.beginBtn.onclick = () => {
        if (!canLaunch) return;
        // window.open MUST run synchronously inside the click
        // handler — any await/setTimeout in front of it will get
        // the popup blocked. The Quest-vs-desktop URL is already
        // resolved above, so this stays a one-liner.
        //window.open(targetUrl, "_blank", "noopener");
        window.location.href = targetUrl;
      };
    }
  }

  /* ---- Selection ---- */
  function selectCourse(id) {
    const course = courses.find((c) => c.id === id);
    activeCourseId = course ? course.id : null;

    // Update list active state
    if (L.list) {
      L.list.querySelectorAll(".course-row").forEach((row) => {
        const isActive = row.dataset.courseId === activeCourseId;
        row.classList.toggle("is-active", isActive);
        row.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    renderCourseDetail(course);

    // Mobile: slide the detail pane in over the list.
    L.shell.classList.toggle("has-detail", !!course);

    // Move keyboard focus to the detail title for screen-reader
    // users coming from the list. Only on small screens — on
    // desktop the list stays in focus so arrow-keying through
    // courses is smooth.
    if (course && isMobile() && L.title) {
      L.title.setAttribute("tabindex", "-1");
      L.title.focus({ preventScroll: false });
    }
  }

  /* ---- VR tooltip toggle ---- */
  function showVrTooltip() {
    if (!L.vrTooltip) return;
    L.vrTooltip.classList.add("is-open");
    L.vrTooltip.setAttribute("aria-hidden", "false");
    if (L.vrHelp) L.vrHelp.setAttribute("aria-expanded", "true");
  }
  function hideVrTooltip() {
    if (!L.vrTooltip) return;
    L.vrTooltip.classList.remove("is-open");
    L.vrTooltip.setAttribute("aria-hidden", "true");
    if (L.vrHelp) L.vrHelp.setAttribute("aria-expanded", "false");
  }

  if (L.vrHelp) {
    L.vrHelp.setAttribute("aria-expanded", "false");
    L.vrHelp.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = L.vrTooltip && L.vrTooltip.classList.contains("is-open");
      if (open) hideVrTooltip(); else showVrTooltip();
    });
    // Click-away to dismiss
    document.addEventListener("click", (e) => {
      if (!L.vrTooltip || !L.vrTooltip.classList.contains("is-open")) return;
      if (e.target === L.vrHelp || L.vrTooltip.contains(e.target)) return;
      hideVrTooltip();
    });
    // Escape to dismiss
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && L.vrTooltip &&
          L.vrTooltip.classList.contains("is-open")) {
        hideVrTooltip();
      }
    });
  }

  /* ---- Mobile back button — return to list view ---- */
  if (L.back) {
    L.back.addEventListener("click", () => {
      L.shell.classList.remove("has-detail");
      hideVrTooltip();
    });
  }

  /* ---- App-mode switcher (called by the .mode-btn handler) ---- */
  window.setAppMode = function (mode) {
    const learn = mode === "learn";
    document.body.classList.toggle("mode-learn", learn);

    L.shell.setAttribute("aria-hidden", learn ? "false" : "true");

    // Mirror sane defaults each time we enter Learn.
    if (learn) {
      // On desktop, auto-pick the first course so the right
      // pane isn't empty. On mobile we keep the list view.
      if (!activeCourseId && !isMobile() && courses.length) {
        selectCourse(courses[0].id);
      }
    } else {
      // Leaving Learn — collapse any open mobile detail and
      // dismiss the VR tooltip so it doesn't reopen on return.
      L.shell.classList.remove("has-detail");
      hideVrTooltip();
    }
  };

  // Initial render — list is built once at boot, detail stays
  // empty until the user (or setAppMode) picks a course.
  renderCourseList();
})();
