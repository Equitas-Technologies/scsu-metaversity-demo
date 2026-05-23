/* ============================================================
   SCSU METAVERSITY — Per-location content (FALLBACK SHIM)
   ------------------------------------------------------------
   ⚠️  EDITORS: this file is no longer the source of truth.
   The canonical data lives in data/locations.json. This shim
   is kept so the page still works when opened directly from
   disk (file:// origin), where fetch() can't read JSON files.

   When served over http/https, js/00-data-adapter.js fetches
   data/locations.json and overwrites whatever this shim set,
   so any edits made here are silently ignored in production.

   To regenerate this file from the JSON, run:
       node scripts/extract.js     (JSON → fresh shim)

   --- legacy header continues below ---

   Loaded via <script>, like the other data/*.js files. Writes
   onto window.CAMPUS_CONFIG so app.js can keep reading these
   maps from `config.descriptionMap`, `config.imageMap`, etc.
   without any changes.

   Each map is keyed case-insensitively by the feature `name`
   from the GeoJSON data. This file is the place to edit the
   human-readable copy: descriptions, hero images, the
   "What happens here?" pill chips, the "Explorable locations"
   list, and the department category labels.

   Structural settings (map tiles, Treedis SDK plumbing,
   Leaflet styles, UI flags) live in config.js.

   ─── Content sourced from 2026-05-20-SCSU-Locations.xlsx ──
   The 36-entry confirmed-locations sheet provides descriptions,
   tags (`What Happens Here?`), categories, and metadata for the
   primary buildings on campus. Each sheet entry maps to one (or
   sometimes several) GeoJSON features:

     • Sheet "Bethea Hall" (#8) maps to the GeoJSON feature
       "Engineering & Computer Science Complex / Bethea Hall".
     • Sheet "Turner Hall" (#9) maps to THREE GeoJSON features:
       "Turner Hall Wing A/B/D". Same narrative is applied to
       each wing until per-wing copy is provided.
     • Sheet "Queens Village" (#32) maps to SEVEN GeoJSON
       features: "Queens Village A" through "G". Same narrative
       is applied to each building.

   Buildings present in the GeoJSON but absent from the sheet
   (parking lots, machine shops, motor pool, alumni house,
   Felton Lab, H-D Theatre, etc.) get a category label only —
   descriptions fall through to the generic "<Name> — more
   information about this location is coming soon." string
   in getDescription() (see 01-utils.js).

   NOTE: Sheet has two Davis Hall entries (#7 and #23).
   #7 = "Leroy Davis Sr. Science and Research Complex"
   (built 2011, extension of Hodge Hall). #23 = a separate
   classroom building "Davis Hall, distinct from the Leroy
   Davis Sr. Science and Research Complex". The v2 GeoJSON
   has only ONE feature named "Davis Hall". We use entry #23
   here on the assumption the GeoJSON polygon represents the
   older classroom building; if it actually represents the
   Leroy Davis Sr. Complex, swap to entry #7's narrative.
   ============================================================ */
window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};

