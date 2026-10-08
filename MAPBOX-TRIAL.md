# Mapbox basemap trial

Branch: `codex/mapbox-basemaps`

## Goal

Try Mapbox for both the normal map and satellite mode while retaining Leaflet, the
campus data, controls, and 3D tour behavior. Do not deploy the trial until both
views have been checked against the current production map.

## Proposed implementation

1. Use Mapbox's Static Tiles API to render a normal raster basemap in Leaflet.
   Start with the classic `mapbox/outdoors-v12` style because it is the closest
   visual comparison to Stadia Outdoors. Use 512-pixel tiles with Leaflet's
   `tileSize: 512` and `zoomOffset: -1`. The style is no longer actively
   maintained. Mapbox Standard cannot currently be served by the Static Tiles
   API, so it is not a drop-in Leaflet option.
2. Use the Raster Tiles API's `mapbox.satellite` tileset for satellite mode.
   This serves ordinary 256-pixel XYZ tiles to the existing Leaflet toggle.
3. Ensure only the selected basemap requests tiles. The current satellite layer
   covers Stadia Outdoors while it continues to run underneath; the trial
   should remove the inactive basemap when switching modes.
4. Display Mapbox's required logo on the map and linked text attribution in
   Leaflet's bottom attribution control. Check the satellite tileset metadata
   for any additional imagery credits. Keep credits visible on desktop and
   mobile, and switch them with the active layer.
5. Use a Mapbox **public** (`pk.`) access token. Keep development and production
   tokens distinct. Restrict the production token to the deployed site; use a
   development token that permits localhost. Never put a secret (`sk.`) token
   in the web app.

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
- Leaflet's normal style tiles are billed under the **Static Tiles API**:
  200,000 requests/month free, then $0.50 per 1,000 at the first paid tier.
  Satellite uses the separate **Raster Tiles API**: 750,000 requests/month
  free, then $0.25 per 1,000 at the first paid tier. These are separate meters.
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
- [Raster Tiles API](https://docs.mapbox.com/api/maps/raster-tiles/)
- [Classic Outdoors style](https://docs.mapbox.com/map-styles/reference/outdoors/)
- [Token management](https://docs.mapbox.com/accounts/guides/tokens/)
- [Attribution](https://docs.mapbox.com/help/dive-deeper/attribution/)
- [Mapbox terms](https://www.mapbox.com/legal/tos)
