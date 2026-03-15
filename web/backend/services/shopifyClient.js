
import shopify from "../config/shopify.js";

/**
 * shopifyClient service — creates session-bound Shopify API clients.
 * Import this in controllers instead of instantiating clients directly.
 */

/**
 * Get a Shopify Admin GraphQL client for the given session.
 * @param {object} session - Shopify session object
 * @returns {object} GraphQL client instance
 */
export function getGraphqlClient(session) {
  return new shopify.api.clients.Graphql({ session });
}

/**
 * Get a Shopify Admin REST client for the given session.
 * @param {object} session - Shopify session object
 * @returns {object} REST client instance
 */
export function getRestClient(session) {
  return new shopify.api.clients.Rest({ session });
}