/* -- Category overrides for tour stops --------------------
   These power the department labels shown in the locations
   list (e.g. "MATH & SCIENCE" under "Nance Hall").
   Keys are matched case-insensitively against `name`.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.categoryMap = {
  /* -- Featured tour stops (must match tours.geojson names) -- */
  "crawford-zimmerman building":                 "ADMINISTRATIVE",
  "nance hall":                                  "ACADEMICS",
  "shm memorial square":                         "MEMORIAL",
  "oliver c. dawson stadium":                    "ATHLETICS",
  "kirkland w. green student center":            "ADMINISTRATIVE",
  "olar farm":                                   "OFF-CAMPUS FACILITY",

  /* Academic buildings */
  "crawford hall engineering building":          "HISTORIC / CULTURAL",
  "hodge hall":                                  "ACADEMICS",
  "davis hall":                                  "ACADEMICS",
  "engineering & computer science complex / bethea hall": "ACADEMICS",
  "turner hall wing a":                          "ACADEMICS",
  "turner hall wing b":                          "ACADEMICS",
  "turner hall wing d":                          "ACADEMICS",
  "miller f. whittaker library":                 "ACADEMICS",
  "mlk auditorium":                              "ACADEMICS",
  "belcher hall":                                "ACADEMICS",
  "moss hall":                                   "ACADEMICS",
  "clyburn center":                              "ACADEMICS",
  "soldiers' hall":                              "ACADEMICS",
  "w.c. lewis building":                         "ACADEMICS",
  "h-d theatre":                                 "ACADEMICS",
  "speech hearing center":                       "ACADEMICS",
  "manning hall":                                "ACADEMICS",
  "bradham hall":                                "ACADEMICS",
  "mays hall 1":                                 "ACADEMICS",
  "mays hall 2":                                 "ACADEMICS",
  "felton laboratory":                           "ACADEMICS",
  "felton pre school":                           "ACADEMICS",
  "adult continuing education":                  "ACADEMICS",

  /* Administrative buildings */
  "administration building":                     "ADMINISTRATION",
  "lowman hall":                                 "ADMINISTRATION",
  "wilkinson hall":                              "ADMINISTRATION",
  "alumni house":                                "ADMINISTRATION",
  "sponsored programs office":                   "ADMINISTRATION",
  "campus services":                             "ADMINISTRATION",
  "john w. matthews jr. 1890 extension center":  "ADMINISTRATION",

  /* Athletics */
  "dukes gymnasium":                             "ATHLETICS",
  "smith-hammond-middleton memorial center":     "ATHLETICS",
  "athletics department i":                      "ATHLETICS",
  "athletics department ii":                     "ATHLETICS",
  "tennis courts":                               "ATHLETICS",
  "track & field facility":                      "ATHLETICS",

  /* Museum / cultural */
  "i.p. stanback museum & planetarium":          "MUSEUM & CULTURAL",
  "department of visual & performing arts":      "ACADEMICS",

  /* Residence halls */
  "truth hall":                                  "RESIDENCE LIFE",
  "mitchell hall":                               "RESIDENCE LIFE",
  "hugine suites":                               "RESIDENCE LIFE",
  "battiste hall":                               "RESIDENCE LIFE",
  "earle hall":                                  "RESIDENCE LIFE",
  "williams hall":                               "RESIDENCE LIFE",
  "miller hall":                                 "RESIDENCE LIFE",
  "nix hall":                                    "RESIDENCE LIFE",
  "staley hall":                                 "RESIDENCE LIFE",
  "university village":                          "RESIDENCE LIFE",
  "queens village a":                            "RESIDENCE LIFE",
  "queens village b":                            "RESIDENCE LIFE",
  "queens village c":                            "RESIDENCE LIFE",
  "queens village d":                            "RESIDENCE LIFE",
  "queens village e":                            "RESIDENCE LIFE",
  "queens village f":                            "RESIDENCE LIFE",
  "queens village g":                            "RESIDENCE LIFE",

  /* Dining */
  "washington dining hall":                      "DINING",

  /* Health / wellness */
  "infirmary & cl. self developement center":    "HEALTH & WELLNESS",

  /* Historic / cultural (no active department per sheet) */
  "y-hut":                                       "HISTORIC / CULTURAL",
  "housing office":                              "HISTORIC / CULTURAL",

  /* Operations / support / parking */
  "machine shop i":                              "OPERATIONS",
  "machine shop ii":                             "OPERATIONS",
  "motor pool":                                  "OPERATIONS",
  "police storage":                              "OPERATIONS",
  "faculty / staff parking":                     "PARKING",
  "faculty/ staff parking":                      "PARKING",
  "on campus student parking":                   "PARKING",
  "off campus student parking":                  "PARKING",
  "on campus / off campus student parking":      "PARKING"
};

