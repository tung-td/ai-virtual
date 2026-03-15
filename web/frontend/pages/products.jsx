import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Thumbnail,
  Button,
  Banner,
  SkeletonBodyText,
  Divider,
  Box,
  IndexTable,
  useIndexResourceState,
  BlockStack,
  InlineStack,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

export default function ProductsPage() {
  const api = useApi();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

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

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleToggle = useCallback(
    async (productId, enabled) => {
      try {
        const encodedId = encodeURIComponent(productId);
        await api.post(`/api/products/${encodedId}/tryon`, { enabled });
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId ? { ...p, tryon_enabled: enabled } : p,
          ),
        );
        setToast(`Try-On ${enabled ? "enabled" : "disabled"} for product.`);
        setTimeout(() => setToast(null), 3000);
      } catch (e) {
        setError(`Update failed: ${e.message}`);
      }
    },
    [api],
  );

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products);

  const rowMarkup = products.map(
    ({ id, title, image, status, tryon_enabled }, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell>
          <InlineStack gap="300" align="start" blockAlign="center">
            <Thumbnail
              source={image || "https://placehold.co/40x40/eee/999?text=?"}
              alt={title}
              size="small"
            />
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {title}
            </Text>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={status === "ACTIVE" ? "success" : "attention"}>
            {status}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="start" blockAlign="center">
            <Badge tone={tryon_enabled ? "success" : "subdued"}>
              {tryon_enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button
              size="slim"
              variant={tryon_enabled ? "secondary" : "primary"}
              onClick={() => handleToggle(id, !tryon_enabled)}
            >
              {tryon_enabled ? "Disable" : "Enable"}
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  const emptyStateMarkup = !loading && products.length === 0 && (
    <EmptyState
      heading="No products found"
      action={{ content: "Refresh", onAction: loadProducts }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>
        Make sure you have products in your Shopify store to enable Try-On
        feature.
      </p>
    </EmptyState>
  );

  return (
    <Page
      title="Manage Products"
      primaryAction={{ content: "Refresh", onAction: loadProducts }}
    >
      <TitleBar title="Products" />

      <BlockStack gap="400">
        {error && (
          <Banner
            tone="critical"
            title="Error"
            onDismiss={() => setError(null)}
          >
            <p>{error}</p>
          </Banner>
        )}

        {toast && (
          <Banner tone="success" onDismiss={() => setToast(null)}>
            <p>{toast}</p>
          </Banner>
        )}

        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <BlockStack gap="200">
                <SkeletonBodyText lines={6} />
              </BlockStack>
            </Box>
          ) : products.length > 0 ? (
            <IndexTable
              resourceName={resourceName}
              itemCount={products.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Product" },
                { title: "Shopify Status" },
                { title: "Try-On Status" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          ) : (
            emptyStateMarkup
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
