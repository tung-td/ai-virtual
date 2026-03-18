import { useState, useEffect, useCallback, useRef } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Badge,
  Button,
  Banner,
  SkeletonBodyText,
  Box,
  BlockStack,
  InlineStack,
  Thumbnail,
  Divider,
  Spinner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

/** Toggle switch — simple native component */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: checked ? "#6366f1" : "#d2d2d2",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

export default function ProductsPage() {
  const api = useApi();
  const shopify = useAppBridge();

  const [products, setProducts] = useState([]);
  const [pageInfo, setPageInfo] = useState({ hasNextPage: false, endCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState({});

  // Filters
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterType, setFilterType] = useState("");
  const [tagOptions, setTagOptions] = useState([{ label: "All Tags", value: "" }]);
  const [typeOptions, setTypeOptions] = useState([{ label: "All Types", value: "" }]);

  const searchTimer = useRef(null);

  // Load filter options
  useEffect(() => {
    api.get("/api/products/meta")
      .then(({ productTypes, productTags }) => {
        setTypeOptions([
          { label: "All Types", value: "" },
          ...productTypes.map(t => ({ label: t, value: t })),
        ]);
        setTagOptions([
          { label: "All Tags", value: "" },
          ...productTags.map(t => ({ label: t, value: t })),
        ]);
      })
      .catch(() => {});
  }, [api]);

  const fetchProducts = useCallback(async ({ cursor = null, append = false } = {}) => {
    try {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterTag) params.set("tag", filterTag);
      if (filterType) params.set("type", filterType);
      if (cursor) params.set("cursor", cursor);

      const data = await api.get(`/api/products?${params.toString()}`);
      setProducts(prev => append ? [...prev, ...data.products] : data.products);
      setPageInfo(data.pageInfo ?? { hasNextPage: false, endCursor: null });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [api, search, filterTag, filterType]);

  // Debounced refetch when filters change
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { fetchProducts(); }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search, filterTag, filterType, fetchProducts]);

  const handleToggle = useCallback(async (product) => {
    const { id, fitlyEnabled, metafieldId } = product;
    setToggling(t => ({ ...t, [id]: true }));
    // Optimistic update
    setProducts(prev => prev.map(p => p.id === id ? { ...p, fitlyEnabled: !fitlyEnabled } : p));
    try {
      await api.put("/api/products/fitly-enabled", {
        productId: id,
        enabled: !fitlyEnabled,
        metafieldId,
      });
      shopify.toast.show(`Try-On ${!fitlyEnabled ? "enabled" : "disabled"} for "${product.title}"`);
    } catch (e) {
      // Revert
      setProducts(prev => prev.map(p => p.id === id ? { ...p, fitlyEnabled } : p));
      shopify.toast.show(`Error: ${e.message}`, { isError: true });
    } finally {
      setToggling(t => ({ ...t, [id]: false }));
    }
  }, [api, shopify]);

  return (
    <Page fullWidth>
      <TitleBar title="Products" />

      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Error loading products" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        )}

        {/* Filter Bar */}
        <Card roundedAbove="sm">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <Text variant="headingMd" as="h2">Product Visibility</Text>
            </InlineStack>
            <Text variant="bodySm" tone="subdued">
              By default, Fitly Try-On is <b>enabled</b> for all products. Disable it for products that are not suitable for virtual try-on (e.g., accessories, home goods).
            </Text>
            <Divider />
            <InlineStack gap="300" wrap={true} blockAlign="end">
              <Box minWidth="220px">
                <TextField
                  label="Search products"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by title…"
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearch("")}
                />
              </Box>
              <Box minWidth="160px">
                <Select
                  label="Product type"
                  options={typeOptions}
                  value={filterType}
                  onChange={setFilterType}
                />
              </Box>
              <Box minWidth="160px">
                <Select
                  label="Tag"
                  options={tagOptions}
                  value={filterTag}
                  onChange={setFilterTag}
                />
              </Box>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Product List */}
        <Card roundedAbove="sm" padding="0">
          {loading ? (
            <Box padding="500">
              <BlockStack gap="300">
                {[1,2,3,4,5].map(i => <SkeletonBodyText key={i} lines={1} />)}
              </BlockStack>
            </Box>
          ) : products.length === 0 ? (
            <Box padding="600">
              <Text variant="bodyMd" tone="subdued" alignment="center">
                No products found. Try adjusting your filters.
              </Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {/* Column header */}
              <Box padding="300" background="bg-surface-secondary">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" fontWeight="semibold" tone="subdued">PRODUCT</Text>
                  <Text variant="bodySm" fontWeight="semibold" tone="subdued">FITLY TRY-ON</Text>
                </InlineStack>
              </Box>

              {products.map((product, idx) => (
                <Box key={product.id}>
                  {idx > 0 && <Divider />}
                  <Box padding="400">
                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <Thumbnail
                          source={product.image || ""}
                          alt={product.title}
                          size="small"
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                          <InlineStack gap="200" wrap={true}>
                            {product.status === "DRAFT" && <Badge tone="info">Draft</Badge>}
                            {product.productType && <Badge>{product.productType}</Badge>}
                            {product.tags?.slice(0, 3).map(tag => (
                              <Badge key={tag} tone="subdued">{tag}</Badge>
                            ))}
                          </InlineStack>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Text variant="bodySm" tone={product.fitlyEnabled ? "success" : "subdued"}>
                          {product.fitlyEnabled ? "On" : "Off"}
                        </Text>
                        <Toggle
                          checked={product.fitlyEnabled}
                          onChange={() => handleToggle(product)}
                          disabled={!!toggling[product.id]}
                        />
                        {toggling[product.id] && <Spinner size="small" />}
                      </InlineStack>
                    </InlineStack>
                  </Box>
                </Box>
              ))}

              {pageInfo.hasNextPage && (
                <Box padding="400" borderColor="border" borderBlockStartWidth="025">
                  <InlineStack align="center">
                    <Button
                      loading={loadingMore}
                      onClick={() => fetchProducts({ cursor: pageInfo.endCursor, append: true })}
                    >
                      Load more
                    </Button>
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          )}
        </Card>

        <Box paddingBlockEnd="1600" />
      </BlockStack>
    </Page>
  );
}
