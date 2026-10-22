targetScope = 'subscription'

@description('Azure region for the Metaversity nonproduction resource group and Static Web App.')
param location string = 'eastus2'

@description('Resource group reserved for Metaversity. Keep this separate from rg-scsu-cms.')
param resourceGroupName string = 'rg-scsu-metaversity-nonprod'

@description('Name of the Metaversity Static Web App.')
param staticWebAppName string = 'swa-scsu-metaversity-nonprod'

var resourceTags = {
  project: 'scsu-metaversity'
  environment: 'nonprod'
  owner: 'equitas'
}

@onlyIfNotExists()
resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: resourceTags
}

module site './static-web-app.bicep' = {
  name: 'metaversity-static-web-app'
  scope: resourceGroup
  params: {
    location: location
    name: staticWebAppName
    tags: resourceTags
  }
}

output resourceGroupId string = resourceGroup.id
output staticWebAppId string = site.outputs.id
output defaultHostname string = site.outputs.defaultHostname
