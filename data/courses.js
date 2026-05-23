/* ============================================================
   SCSU METAVERSITY — Course catalog (Learn mode) (FALLBACK SHIM)
   ------------------------------------------------------------
   ⚠️  EDITORS: this file is no longer the source of truth.
   The canonical data lives in data/courses.json. This shim is
   kept so the page still works when opened directly from disk
   (file:// origin), where fetch() can't read JSON files.

   When served over http/https, js/00-data-adapter.js fetches
   data/courses.json and overwrites whatever this shim set, so
   any edits made here are silently ignored in production.

   To regenerate this file from the JSON, run:
       node scripts/extract.js     (JSON → fresh shim)

   --- legacy header continues below ---

   Loaded via <script>, just like data/buildings.js — assigns
   into the global SCSU_DATA namespace so app.js can read it
   without a fetch (works over file:// as well as http://).

   Shape of one course entry:
     {
       id:          "nrm-342",          // stable slug, used as DOM key
       code:        "NRM 342",          // course code shown above the title
       title:       "Agronomy & Soils", // shown in the list & detail header
       credits:     "3 Course Credits", // string so "TBD" / "3 Credits" both work
       lastUpdated: "1 OCTOBER, 2026",  // free-form; rendered verbatim
       lede:        "…",                // 1–2 sentence dek under the title
       overview:    "…",                // long-form paragraph
       curriculum:  [ "…", … ],         // bullets in the right column

       // EON Reality launch targets. Begin Course hands off to one
       // of these (whichever matches the current device) so EON's
       // own login wall catches the user and redirects them into
       // the course after auth. Omit / null if the course doesn't
       // have an EON build yet — Begin Course then shows disabled.
       eon: {
         desktopUrl: "https://login.eonreality.com/…",  // browser / iPad / phone
         vrUrl:      "https://login.eonreality.com/…"   // Meta Quest / Pico
       },

       // Optional VR-Enabled chip + tooltip copy. Independent of
       // `eon` — a course can have an EON desktop build only and
       // omit this block; or have both an EON VR build *and* this
       // block, in which case the prose here drives the tooltip.
       immersive: {
         note: "In your headset, navigate to [ … ] and …"
       }
     }
   ============================================================ */
window.SCSU_DATA = window.SCSU_DATA || {};

window.SCSU_DATA.courses = [
  {
    id:          "nrm-342",
    code:        "NRM 342",
    title:       "Agronomy & Soils",
    image: "assets/courses/nrm-342.webp",
    credits:     "3 Course Credits",
    lastUpdated: "1 OCTOBER, 2026",
    lede:
      "Soil is the living foundation of agriculture; a dynamic system " +
      "shaped by climate, parent material, organisms, and time. This " +
      "course builds the conceptual and practical skills needed to read " +
      "a field, diagnose its constraints, and design nutrient programs " +
      "that sustain yield while protecting soil and water quality. " +
      "Through immersive case fields, lab simulations, and decision " +
      "exercises, students move from soil chemistry and physics to " +
      "in-season fertility decisions and 4Rs stewardship.",
    overview:
      "Beginning with soil-forming processes, horizon development, and " +
      "the physical and chemical properties that govern water, air, and " +
      "nutrient behavior, students learn to connect soil conditions to " +
      "crop response. The course then moves through the nitrogen cycle, " +
      "phosphorus and potassium dynamics, and the secondary and " +
      "micronutrients that shape plant health. Students develop fluency " +
      "with the diagnostic toolkit of modern agronomy: soil sampling " +
      "protocols, lab extractants, tissue analysis, and soil health " +
      "indices, and learn to translate test results into site-specific " +
      "nutrient plans across diverse cropping systems and fields.",
    curriculum: [
      "Soil formation, horizon development, and physical-chemical " +
        "properties that govern nutrient retention and crop response",
      "Nitrogen, phosphorus, and potassium cycling, availability, and " +
        "loss pathways in soils",
      "Secondary and micronutrient diagnostics, deficiencies, " +
        "toxicities, and nutrient balance",
      "Soil sampling, lab interpretation, tissue analysis, and soil " +
        "health indices",
      "Site-specific nutrient management, fertilizer programs, and " +
        "precision application technologies",
      "Field case studies, cost-benefit analysis, and communicating " +
        "site-specific nutrient plans"
    ],
    // EON Reality launch targets. Replace the placeholder paths
    // with the real EON course slugs once they're issued. The
    // /login redirect param sends the user back to the course
    // after auth — EON's standard pattern.
    eon: {
      desktopUrl: "https://customvirtualcampus.eon-xr.com/i/936/courses/341-11599",
      vrUrl:      "https://customvirtualcampus.eon-xr.com/i/936/courses/341-11599"
    },
    immersive: {
      note:
        "In your headset, sign in to EON Reality to enter the " +
        "immersive case fields and lab simulations for this course."
    }
  },

  {
    id:          "nrm-431",
    code:        "NRM 431",
    title:       "Soil Fertility",
    image: "assets/courses/nrm-431.webp",
    credits:     "3 Course Credits",
    lastUpdated: "1 OCTOBER, 2026",
    lede:
      "This course moves from the science of soil chemistry, water, and " +
      "biology into the applied work of designing, implementing, and " +
      "adjusting nutrient management programs across diverse cropping " +
      "systems. Students engage with crop-specific requirements, organic " +
      "and sustainable practices, environmental compliance, and emerging " +
      "precision technologies to manage fertility as a dynamic, " +
      "real-world farm system.",
    overview:
      "Building from root-zone chemistry, cation exchange, and buffering " +
      "capacity, the course turns to the systems that shape fertility " +
      "in practice: soil structure and water, pH and salinity, and the " +
      "role of organic matter and microbial cycling in supplying " +
      "nutrients to crops across seasons. Students then move into the " +
      "decision space of nutrient management: defining yield goals, " +
      "building budgets, tailoring fertilizer programs to crop demand, " +
      "and navigating environmental audits, certifications, and " +
      "emerging precision and climate-adaptation technologies.",
    curriculum: [
      "Soil physical health, water management, irrigation efficiency, " +
        "and moisture conservation strategies",
      "Soil pH management, liming strategies, salinity, and sodicity " +
        "in nutrient dynamics",
      "Crop-specific nutrient requirements, growth stage timing, and " +
        "nutrient antagonisms",
      "Organic and sustainable systems: composting, legumes, green " +
        "manures, and certification",
      "Environmental audits, regulatory compliance, and cost-benefit " +
        "decision support tools",
      "Precision agriculture, nutrient recycling, and climate-resilient " +
        "management strategies"
    ],
    // Desktop-only EON build for now. Omitting `vrUrl` here means
    // a Quest user clicking Begin Course will fall back to the
    // desktop URL (still opens in the Quest browser, no VR scene).
    eon: {
      desktopUrl: "https://customvirtualcampus.eon-xr.com/i/936/courses/325-11396",
      vrUrl:      "https://customvirtualcampus.eon-xr.com/i/936/courses/325-11396"
    },
    immersive: {
      note:
        "In your headset, sign in to EON Reality to enter the " +
        "immersive case fields and lab simulations for this course."
    }
  }
];
