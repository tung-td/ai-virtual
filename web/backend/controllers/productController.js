
import { asyncHandler, AppError } from "../middlewares/errorHandler.js";
import { getSessionShop, getSession } from "../middlewares/auth.js";
import { getGraphqlClient } from "../services/shopifyClient.js";

/**
 * GET /api/products
 * List all products with their try-on enabled status (via metafield).
 */
export const listProducts = asyncHandler(async (_req, res) => {
  const session = getSession(res);
  const client = getGraphqlClient(session);

  const response = await client.request(
    `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
            metafield(namespace: "ai_tryon", key: "enabled") {
              value
            }
          }
        }
      }
    }
  `,
    { variables: { first: 50 } },
  );

  const products = response.data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    image: node.featuredImage?.url ?? null,
    tryon_enabled: node.metafield?.value === "true",
  }));

  res.json({ success: true, products });
});

/**
 * POST /api/products/:id/tryon
 * Enable or disable try-on for a product via Shopify metafield.
 *
 * Body: { enabled: boolean }
 */
export const setTryOnEnabled = asyncHandler(async (req, res) => {
  const session = getSession(res);
  const client = getGraphqlClient(session);
  const { id } = req.params; // GID like "gid://shopify/Product/12345"
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    throw new AppError("enabled must be a boolean", 400, "VALIDATION_ERROR");
  }

  // Decode if the id is URL-encoded
  const productId = decodeURIComponent(id);

  const response = await client.request(
    `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: "ai_tryon",
            key: "enabled",
            type: "boolean",
            value: String(enabled),
          },
        ],
      },
    },
  );

  const { userErrors } = response.data.metafieldsSet;
  if (userErrors?.length > 0) {
    throw new AppError(userErrors[0].message, 400, "SHOPIFY_MUTATION_ERROR");
  }

  res.json({
    success: true,
    message: `Try-on ${
      enabled ? "enabled" : "disabled"
    } for product ${productId}`,
  });
});
