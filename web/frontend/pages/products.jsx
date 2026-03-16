import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Page,
  Card,
  Text,
  Badge,
  Thumbnail,
  Button,
  Banner,
  SkeletonBodyText,
  SkeletonThumbnail,
  Box,
  IndexTable,
  useIndexResourceState,
  BlockStack,
  InlineStack,
  EmptyState,
  ChoiceList,
  Filters,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

// Fixed-height skeleton row to prevent CLS
function ProductRowSkeleton() {
  return (
    <Box padding="300">
      <InlineStack gap="300" blockAlign="center">
        <SkeletonThumbnail size="small" />
        <Box minWidth="200px">
          <SkeletonBodyText lines={1} />
        </Box>
      </InlineStack>
    </Box>
  );
}

export default function ProductsPage() {
  const api = useApi();
  const shopify = useAppBridge();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(new Set());

  // Search & filter state
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState([]); // ["enabled"] | ["disabled"] | []

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get("/api/products");
      setProducts(data.products ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleToggle = useCallback(async (productId, enabled) => {
    setToggling((prev) => new Set([...prev, productId]));
    try {
      const encodedId = encodeURIComponent(productId);
      await api.post(`/api/products/${encodedId}/tryon`, { enabled });
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, tryon_enabled: enabled } : p))
      );
      shopify.toast.show(`Try-On ${enabled ? "enabled" : "disabled"}`, { duration: 2500 });
    } catch (e) {
      shopify.toast.show("Update failed: " + e.message, { isError: true, duration: 4000 });
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [api, shopify]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(products);

  const handleBulkEnable = useCallback(async () => {
    const targets = products.filter((p) => selectedResources.includes(p.id) && !p.tryon_enabled);
    await Promise.allSettled(targets.map((p) => handleToggle(p.id, true)));
  }, [products, selectedResources, handleToggle]);

  const handleBulkDisable = useCallback(async () => {
    const targets = products.filter((p) => selectedResources.includes(p.id) && p.tryon_enabled);
    await Promise.allSettled(targets.map((p) => handleToggle(p.id, false)));
  }, [products, selectedResources, handleToggle]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
      list = list.filter((p) => p.title?.toLowerCase().includes(q));
    }
    if (statusFilter.includes("enabled")) list = list.filter((p) => p.tryon_enabled);
    else if (statusFilter.includes("disabled")) list = list.filter((p) => !p.tryon_enabled);
    return list;
  }, [products, searchValue, statusFilter]);

  const activeFilters = useMemo(() => {
    const f = [];
    if (statusFilter.length > 0)
      f.push({ key: "status", label: `Try-On: ${statusFilter[0]}`, onRemove: () => setStatusFilter([]) });
    return f;
  }, [statusFilter]);

  const rowMarkup = filteredProducts.map(({ id, title, image, status, tryon_enabled }, index) => (
    <IndexTable.Row id={id} key={id} selected={selectedResources.includes(id)} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <Thumbnail source={image || "https://placehold.co/40x40/f1f1f1/999?text=?"} alt={title} size="small" />
          <Text variant="bodyMd" fontWeight="semibold" as="span">{title}</Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={status === "ACTIVE" ? "success" : "attention"}>
          {status === "ACTIVE" ? "Active" : status}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={tryon_enabled ? "success" : "subdued"} progress={tryon_enabled ? "complete" : "incomplete"}>
            {tryon_enabled ? "Enabled" : "Disabled"}
          </Badge>
          <Button
            size="slim"
            variant={tryon_enabled ? "secondary" : "primary"}
            onClick={() => handleToggle(id, !tryon_enabled)}
            loading={toggling.has(id)}
            disabled={toggling.has(id)}
          >
            {tryon_enabled ? "Disable" : "Enable"}
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const bulkActions = [
    { content: "Enable Try-On", onAction: handleBulkEnable },
    { content: "Disable Try-On", onAction: handleBulkDisable, destructive: true },
  ];

  const total = products.length;
  const enabledCount = products.filter((p) => p.tryon_enabled).length;

  return (
    <Page
      title="Manage Products"
      subtitle="Select products to enable or disable the Virtual Try-On widget"
      primaryAction={{ content: "Refresh Data", onAction: loadProducts, loading }}
      fullWidth
    >
      <TitleBar title="Products" />

      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Failed to load products" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        )}

        {/* Top Metric Cards for Products Page */}
        {!loading && total > 0 && (
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
             <Card background="bg-surface-secondary">
               <BlockStack gap="100">
                 <Text variant="heading2xl" as="p" fontWeight="bold">{total}</Text>
                 <Text variant="bodyMd" tone="subdued">Total Synced Products</Text>
               </BlockStack>
             </Card>
             <Card>
               <BlockStack gap="100">
                 <Text variant="heading2xl" as="p" fontWeight="bold" tone="success">{enabledCount}</Text>
                 <Text variant="bodyMd" tone="subdued">Active Widgets</Text>
               </BlockStack>
             </Card>
             <Card>
               <BlockStack gap="100">
                 <Text variant="heading2xl" as="p" fontWeight="bold">{total - enabledCount}</Text>
                 <Text variant="bodyMd" tone="subdued">Disabled Products</Text>
               </BlockStack>
             </Card>
          </InlineGrid>
        )}

        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <BlockStack gap="300">
                {[...Array(6)].map((_, i) => <ProductRowSkeleton key={i} />)}
              </BlockStack>
            </Box>
          ) : total === 0 ? (
            <EmptyState
              heading="No products found"
              action={{ content: "Reload", onAction: loadProducts }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Add products to your Shopify store and click refresh to start enabling Virtual Try-On.</p>
            </EmptyState>
          ) : (
            <div className="product-index-table">
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={filteredProducts.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                bulkActions={bulkActions}
                headings={[
                  { title: "Product" },
                  { title: "Store Status" },
                  { title: "Try-On Widget" },
                ]}
                filterControl={
                  <Filters
                    queryValue={searchValue}
                    queryPlaceholder="Search products by title..."
                    onQueryChange={setSearchValue}
                    onQueryClear={() => setSearchValue("")}
                    filters={[
                      {
                        key: "status",
                        label: "Widget Status",
                        filter: (
                          <ChoiceList
                            title="Widget Status"
                            titleHidden
                            choices={[
                              { label: "Enabled", value: "enabled" },
                              { label: "Disabled", value: "disabled" },
                            ]}
                            selected={statusFilter}
                            onChange={setStatusFilter}
                          />
                        ),
                        shortcut: true,
                      },
                    ]}
                    appliedFilters={activeFilters}
                    onClearAll={() => { setSearchValue(""); setStatusFilter([]); }}
                  />
                }
              >
                {filteredProducts.length === 0 ? (
                  <IndexTable.Row id="empty" position={0}>
                    <IndexTable.Cell colSpan={3}>
                      <Box padding="600">
                        <Text alignment="center" tone="subdued">
                          No products match your search/filter.
                        </Text>
                      </Box>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ) : (
                  rowMarkup
                )}
              </IndexTable>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
