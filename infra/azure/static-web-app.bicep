targetScope = 'resourceGroup'

param location string
param name string
param tags object

@onlyIfNotExists()
resource site 'Microsoft.Web/staticSites@2024-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output id string = site.id
output defaultHostname string = site.properties.defaultHostname
