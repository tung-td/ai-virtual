import { asyncHandler, AppError } from "../middlewares/errorHandler.js";
import { getSession } from "../middlewares/auth.js";
import { getGraphqlClient } from "../services/shopifyClient.js";

/**
 * GET /api/products
 * Fetches products from Shopify GraphQL with optional filters.
 * Query params:
 *   - search   {string}  — title search
 *   - tag      {string}  — filter by tag
 *   - type     {string}  — filter by product type
 *   - cursor   {string}  — pagination cursor (after)
 */
export const listProducts = asyncHandler(async (req, res) => {
  const session = getSession(res);
  const client = getGraphqlClient(session);

  const { search, tag, type, cursor } = req.query;

  // Build Shopify query string
  const parts = [];
  if (search) parts.push(`title:*${search}*`);
  if (tag) parts.push(`tag:${tag}`);
  if (type) parts.push(`product_type:${type}`);
  const queryStr = parts.length ? parts.join(" AND ") : null;

  const gql = `
    query listProducts($query: String, $after: String) {
      products(first: 20, query: $query, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            status
            productType
            tags
            featuredImage { url altText }
            metafield(namespace: "fitly", key: "enabled") {
              id
              value
            }
          }
        }
      }
    }
  `;

  const result = await client.request(gql, {
    variables: { query: queryStr, after: cursor || null },
  });

  const { edges, pageInfo } = result.data?.products ?? { edges: [], pageInfo: {} };

  const products = edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    productType: node.productType,
    tags: node.tags,
    image: node.featuredImage?.url ?? null,
    // null metafield = never explicitly disabled → treat as enabled
    fitlyEnabled: node.metafield ? node.metafield.value === "true" : true,
    metafieldId: node.metafield?.id ?? null,
  }));

  res.json({ success: true, products, pageInfo });
});

/**
 * PUT /api/products/fitly-enabled
 * Writes (or removes) the fitly.enabled metafield on a product.
 * Body: { productId: string, enabled: boolean, metafieldId?: string }
 */
export const setProductEnabled = asyncHandler(async (req, res) => {
  const session = getSession(res);
  const client = getGraphqlClient(session);

  const { productId, enabled, metafieldId } = req.body;

  if (!productId) throw new AppError("productId is required", 400);
  if (enabled === undefined) throw new AppError("enabled (boolean) is required", 400);

  let gid = productId;
  if (!gid.startsWith("gid://")) {
    gid = `gid://shopify/Product/${productId}`;
  }

  if (enabled === true && metafieldId) {
    // Delete metafield: absence = "enabled" (default), saves storage
    await client.request(
      `mutation deleteMetafield($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) { deletedId userErrors { field message } }
      }`,
      { variables: { input: { id: metafieldId } } },
    );
  } else {
    const result = await client.request(
      `mutation setMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [{
            ownerId: gid,
            namespace: "fitly",
            key: "enabled",
            type: "boolean",
            value: enabled ? "true" : "false",
          }],
        },
      },
    );
    const errors = result.data?.metafieldsSet?.userErrors;
    if (errors?.length) throw new AppError(errors[0].message, 400, "SHOPIFY_MUTATION_ERROR");
  }

  res.json({ success: true, productId: gid, enabled });
});

/**
 * GET /api/products/meta
 * Returns product types and top tags for filter dropdowns.
 */
export const getProductMeta = asyncHandler(async (req, res) => {
  const session = getSession(res);
  const client = getGraphqlClient(session);

  const [typesResult, tagsResult] = await Promise.all([
    client.request(`{ productTypes(first: 50) { edges { node } } }`),
    client.request(`{ shop { productTags(first: 50) { edges { node } } } }`),
  ]);

  const productTypes = typesResult.data?.productTypes?.edges?.map(e => e.node).filter(Boolean) ?? [];
  const productTags = tagsResult.data?.shop?.productTags?.edges?.map(e => e.node).filter(Boolean) ?? [];

  res.json({ success: true, productTypes, productTags });
});