/* -- Description overrides --------------------------------
   Because the source GeoJSON has description: "none" or no
   description property at all, these overrides drive what
   appears in the details panel.

   Locations without an entry here fall back to the generic
   "<Name> — more information about this location is coming
   soon." string (see getDescription() in 01-utils.js), so we
   only enumerate the ~36 confirmed places below plus the
   per-wing/per-building duplicates for split features.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.descriptionMap = {
  /* -- Featured tour stops -- */
  "crawford-zimmerman building":
    "The Crawford-Zimmerman Service Complex houses Facilities " +
    "Management operations as well as the Enrollment Management " +
    "suite, including Admissions, Financial Aid, and Title III " +
    "Programs. It also serves as the administrative address for " +
    "Residence Life & Housing. Built in 1983.",
  "kirkland w. green student center":
    "The primary hub for student life on campus, the Green Student " +
    "Center houses Washington Dining Hall, \"The Pitt\" dining area, " +
    "and a variety of student services. Originally built in 1954 " +
    "with a major addition in 1970. Currently undergoing a $4.2 " +
    "million renovation. Adjacent to the Student Center Plaza " +
    "Pavilion.",
  "shm memorial square":
    "The Smith-Hammond-Middleton Legacy Plaza at South Carolina " +
    "State University, dedicated in 2022, honors the three victims " +
    "of the 1968 Orangeburg Massacre.",
  "nance hall":
    "Home to the College of Agriculture and the Mathematics & " +
    "Science departments, Nance Hall hosts several of the " +
    "USDA-aligned laboratory spaces used in the NRM curriculum. " +
    "Built in 1974 and named for SC State's 5th president, " +
    "M. Maceo Nance Jr. A $15 million renovation is planned with " +
    "occupancy expected fall 2027.",
  "oliver c. dawson stadium":
    "Home of the SC State Bulldogs football and women's soccer " +
    "teams. Built in 1955 on Buckley Street, named in 1984 for " +
    "coach and AD Oliver Cromwell Dawson. Capacity raised to " +
    "22,000 in 1994 via a $4.5 million renovation. Synthetic turf " +
    "and a new scoreboard were installed in 2006. Home to 16 MEAC " +
    "titles.",
  "olar farm":
    "The Olar Farm is an off-campus agricultural facility operated " +
    "by South Carolina State University, located approximately 30 " +
    "miles southwest of the main campus in Olar, SC. It supports " +
    "the university's 1890 Research & Extension programs in " +
    "sustainable agriculture and applied research. " +
    "This location is not part of the main campus map — the point " +
    "on the map points in its general direction. Click \"Explore\" " +
    "to open the virtual tour of the farm.",

  /* -- Academic buildings -- */
  "hodge hall":
    "Built in 1928 in the Palladian style by architect Miller F. " +
    "Whittaker, Hodge Hall is a two-story brick science building " +
    "with a full basement. Originally built for Agriculture and " +
    "Home Economics (students helped construct it), it now houses " +
    "the sciences. Listed individually on the National Register of " +
    "Historic Places (1985), with two large modern brick rear " +
    "additions.",

  /* Sheet has two Davis Hall entries. The GeoJSON has one feature.
     Using entry #23 (the classroom building, distinct from the
     Leroy Davis Sr. Complex) — confirm with site team if this is
     the wrong building. */
  "davis hall":
    "Davis Hall houses classrooms and faculty offices for the " +
    "Department of Biological & Physical Sciences. Not to be " +
    "confused with the Leroy Davis Sr. Science and Research Complex " +
    "(the 2011 Hodge Hall annex named for SC State's 8th president).",

  "engineering & computer science complex / bethea hall":
    "Opened in 2013, the four-story Engineering and Computer Science " +
    "Complex — known as Bethea Hall — provides 85,400 square feet of " +
    "cutting-edge STEM learning space including lecture halls, " +
    "research centers, teaching and research laboratories, computer " +
    "labs, and faculty offices. Designed by Evoke Studios at a cost " +
    "of approximately $24.5 million. Located on Geathers Street, " +
    "across from the new academic building site.",

  /* Turner Hall is split into Wings A, B, and D in the v2 GeoJSON.
     The sheet provides one narrative for the building as a whole;
     it's duplicated across all three wings until per-wing copy is
     available. */
  "turner hall wing a":
    "Part of Turner Hall (built 1956) — a multi-wing academic " +
    "building that has housed Health Sciences, Education, and " +
    "other departments, with some portions dating back nearly a " +
    "century. Being replaced by a new $54.7 million, 94,000 sq ft " +
    "academic building designed by Evoke Studios (groundbreaking " +
    "April 2024; completion expected fall 2027).",
  "turner hall wing b":
    "Part of Turner Hall (built 1956) — a multi-wing academic " +
    "building that has housed Health Sciences, Education, and " +
    "other departments, with some portions dating back nearly a " +
    "century. Being replaced by a new $54.7 million, 94,000 sq ft " +
    "academic building designed by Evoke Studios (groundbreaking " +
    "April 2024; completion expected fall 2027).",
  "turner hall wing d":
    "Part of Turner Hall (built 1956) — a multi-wing academic " +
    "building that has housed Health Sciences, Education, and " +
    "other departments, with some portions dating back nearly a " +
    "century. Being replaced by a new $54.7 million, 94,000 sq ft " +
    "academic building designed by Evoke Studios (groundbreaking " +
    "April 2024; completion expected fall 2027).",

  "miller f. whittaker library":
    "The university's main library, built with a $1 million state " +
    "appropriation and dedicated in 1969. Named for SC State's " +
    "third president, Miller F. Whittaker. Originally two levels; " +
    "a third mezzanine level was added in 1979. A new 50,000 sq ft, " +
    "$30 million replacement library is planned adjacent to Leroy " +
    "Davis Hall.",
  "mlk auditorium":
    "Built in 1974, the Martin Luther King Jr. Auditorium is the " +
    "primary large-event venue on campus. It made national history " +
    "on April 26, 2007 as the site of the first 2008 Democratic " +
    "presidential primary debate, broadcast on MSNBC — the first " +
    "HBCU ever to host a presidential debate.",
  "belcher hall":
    "Built in 1986 and named for benefactor Algernon S. Belcher, " +
    "Belcher Hall is home to the College of Business & Information " +
    "Systems, the Career Center (2nd Floor, Suite 250), and the " +
    "BECT Institute.",
  "moss hall":
    "Built in 1949, Moss Hall is part of the SC State College " +
    "Historic District and houses the Registrar's Office (Room 202) " +
    "and the Student Success Center / TRIO program. The Moss Hall " +
    "Annex is being converted to a telehealth center.",

  "clyburn center":
    "The only University Transportation Center (UTC) in South " +
    "Carolina and one of three at HBCUs nationally. Funded by $13 " +
    "million in federal funds and a $2.6 million state match. The " +
    "Clyburn Archives and Research Center is planned for the Russell " +
    "Street side of campus. Designed by Perkins & Will, with " +
    "construction expected in 2026.",
  "soldiers' hall":
    "Home of the Bulldog Army ROTC Battalion and the Department of " +
    "Military Science. Houses training facilities, faculty offices, " +
    "and administrative operations for one of the most historically " +
    "productive ROTC programs in producing Black military officers " +
    "in the nation.",
  "w.c. lewis building":
    "Houses the Department of Speech Pathology and Audiology, " +
    "including graduate programs and clinical training facilities.",
  "john w. matthews jr. 1890 extension center":
    "Headquarters for the 1890 Research and Extension division of " +
    "SC State's Public Service and Agriculture operation. Houses " +
    "extension administrators, the Family, Nutrition and Health " +
    "program, and IT support for the division.",

  /* -- Administrative buildings -- */
  "administration building":
    "Built in 1970, the Donma Administration Building is the central " +
    "administrative hub of SC State, housing the Office of the " +
    "President (Suite 210) and University Relations & Marketing " +
    "(Suite 100).",
  "lowman hall":
    "The oldest intact building on campus, Lowman Hall was designed " +
    "by architect Miller F. Whittaker in 1917 and originally served " +
    "as a men's dormitory (80 rooms across 3 stories). Restored by " +
    "Watson Tate Savory 2001–2009, it now houses Administration, " +
    "Institutional Research, and Institutional Advancement offices. " +
    "Listed individually on the National Register of Historic Places " +
    "(1985). Address: 124 Geathers St.",
  "wilkinson hall":
    "Built in 1938 with New Deal funding, Wilkinson Hall was the " +
    "university's first separate library building. A 16,000 sq ft " +
    "contributing property within the SC State College Historic " +
    "District, it has been undergoing renovation since 2018 via " +
    "National Park Service federal grants.",

  /* -- Athletics -- */
  "dukes gymnasium":
    "Built in 1931 from a student thesis design by John H. Blanche " +
    "and funded by student recreation fees, Dukes Gymnasium is a " +
    "two-story brick building with a full basement, listed " +
    "individually on the National Register of Historic Places " +
    "(1985). Home venue for the women's volleyball team and the " +
    "Office of Intramural Sports. Contains a regulation basketball " +
    "court, yoga space, and basement weight room. Became the " +
    "Intramural Center after Smith-Hammond-Middleton opened in 1968.",
  "smith-hammond-middleton memorial center":
    "Opened in 1968, the Smith-Hammond-Middleton Memorial Center is " +
    "the primary Health and Physical Education facility on campus, " +
    "serving both varsity athletics and general recreation. Its " +
    "opening shifted Dukes Gymnasium to intramural use.",

  /* -- Museum / cultural -- */
  "i.p. stanback museum & planetarium":
    "Opened in 1979, the I.P. Stanback Museum and Planetarium is " +
    "the only interdisciplinary art museum and planetarium on any " +
    "HBCU campus in the United States. It presents rotating " +
    "exhibitions year-round and showcases graduating senior artwork " +
    "each May.",
  "department of visual & performing arts":
    "Constructed in 1999, the Fine Arts Building gave the Art and " +
    "Music departments a dedicated home. It includes the Barbara A. " +
    "Vaughan Recital Hall (currently undergoing seating repairs) " +
    "and serves as the center for creative arts programming at SC " +
    "State.",

  /* -- Residence halls -- */
  "truth hall":
    "At 14 stories, Sojourner Truth Hall is the tallest building " +
    "in Orangeburg County. Built in 1972 as a women's residence " +
    "hall (384 beds on upper floors). The dining hall inside was " +
    "converted to a cyber café called Pete's Arena. Currently " +
    "undergoing a $25 million renovation including installation of " +
    "a fire suppression system to reopen the upper floors.",
  "mitchell hall":
    "John H. Mitchell Hall is a men's residence hall built in 1975. " +
    "A new 500+ bed residence hall is planned adjacent on Naylor " +
    "Street ($50 million, 110,000 sq ft; groundbreaking April 2026; " +
    "occupancy fall 2027).",
  "hugine suites":
    "The largest dormitory in South Carolina, Hugine Suites opened " +
    "in 2006 with 771 beds across six buildings. Named for " +
    "President Andrew Hugine Jr. Phase 1 (buildings 1–4) opened " +
    "August 26, 2006; buildings 5–6 opened September 10, 2006.",
  "battiste hall":
    "A 200-room co-ed residence hall designed by Huff + Gooden " +
    "Architects. It completes the urban street wall between two " +
    "existing dormitories along the internal east-west campus axis.",
  "earle hall":
    "Earle Hall is a residential hall serving SC State students.",
  "williams hall":
    "Williams Hall is a residential hall serving SC State students.",
  "miller hall":
    "Miller Hall is a former women's dormitory built in 1938 as " +
    "part of the SC State College Historic District. It was closed " +
    "after Hugine Suites opened, due to fire alarm system " +
    "malfunctions.",
  "university village":
    "Student housing complex serving SC State students.",

  /* Queens Village is split into seven buildings (A–G) in the v2
     GeoJSON. The sheet provides one narrative for the complex;
     it's applied to each of the seven buildings. */
  "queens village a":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village b":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village c":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village d":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village e":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village f":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",
  "queens village g":
    "Part of Queens Village — married and apartment-style student " +
    "housing comprising seven buildings (Phase 1 built 1971, " +
    "Phase 2 built 1975). Offline for several years; full " +
    "renovation contract awarded in 2024. Each remodeled unit " +
    "will include four two-bedroom suites, for roughly 112 units " +
    "across the complex.",

  /* -- Historic / cultural (no active department) -- */
  "y-hut":
    "A historic structure built 1925–1927 as part of the SC State " +
    "College Historic District. Contributing property within the " +
    "National Register Historic District.",
  "housing office":
    "Built in 1928 as part of the SC State College Historic " +
    "District. Originally home to the College of Agriculture, " +
    "Family and Consumer Sciences. Contributing property within " +
    "the National Register Historic District.",
  "crawford hall engineering building":
    "Built 1938–1942 as part of the SC State College Historic " +
    "District. Originally an Industrial Arts building. " +
    "Contributing property within the National Register Historic " +
    "District.",

  /* -- Health / wellness -- */
  /* The v2 GeoJSON labels this feature "Infirmary & CL. Self
     Developement Center" (preserving the original spelling and
     "CL." abbreviation in the source data). */
  "infirmary & cl. self developement center":
    "The Infirmary & Self Development Center supports student " +
    "health, wellness, and personal development on the SC State " +
    "campus. More information about this location is coming soon."
};

