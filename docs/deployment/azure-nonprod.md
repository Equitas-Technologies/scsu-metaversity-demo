# Azure nonproduction deployment

Use the existing Equitas-billed `SCSU_CMS_Test` subscription for the
Metaversity nonproduction site. Its CMS prototype is already deployed in
`rg-scsu-cms` (storage account, container registry, App Service plan, and web
app). The Metaversity resources belong in a **separate resource group**,
`rg-scsu-metaversity-nonprod`, and must not update or replace any CMS resource.

The new resource group contains one Free Azure Static Web App. Its named preview
environments are `test` for every push to `main` and `staging` for a manual
deployment from `main`. The default production slot of that Azure resource is
not used. SCSU will own the
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

The Static Web App has no direct repository integration; GitHub Actions uses
its deployment token. Azure lists the original four CMS resources in
`rg-scsu-cms` and the Static Web App only in
`rg-scsu-metaversity-nonprod`. Both named preview environments are now ready:

- Test: https://wonderful-rock-0ec643c0f-test.eastus2.3.azurestaticapps.net/map.html
- Staging: https://wonderful-rock-0ec643c0f-staging.eastus2.3.azurestaticapps.net/map.html

The Static Web App's default slot remains undeployed and returns 404 for
`/map.html`.

## Infrastructure template

`infra/azure/main.bicep` is a subscription-scope Azure Resource Manager
template written in Bicep. It creates the Metaversity resource group and its
Free Static Web App if they do not exist, using
`infra/azure/static-web-app.bicep`. Both resources use
`@onlyIfNotExists()`, so rerunning the template skips existing resources rather
than updating their properties. This makes it a bootstrap/recreation template;
intentional changes to an existing resource require a separate, reviewed
update. Bicep CLI v0.38.3 or newer is required for this decorator.

It contains no CMS resource definitions. Pass the subscription explicitly so
the template cannot accidentally target the Azure CLI's default subscription:

```powershell
az deployment sub what-if --subscription b1cd0ded-ac4b-44f6-b65c-565deb52544c --location eastus2 --template-file infra/azure/main.bicep
az deployment sub create --subscription b1cd0ded-ac4b-44f6-b65c-565deb52544c --location eastus2 --template-file infra/azure/main.bicep
```

Review `what-if` before applying. On October 21, a direct resource-group
what-if on `static-web-app.bicep` reported the existing app as `Ignore`, as
intended. The subscription-level what-if still reported changes to some
service-managed properties inside the nested module; this is a preview
discrepancy, not a reason to add those properties to the template. The create-only
subscription deployment `scsu-metaversity-nonprod-bootstrap` then succeeded on
October 21, returning the existing app hostname. Azure still lists the four
CMS resources only in `rg-scsu-cms`.

Bicep creates Azure infrastructure, while `.github/workflows/azure-nonprod.yml`
deploys site content and creates the
named preview environments on first deployment. GitHub environment
variables/secrets and Mapbox URL restrictions remain separate configuration.

Bicep is the source format because it is shorter and easier to parameterize
than equivalent ARM JSON; Azure compiles it to an ARM template for deployment.
Plain ARM JSON avoids the Bicep compile step and may suit tooling that accepts
only JSON, but it is more verbose to maintain. To generate ARM JSON when needed,
run `az bicep build --file infra/azure/main.bicep --outfile output/azure-main.json`.

## GitHub deployment setup

The GitHub environments `test` and `staging` each hold the Azure Static Web App
deployment token as environment secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
GitHub allows only `main` to use either environment. Pushing or merging into
`main` automatically updates `test`. To promote that branch to `staging`, use
**Actions → Azure test and staging → Run workflow**, select `main`, and run it.
The manual run always targets `staging`; a run from another ref fails. From a
terminal, `gh workflow run azure-nonprod.yml --ref main` does the same thing.

The workflow pins the Azure Static Web Apps action to a commit on its `v1`
branch because the older `v1` tag does not declare the
`deployment_environment` input in `action.yml`. Review that pin when updating
the action.

`main` currently contains the pre-Mapbox site and stays separate from
`codex/mapbox-basemaps`. Merging Mapbox into `main` will deploy it to `test`;
the subsequent manual workflow run will deploy it to `staging`. Both
environments have `MAPBOX_PUBLIC_TOKEN` set
to the account's default public demo token. Mapbox demo access permits only
one token and does not allow URL restrictions or new tokens until a payment
method is added. Demo access has a hard usage cap and rate limits; hitting the
cap stops Mapbox APIs until the account is upgraded. This is
acceptable for the public test preview, but replace the demo token with a
dedicated, URL-restricted token before any production use. Do not add a payment
method or upgrade the account as part of this deployment.

On October 21, the earlier workflow deployed the pre-Mapbox `main` to staging
and the Mapbox branch to test. Browser checks confirmed the pre-Mapbox staging
map and both standard and satellite Mapbox modes in test. On October 23, the
new workflow deployed `main` to test automatically, replacing the Mapbox
preview there; staging remained on its previous `main` deployment. After
merging Mapbox into `main`, check location search,
building selection, tour navigation, and the `data/map-flags.json` cost-control
switches in test before manually promoting the same branch to staging. Do not
point SCSU's production domain at this Equitas resource.

`scripts/build-site.js` packages only the public runtime files (about 5 MB),
excluding the old local tile archive and QGIS source material. When a Mapbox
token is configured, the script includes it in the browser bundle; the token is
public browser data by design. Once standard Mapbox access is enabled,
environment-specific restricted tokens can separate usage. Azure Static Web
Apps preview URLs are public unless
access restrictions are configured, even when the GitHub source repository is
private.
