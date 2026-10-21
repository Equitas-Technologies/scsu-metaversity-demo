# Azure nonproduction deployment

Use the existing Equitas-billed `SCSU_CMS_Test` subscription for the
Metaversity nonproduction site. Its CMS prototype is already deployed in
`rg-scsu-cms` (storage account, container registry, App Service plan, and web
app). The Metaversity resources belong in a **separate resource group**,
`rg-scsu-metaversity-nonprod`, and must not update or replace any CMS resource.

The new resource group contains one Free Azure Static Web App. The planned named preview environments are:
`test` for ad hoc branch trials and `staging` for the release candidate. The
default production slot of that Azure resource is not used. SCSU will own the
eventual production subscription and deployment. The existing GitHub Pages
production site stays live during this work.

## Subscription decision

On October 21, 2026, Azure rejected creation of a dedicated
`SCSU_Metaversity_Test` subscription with `SubscriptionCountReachedLimit` on
the Equitas Group billing account. The failed request left no alias or
subscription behind. Reusing `SCSU_CMS_Test` avoids that subscription-count
block while keeping the CMS and Metaversity deployments isolated by resource
group, resource names, deployment credentials, and GitHub environments.

The two projects will share subscription-level billing, quotas, and access
control. Use resource-group scope for Metaversity deployment permissions and
project tags or a cost-management budget if separate cost tracking is needed.

## Provisioned resources

On October 21, 2026, the following resources were created in `SCSU_CMS_Test`:

- Resource group: `rg-scsu-metaversity-nonprod` (East US 2)
- Free Static Web App: `swa-scsu-metaversity-nonprod`
- Azure default hostname: `wonderful-rock-0ec643c0f.3.azurestaticapps.net`

The app has no repository integration or deployed content yet. Azure lists the
original four CMS resources in `rg-scsu-cms` and the new Static Web App only in
`rg-scsu-metaversity-nonprod`. The `test` and `staging` preview environments
will be created by their first successful deployments.

## Deployment steps

1. Create GitHub environments `test` and `staging` in this repository. Add the
   Azure Static Web App deployment token as environment secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN` to both, and a distinct URL-restricted
   public Mapbox token as environment variable `MAPBOX_PUBLIC_TOKEN` to each.
   Allow the resulting Azure preview hostnames in the Mapbox token settings.
2. Merge `.github/workflows/azure-nonprod.yml` into the repository default
   branch so its manual run is available. Run it for `test` from a feature
   branch. Push the approved release candidate to a `staging` branch to update
   staging automatically. Review the URLs attached to the GitHub deployments.
3. Verify both map modes, location search, building selection, tour navigation,
   attribution, and the `data/map-flags.json` cost-control switches in test
   before promoting to staging. Do not point SCSU's production domain at this
   Equitas resource.

`scripts/build-site.js` packages only the public runtime files (about 5 MB),
excluding the old local tile archive and QGIS source material. The token is
public browser data by design; environment-specific tokens keep usage and URL
restrictions separate. Azure Static Web Apps preview URLs are public unless
access restrictions are configured, even when the GitHub source repository is
private.