/* -- Location images --------------------------------------
   Paths are relative to index.html. Omit a key (or set it
   to "") to fall back to the placeholder.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.imageMap = {
  "crawford-zimmerman building":       "assets/locations/crawford-zimmerman.webp",
  "kirkland w. green student center":  "assets/locations/kirkland-green.webp",
  "shm memorial square":               "assets/locations/shm-memorial.webp",
  "nance hall":                        "assets/locations/nance-hall.webp",
  "oliver c. dawson stadium":          "assets/locations/dawson-stadium.webp",
  "olar farm":                         "assets/locations/olar-farm.webp"
};

/* -- "What happens here?" chips ---------------------------
   Shown as pill chips in the metadata panel. Each array
   entry becomes one chip. Sourced from the sheet's
   "What Happens Here? (tags)" column.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.happensHereMap = {
  /* -- Featured tour stops -- */
  "crawford-zimmerman building": [
    "Campus Administration",
    "Admissions Offices",
    "Campus Bookstore"
  ],
  "kirkland w. green student center": [
    "Student Union",
    "Dining",
    "Washington Dining Hall",
    "The Pitt",
    "Student Activities"
  ],
  "shm memorial square": [
    "Memorial bronze busts",
    "Annual commemoration",
    "Historical marker"
  ],
  "nance hall": [
    "Faculty offices",
    "NRM Labs",
    "USDA Research"
  ],
  "oliver c. dawson stadium": [
    "Football",
    "Soccer",
    "MEAC Championships",
    "Marching 101",
    "Homecoming"
  ],
  "olar farm": [
    "1890 Research & Extension",
    "Sustainable agriculture",
    "Applied research"
  ],

  /* -- Academic buildings -- */
  "hodge hall": [
    "Science",
    "Biology",
    "Physics",
    "Chemistry",
    "Palladian",
    "NRHP",
    "Historic"
  ],
  "davis hall": [
    "Biology",
    "Physics",
    "Science",
    "Classrooms",
    "Faculty Offices"
  ],
  "engineering & computer science complex / bethea hall": [
    "Engineering",
    "Computer Science",
    "STEM",
    "Research Labs",
    "Cybersecurity",
    "Nuclear Engineering"
  ],

  /* Turner Hall split — same chip set on each wing until per-
     wing copy is provided. */
  "turner hall wing a": [
    "Health Sciences",
    "Education",
    "Classrooms",
    "Faculty Offices"
  ],
  "turner hall wing b": [
    "Health Sciences",
    "Education",
    "Classrooms",
    "Faculty Offices"
  ],
  "turner hall wing d": [
    "Health Sciences",
    "Education",
    "Classrooms",
    "Faculty Offices"
  ],

  "miller f. whittaker library": [
    "Library",
    "Research",
    "Study Spaces",
    "Circulation",
    "Archives"
  ],
  "mlk auditorium": [
    "Convocation",
    "Events",
    "Debates",
    "Concerts",
    "Lectures",
    "Presidential Debate",
    "HBCU First"
  ],
  "belcher hall": [
    "Business",
    "Finance",
    "Accounting",
    "Career Center",
    "BECT",
    "Information Systems"
  ],
  "moss hall": [
    "Registrar",
    "Student Success",
    "TRIO",
    "Academic Support",
    "Telehealth"
  ],
  "clyburn center": [
    "Transportation",
    "Research",
    "Workforce Training",
    "Federal",
    "HBCU",
    "UTC"
  ],
  "soldiers' hall": [
    "ROTC",
    "Military Science",
    "Army",
    "Leadership",
    "Training"
  ],
  "w.c. lewis building": [
    "Speech Pathology",
    "Audiology",
    "Clinical Training",
    "Graduate Programs"
  ],
  "john w. matthews jr. 1890 extension center": [
    "Agriculture",
    "Extension",
    "Public Service",
    "Research",
    "USDA",
    "1890 Program"
  ],

  /* -- Administrative buildings -- */
  "administration building": [
    "President",
    "Administration",
    "University Relations",
    "Marketing",
    "Communications"
  ],
  "lowman hall": [
    "Administration",
    "Historic",
    "NRHP",
    "Oldest Building",
    "Miller F. Whittaker"
  ],
  "wilkinson hall": [
    "Historic",
    "NRHP District",
    "Under Renovation",
    "New Deal",
    "Former Library"
  ],

  /* -- Athletics -- */
  "dukes gymnasium": [
    "Volleyball",
    "Intramural Sports",
    "Basketball",
    "Historic",
    "NRHP",
    "Community Events"
  ],
  "smith-hammond-middleton memorial center": [
    "Athletics",
    "PE",
    "Recreation",
    "Health",
    "Physical Education",
    "Fitness"
  ],

  /* -- Museum / cultural -- */
  "i.p. stanback museum & planetarium": [
    "Museum",
    "Planetarium",
    "Art",
    "Exhibitions",
    "HBCU Unique",
    "Cultural Heritage",
    "STEM"
  ],
  "department of visual & performing arts": [
    "Art",
    "Music",
    "Recital Hall",
    "Performing Arts",
    "Gallery",
    "Studio"
  ],

  /* -- Residence halls -- */
  "truth hall": [
    "Residence Hall",
    "Tallest Building",
    "Orangeburg",
    "Housing",
    "Pete's Arena"
  ],
  "mitchell hall": [
    "Residence Hall",
    "Men's Housing",
    "Dormitory"
  ],
  "hugine suites": [
    "Residence Hall",
    "Suite-Style Housing",
    "Largest Dorm in SC",
    "Modern Housing"
  ],
  "battiste hall": [
    "Residence Hall",
    "Co-ed",
    "Modern Housing",
    "Dormitory"
  ],
  "earle hall": [
    "Residence Hall",
    "Dormitory",
    "Housing"
  ],
  "williams hall": [
    "Residence Hall",
    "Dormitory",
    "Housing"
  ],
  "miller hall": [
    "Historic",
    "NRHP District",
    "Closed",
    "Former Dormitory"
  ],
  "university village": [
    "Residence Hall",
    "Student Housing",
    "Apartment-Style"
  ],

  /* Queens Village split — same chip set on each building. */
  "queens village a": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village b": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village c": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village d": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village e": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village f": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],
  "queens village g": [
    "Apartment-Style Housing",
    "Student Housing",
    "Renovation",
    "Family Housing"
  ],

  /* -- Historic / cultural -- */
  "y-hut": [
    "Historic",
    "NRHP District",
    "YWCA",
    "Historic District"
  ],
  "housing office": [
    "Historic",
    "NRHP District",
    "Home Economics",
    "Historic District"
  ],
  "crawford hall engineering building": [
    "Historic",
    "NRHP District",
    "Industrial Arts",
    "Historic District"
  ],

  /* -- Health / wellness -- */
  "infirmary & cl. self developement center": [
    "Student Health",
    "Wellness",
    "Counseling",
    "Self Development"
  ]
};

