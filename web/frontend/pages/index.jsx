import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  ProgressBar,
  Button,
  Banner,
  SkeletonBodyText,
  Divider,
  Box,
  BlockStack,
  InlineStack,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../utils/api";

const PLAN_BADGE_MAP = {
  free: "info",
  starter: "success",
  growth: "success",
  scale: "warning",
  pro: "attention",
  enterprise: "new",
};

export default function HomePage() {
  const api = useApi();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("/api/shop/settings");
      setSettings(data.settings);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const quotaUsed = settings?.quota?.used ?? 0;
  const quotaLimit = settings?.quota?.limit ?? 0;
  const quotaPercent =
    quotaLimit > 0 ? Math.min((quotaUsed / quotaLimit) * 100, 100) : 0;
  const remaining = settings?.quota?.remaining ?? 0;
  const planKey = settings?.plan ?? "free";
  const planName = planKey.charAt(0).toUpperCase() + planKey.slice(1);

  return (
    <Page>
      <TitleBar title="Dashboard" />

      <BlockStack gap="400">
        {error && (
          <Banner
            tone="critical"
            title="Could not load data"
            onDismiss={() => setError(null)}
          >
            <p>{error}</p>
          </Banner>
        )}

        <Layout>
          {/* Quota Overview */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">
                    Monthly Quota
                  </Text>
                  <Badge tone={PLAN_BADGE_MAP[planKey] ?? "info"}>
                    {planName} Plan
                  </Badge>
                </InlineStack>

                {loading ? (
                  <SkeletonBodyText lines={3} />
                ) : (
                  <BlockStack gap="200">
                    <ProgressBar
                      progress={quotaPercent}
                      tone={
                        quotaPercent >= 90
                          ? "critical"
                          : quotaPercent >= 70
                            ? "warning"
                            : "highlight"
                      }
                      size="medium"
                    />
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued">
                        Used: <strong>{quotaUsed}</strong> / {quotaLimit}{" "}
                        generations
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Remaining: <strong>{remaining}</strong>
                      </Text>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Quick Stats Grid */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {loading ? "—" : quotaUsed}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Total Try-Ons (This Month)
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {loading ? "—" : remaining}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Generations Remaining
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {loading ? "—" : planName}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Active Plan
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Quick Actions
                </Text>
                <Divider />
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={() => navigate("/products")}
                  >
                    Manage Products
                  </Button>
                  <Button onClick={() => navigate("/settings")}>
                    Widget Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
