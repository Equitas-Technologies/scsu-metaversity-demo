# Mapbox basemap trial

Branch: `codex/mapbox-basemaps`

## Goal

Try Mapbox for both the normal map and satellite mode while retaining Leaflet, the
campus data, controls, and 3D tour behavior. Do not deploy the trial until both
views have been checked against the current production map.

The Leaflet tile wiring and mode toggle are in this branch. A local demo token
is configured; visual and attribution checks are still needed before deployment.

## Account ownership

Equitas is creating `dev.account@equitas-group.com` as a shared mailbox in
Exchange admin. It will serve as the development service identity for creating
project accounts and obtaining API keys, including the Mapbox trial account.
The Mapbox demo token is configured locally in the Git-ignored file.

## Entering the demo token

Open [`mapbox-token.local.js`](mapbox-token.local.js) and paste the Mapbox
**public** `pk.` token between the quotes. This file is Git-ignored and is
loaded by `map.html` before `config.js`; reload the local page after editing it.
The normal and satellite Mapbox layers stay unavailable until a valid token is
present. If working in a fresh checkout, copy `mapbox-token.example.js` to
`mapbox-token.local.js` first. Never put a secret `sk.` token in browser code.

The demo account provides one default public token. Before production, create
a separate, URL-restricted public token after upgrading the Mapbox account,
and provide it through the deployment configuration. The ignored local file
is only for the development trial; it is not published by GitHub Pages.

## Proposed implementation

1. Use Mapbox's Static Tiles API to render a normal raster basemap in Leaflet.
   Start with the classic `mapbox/outdoors-v12` style because it is the closest
   visual comparison to Stadia Outdoors. Use 512-pixel Leaflet tiles with
   `zoomOffset: -1`. The mobile layout (up to 880px wide) requests 512-pixel
   1x images; wider viewports request 1024-pixel `@2x` images for sharper
   rendering. Resizing across the breakpoint updates the active tile layer.
   The style is no longer actively maintained. Mapbox Standard cannot currently
   be served by the Static Tiles API, so it is not a drop-in Leaflet option.
2. Use the Static Tiles API's classic `mapbox/satellite-v9` style for satellite
   mode, with the same 512-pixel tile settings and responsive resolution as
   Outdoors. Higher-resolution images increase transferred bytes but do not
   increase the number of tile requests for a given viewport. The direct Raster
   Tiles API returned HTTP 429 with a rate-limit value of `-1` for the demo
   token, while the satellite style tile returned HTTP 200.
3. Ensure only the selected basemap requests tiles. The trial detaches the
   inactive basemap when switching modes.
4. Display Mapbox's required logo on the map and linked text attribution in
   Leaflet's bottom attribution control. Check the satellite tileset metadata
   for any additional imagery credits. Keep credits visible on desktop and
   mobile, and switch them with the active layer.
5. Use a Mapbox **public** (`pk.`) access token. The demo token is for local
   development; use a separate, site-restricted public token in production.

## Cost risk mitigation

Unexpectedly high tile usage is unlikely, but SCSU IT can limit its cost impact
by editing [`data/map-flags.json`](data/map-flags.json) in the deployed
repository and publishing the change. The separate `normalMap` and
`satelliteMap` flags let IT turn off either map mode. A disabled mode stops
requesting new tiles. If one mode remains enabled, the map opens in that mode;
if both are disabled, visitors see a map-unavailable message while the rest of
the page remains available.

The page reads this file before adding a tile layer and rechecks it every 30
seconds and when a browser tab becomes visible. Invalid or unreachable flags
disable both tile layers over HTTP(S). A direct `file://` preview uses both
layers because it cannot fetch the control file. An update becomes effective
only after GitHub Pages publishes the edited file, then after the next poll in
each open browser tab. Older app versions that predate these switches will not
poll.

The flags control requests from this version of the site. If unexpected usage
continues outside the site, IT can review Mapbox usage statistics and rotate or
delete the public token in the Mapbox Console. Restrict the production token to
the deployment URL as part of normal setup.

## Visual and functional checks

- Compare both views at zoom 17–20 over campus and at the map boundaries.
- Inspect image clarity, imagery age, building alignment, mobile layout, and
  the satellite toggle. Check for duplicate map labels: the existing Stadia
  vector style hides POI labels in code, whereas Mapbox raster tiles have
  baked-in labels. If duplication is significant, clone the classic style in
  Mapbox Studio and hide those labels there, or reconsider the normal basemap.
- Verify that no Stadia tile requests remain and that only the active Mapbox
  layer requests tiles. Check attribution and logo in both modes.
- Set each map flag off independently while the page is open, then set both
  off. Confirm disabled layers stop making new tile requests and that the
  unavailable message appears only when both modes are off.
- Check Mapbox account statistics after a representative session to estimate
  per-visit requests before production deployment.

## Development and production use

- Mapbox's no-card **demo access** is intended for development and has lower
  account-specific usage and rate caps. It is not the production account
  configuration. Production requires upgrading the account to **standard
  pay-as-you-go access** by adding a payment method; monthly free allowances
  continue to apply.
- Both Leaflet modes use the **Static Tiles API** and share its request meter:
  200,000 requests/month free, then $0.50 per 1,000 at the first paid tier.
- Pay-as-you-go has no configurable hard spending cap. Set usage alerts and
  monitor statistics; charges above free allowances are billed automatically.
- Mapbox permits its tiles in third-party renderers such as Leaflet, subject
  to its terms, billing, and attribution requirements. Do not mirror or
  pre-download Mapbox tiles as part of this trial; rely on normal browser
  caching headers.

## References

- [Mapbox demo and standard access](https://docs.mapbox.com/accounts/guides/demo-access/)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Mapbox billing and usage alerts](https://docs.mapbox.com/accounts/guides/invoices/)
- [Mapbox in Leaflet](https://docs.mapbox.com/accounts/guides/pricing/sections/third-party-tools/)
- [Static Tiles API](https://docs.mapbox.com/api/maps/static-tiles/)
- [Satellite style](https://docs.mapbox.com/map-styles/reference/satellite/)
- [Classic Outdoors style](https://docs.mapbox.com/map-styles/reference/outdoors/)
- [Token management](https://docs.mapbox.com/accounts/guides/tokens/)
- [Attribution](https://docs.mapbox.com/help/dive-deeper/attribution/)
- [Mapbox terms](https://www.mapbox.com/legal/tos)