/* -- Departments ------------------------------------------
   Maps a location to the academic / operational departments
   that occupy it. Values are ARRAYS so we can match each
   department independently at search time. Sourced from the
   "Department" column of 2026-05-20-SCSU-Locations.xlsx —
   the sheet uses ";" to separate multiple departments per
   building.

   The renderSearch() function in 09-sidebar-search.js uses
   this map to match queries like "engineering", "rotc", or
   "biology" against department strings in addition to
   building names.

   Notes:
     • Buildings the sheet marked as having no active
       department (Y-Hut, Housing Office historic shell,
       Crawford Hall Engineering historic shell) are
       intentionally OMITTED so they don't surface for any
       department query — they're already discoverable via
       their HISTORIC / CULTURAL category.
     • Parenthetical disclaimers on the sheet ("(former)",
       "(under renovation)") are stripped here so search
       still matches the canonical department name.
     • Davis Hall uses entry #23's department (classroom
       building); see the note above the descriptionMap entry.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.departmentMap = {
  /* -- Featured tour stops -- */
  "crawford-zimmerman building": [
    "Campus Administration",
    "Admissions Offices"
  ],
  "nance hall": [
    "Mathematics & Science",
    "College of Agriculture"
  ],
  "kirkland w. green student center": [
    "Student Affairs",
    "Dining Services"
  ],
  "oliver c. dawson stadium": [
    "Athletics – Football",
    "Athletics – Soccer"
  ],
  "shm memorial square": [],
  "olar farm": [
    "1890 Research & Extension"
  ],

  /* -- Academic buildings -- */
  "hodge hall": [
    "Biological & Physical Sciences"
  ],
  "davis hall": [
    "Biological & Physical Sciences"
  ],
  "engineering & computer science complex / bethea hall": [
    "Engineering",
    "Computer Science & Mathematics",
    "Cybersecurity"
  ],

  /* Turner Hall split — same department list on each wing
     until per-wing assignments are provided. */
  "turner hall wing a": [
    "Health Sciences",
    "Education"
  ],
  "turner hall wing b": [
    "Health Sciences",
    "Education"
  ],
  "turner hall wing d": [
    "Health Sciences",
    "Education"
  ],

  "miller f. whittaker library": [
    "Library Services"
  ],
  "mlk auditorium": [
    "University Events",
    "Convocation",
    "Academic Affairs"
  ],
  "belcher hall": [
    "College of Business & Information Systems",
    "Career Center",
    "BECT Institute"
  ],
  "moss hall": [
    "Registrar's Office",
    "Student Success Center",
    "TRIO"
  ],
  "clyburn center": [
    "Transportation Research",
    "Workforce Training"
  ],
  "soldiers' hall": [
    "Military Science",
    "ROTC"
  ],
  "w.c. lewis building": [
    "Speech Pathology & Audiology"
  ],
  "john w. matthews jr. 1890 extension center": [
    "Public Service & Agriculture",
    "1890 Research & Extension"
  ],

  /* -- Administrative buildings -- */
  "administration building": [
    "Office of the President",
    "University Relations & Marketing"
  ],
  "lowman hall": [
    "Administration",
    "Institutional Research",
    "Institutional Advancement"
  ],
  /* Sheet lists "Admissions; Financial Aid (former); Under
     renovation". The building is currently closed, but
     Admissions search should still surface it for context. */
  "wilkinson hall": [
    "Admissions",
    "Financial Aid"
  ],

  /* -- Athletics -- */
  "dukes gymnasium": [
    "Athletics – Volleyball",
    "Intramural Sports"
  ],
  "smith-hammond-middleton memorial center": [
    "Athletics",
    "Health & Physical Education",
    "Recreation"
  ],

  /* -- Museum / cultural -- */
  "i.p. stanback museum & planetarium": [
    "Visual & Performing Arts",
    "Museum & Planetarium"
  ],
  "department of visual & performing arts": [
    "Visual & Performing Arts",
    "Art",
    "Music"
  ],

  /* -- Residence halls -- */
  "truth hall":         ["Residence Life & Housing"],
  "mitchell hall":      ["Residence Life & Housing"],
  "hugine suites":      ["Residence Life & Housing"],
  "battiste hall":      ["Residence Life & Housing"],
  "earle hall":         ["Residence Life & Housing"],
  "williams hall":      ["Residence Life & Housing"],
  /* Miller Hall is closed but historically part of Residence
     Life — keep it searchable so users searching housing find
     the historic context. */
  "miller hall":        ["Residence Life & Housing"],
  "university village": ["Residence Life & Housing"],
  "queens village a":   ["Residence Life & Housing"],
  "queens village b":   ["Residence Life & Housing"],
  "queens village c":   ["Residence Life & Housing"],
  "queens village d":   ["Residence Life & Housing"],
  "queens village e":   ["Residence Life & Housing"],
  "queens village f":   ["Residence Life & Housing"],
  "queens village g":   ["Residence Life & Housing"]

  /* Y-Hut, Housing Office (historic shell), and Crawford Hall
     Engineering Building (historic shell) are intentionally
     OMITTED — the sheet marks them as having no active
     department, so they shouldn't appear in department-based
     search results. They remain discoverable via name search
     and the HISTORIC / CULTURAL category. */
};

/* -- Physical addresses -----------------------------------
   Maps a location name to a real-world mailing/street
   address. Used to render an "Open in Maps" link in the
   details panel — useful for off-campus locations like the
   Olar Farm, but works for any location with a known
   address. Keys are matched case-insensitively against
   `name`. Omit a key (or set it to "") to hide the row.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.addressMap = {
  "olar farm":   "1678 Alligator Rd, Olar, SC 29843",
  "lowman hall": "124 Geathers St, Orangeburg, SC 29117"
};

/* -- "Explorable locations" list --------------------------
   Shown as the list of sub-locations in the metadata
   panel. Each entry becomes one row.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.explorableMap = {
  "crawford-zimmerman building": [
    "Campus Bookstore",
    "Office of Student Financial Services",
    "Facilities Management & Operations",
    "Admissions & Financial Aid"
  ],
  "kirkland w. green student center": [],
  "shm memorial square": [
    "Historical marker",
    "Bronze Busts/Monuments"
  ],
  "nance hall": [
    "Room 110",
    "Lecture Room",
    "Room 100"
  ],
  "oliver c. dawson stadium": [
    "Midfield",
    "Gate 1",
    "Bulldog wall"
  ]
};
