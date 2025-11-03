import { setTranslatedName, getCustomer } from './customer-search.mjs'

await getCustomer(
    initialize,
    entityType,
    aiResponse,
    entity.name,
    entity.translatedName,
    entity.address,
    entity.address_street,
    entity.address_city,
    entity.address_postal_code,
    entity.address_country_code,
    addressArray
)