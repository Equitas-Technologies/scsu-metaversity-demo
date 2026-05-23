/* ============================================================
   SCSU METAVERSITY — Per-location content
   ------------------------------------------------------------
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
   ============================================================ */
window.CAMPUS_CONFIG = window.CAMPUS_CONFIG || {};

/* -- Category overrides for tour stops --------------------
   These power the department labels shown in the locations
   list (e.g. "MATH & SCIENCE" under "Nance Hall").
   Keys are matched case-insensitively against `name`.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.categoryMap = {
  "crawford zimmerman":                          "STUDENT SERVICES",
  "nance hall":                                  "ACADEMICS",
  "s-h-m memorial square":                       "MEMORIAL",
  "oliver c. dawson stadium":                    "ATHLETICS",
  "kirkland w. green student center":            "STUDENT LIFE",
  "olar farm":                                   "OFF-CAMPUS FACILITY"
};

/* -- Description overrides --------------------------------
   Because the source data has description: "none",
   you can override what appears in the details panel.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.descriptionMap = {
  "crawford zimmerman":
    "Crawford-Zimmerman Building is a key administrative and operations " +
    "facility located on campus. It houses several departments, including " +
    "Procurement & Compliance, and serves as a hub for student services, " +
    "such as the SCSU Bookstore.",
  "kirkland w. green student center":
    "The Kirkland W. Green Student Center is the central hub for campus " +
    "life offering dining, social, and recreational spaces for students.",
  "s-h-m memorial square":
    "The Smith-Hammond-Middleton Legacy Plaza at South Carolina State " +
    "University, dedicated in 2022, honors the three victims of the 1968 " +
    "Orangeburg Massacre.",
  "nance hall":
    "Nance Hall serves as a hub for academic activities offering modern " +
    "classrooms and resources to support student learning.",
  "oliver c. dawson stadium":
    "Oliver C. Dawson Stadium is a 22,000 seat multi purpose stadium. " +
    "The Home of SC State Bulldogs football.",
  "olar farm":
    "The Olar Farm is an off-campus agricultural facility operated by " +
    "South Carolina State University, located approximately 20 miles " +
    "southwest of the main campus in Olar, SC. It supports the " +
    "university's 1890 Research & Extension programs in sustainable " +
    "agriculture and applied research. " +
    "This location is not part of the main campus map — the arrow on " +
    "the map points in its general direction. Click \"Explore\" to " +
    "open the virtual tour of the farm."
};

/* -- Location images --------------------------------------
   Paths are relative to index.html. Omit a key (or set it
   to "") to fall back to the placeholder.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.imageMap = {
  "crawford zimmerman":                "assets/locations/crawford-zimmerman.webp",
  "kirkland w. green student center":  "assets/locations/kirkland-green.webp",
  "s-h-m memorial square":             "assets/locations/shm-memorial.webp",
  "nance hall":                        "assets/locations/nance-hall.webp",
  "oliver c. dawson stadium":          "assets/locations/dawson-stadium.webp",
  "olar farm":                         "assets/locations/olar-farm.webp"
};

/* -- "What happens here?" chips ---------------------------
   Shown as pill chips in the metadata panel. Each array
   entry becomes one chip.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.happensHereMap = {
  "crawford zimmerman": [
    "Student services",
    "Warehouse",
    "Campus Bookstore"
  ],
  "kirkland w. green student center": [
    "Dining (\"The Pitt\")",
    "Campus Hub"
  ],
  "s-h-m memorial square": [
    "Memorial bronze busts",
    "Annual commemoration",
    "Historical marker"
  ],
  "nance hall": [
    "Classrooms",
    "General lecture room"
  ],
  "oliver c. dawson stadium": [
    "Bulldogs Football",
    "SC State women's soccer team"
  ],
  "olar farm": [
    "1890 Research & Extension",
    "Sustainable agriculture",
    "Applied research"
  ]
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
  "olar farm": "1678 Alligator Rd, Olar, SC 29843"
};

/* -- "Explorable locations" list --------------------------
   Shown as the list of sub-locations in the metadata
   panel. Each entry becomes one row.
   --------------------------------------------------------- */
window.CAMPUS_CONFIG.explorableMap = {
  "crawford zimmerman": [
    "Campus Bookstore",
    "Office of Student Financial Services",
    "Facilities Management & Operations",
    "Admissions & Financial Aid"
  ],
  "kirkland w. green student center": [],
  "s-h-m memorial square": [
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
