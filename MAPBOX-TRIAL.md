# Mapbox GL JS migration

Branch: `codex/mapbox-basemaps`

The campus map now uses Mapbox GL JS v3 with Mapbox Standard for the normal
view and Mapbox's satellite-v9 Static Tiles API for imagery. Building and tour GeoJSON stay
local and render as fill, outline, point, and label layers. The existing
sidebar, tour controls, details panel, Treedis links, and Learn mode retain
their data and behavior. Leaflet is no longer used; both modes run in Mapbox GL JS.

## Token and account

Development reads a public `pk.` token from the Git-ignored
`mapbox-token.local.js`. Copy `mapbox-token.example.js` to that path in a new
checkout, enter the public token, and reload the page. Never put a secret
`sk.` token in browser code. The production deployment needs its own
URL-restricted public token.

The current no-card demo token loads Mapbox Standard but returns HTTP 429 for
the direct Raster Tiles source inside Standard Satellite. Earlier work on this
branch confirmed that the same token receives HTTP 200 from the satellite-v9
Static Tiles API. The GL JS satellite mode therefore uses that working endpoint
as a raster source. It preserves the 1x mobile / 2x desktop choice from the
Leaflet trial, while local building and tour layers remain vector. A 429 from
this endpoint switches back to Standard for that page visit.

On Standard, Mapbox POIs remain visible below the local building-label zoom
threshold. At that threshold they are hidden while our canonical labels are
shown, avoiding duplicate building names. Turning off **Show building labels**
restores Mapbox POIs. Road, place, and transit labels remain visible. The
satellite-v9 imagery contains no Mapbox POI labels, so our labels stand alone.

## Campus building footprints

The normal style sets `colorBuildings` to `rgba(0, 0, 0, 0)` and keeps
`show3dObjects` disabled. Standard uses the building color's alpha for both
its flat building fills and outlines, so only our local GeoJSON supplies
visible footprints. This avoids duplicate, offset building shapes without
changing the GeoJSON coordinates or the basemap roads and land colors.
Satellite imagery still contains photographed buildings; this setting only
affects vector buildings in the normal style.

## Cost controls

`data/map-flags.json` has independent `normalMap` and `satelliteMap` booleans.
The page reads them **before constructing a Mapbox GL map**. If both are false,
the location list and other page content still load, but no Mapbox map object
is created. This matters because Mapbox bills GL JS by map loads, including
maps initialized with an empty style. An open page polls the flags every 30
seconds and on return to the tab. Disabling its active mode switches to an
allowed style or a blank style; newly enabling a mode on a page that started
with both off reloads it and creates the map then.

One enabled mode still incurs a GL JS map load. Panning, zooming, and switching
between enabled Mapbox styles within that map do not add map loads. The flags
stop this site's new mode requests; they are not an account-wide spending cap.
For an account-wide incident, SCSU IT can also rotate or revoke the public
token in Mapbox Console. Use account usage alerts and a production token
restricted to the deployed site.

## Validation before deployment

- Confirm normal Standard, both modes, and the cost-control flags on desktop
  and mobile. Check selection from the map and from both location-list tabs,
  tour navigation, building labels, search, Treedis, and Learn mode.
- Verify satellite imagery and labels in a browser with the deployment token.
  The direct Raster Tiles API 429 does not apply to the Static Tiles endpoint
  used here.
- Check overlay legibility and alignment at zoom 17–20. Existing geometry
  offsets remain data issues and are not corrected by changing the renderer.
- Verify Mapbox's logo and attribution remain visible in both map styles.
  Mapbox GL JS supplies its own controls.
- Compare usage in Mapbox Console after representative sessions. GL JS map
  loads and satellite Static Tiles requests may appear under different usage
  products; confirm account billing before deployment.

## References

- [Mapbox Standard styles](https://docs.mapbox.com/map-styles/guides/standard-styles/)
- [Mapbox GL JS pricing](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/)
- [Mapbox demo access](https://docs.mapbox.com/accounts/guides/demo-access/)
- [Mapbox token guidance](https://docs.mapbox.com/accounts/guides/tokens/)
