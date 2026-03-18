import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  ProgressBar,
  Button,
  Banner,
  SkeletonDisplayText,
  SkeletonBodyText,
  Box,
  BlockStack,
  InlineStack,
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../utils/api";

const PLAN_BADGE_TONE = {
  free: "info",
  starter: "success",
  growth: "success",
  scale: "warning",
  pro: "attention",
  enterprise: "magic",
};

const ENGINE_META = {
  gemini: { label: "Gemini (Google AI)", tone: "magic" },
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
      setError(null);
      const data = await api.get("/api/shop/settings");
      setSettings(data.settings);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const quotaUsed = settings?.quota?.used ?? 0;
  const quotaLimit = settings?.quota?.limit ?? 0;
  const quotaPercent = useMemo(
    () => (quotaLimit > 0 ? Math.min((quotaUsed / quotaLimit) * 100, 100) : 0),
    [quotaUsed, quotaLimit]
  );
  const remaining = settings?.quota?.remaining ?? 0;
  const planKey = settings?.plan ?? "free";
  const planName = planKey.charAt(0).toUpperCase() + planKey.slice(1);
  const engineKey = settings?.ai_engine ?? "community";
  const engine = ENGINE_META[engineKey] ?? ENGINE_META.community;

  // Render Skeleton for a Metric Card
  const renderMetricSkeleton = () => (
    <BlockStack gap="200">
      <SkeletonDisplayText size="small" />
      <SkeletonBodyText lines={2} />
    </BlockStack>
  );

  return (
    <Page fullWidth>
      <TitleBar title="Dashboard" />

      <BlockStack gap="500">
        {/* Error State */}
        {error && (
          <Banner
            tone="critical"
            title="Failed to load dashboard data"
            onDismiss={() => setError(null)}
            action={{ content: "Retry", onAction: loadSettings }}
          >
            <p>{error}</p>
          </Banner>
        )}

        <Layout>
          {/* ─────────────────────────────────────────────────────────────
              MAIN COLUMN: HERO AND GETTING STARTED (2/3 Width)
              ───────────────────────────────────────────────────────────── */}
          <Layout.Section>
            <BlockStack gap="500">
              
              {/* Modern Hero Banner */}
              <Box 
                padding="600" 
                background="bg-surface-secondary" 
                borderRadius="300" 
                borderColor="border" 
                borderWidth="025"
                shadow="100"
              >
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <BlockStack gap="400">
                    <Text variant="heading2xl" as="h1">
                      Welcome to Fitly ✨
                    </Text>
                    <Text variant="bodyLg" tone="subdued">
                      Increase conversions by letting customers virtually try on your products — powered by Google Gemini AI.
                    </Text>
                    <Box paddingBlockStart="200">
                      <Button variant="primary" size="large" onClick={() => navigate("/settings")}>
                        Configure Application
                      </Button>
                    </Box>
                  </BlockStack>

                  {/* Clean geometric shapes placeholder for modern feel */}
                  <div style={{ paddingLeft: '40px', paddingRight: '20px', display: "none" }} className="md:block">
                     <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <circle cx="60" cy="60" r="60" fill="#E4E5E7"/>
                       <rect x="30" y="30" width="60" height="60" rx="12" fill="#FFFFFF"/>
                     </svg>
                  </div>
                </InlineStack>
              </Box>

              {/* Quick Setup Checklist */}
              <Text variant="headingLg" as="h2">Getting Started Guide</Text>
              
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                {/* Step 1 */}
                <Card roundedAbove="sm">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Badge tone="info">Step 1</Badge>
                    </InlineStack>
                    <Text variant="headingMd" as="h3">Activate App Embed</Text>
                    <Text variant="bodyMd" tone="subdued">
                      Enable the Fitly App Embed in your Theme Editor. The Try-On button will appear automatically below Add-to-Cart on every product page.
                    </Text>
                    <Box paddingBlockStart="200">
                      <Button variant="secondary" external url={`https://${window.shopify?.config?.shop}/admin/themes/current/editor?context=apps`}>
                        Open Theme Editor
                      </Button>
                    </Box>
                  </BlockStack>
                </Card>

                {/* Step 2 */}
                <Card roundedAbove="sm">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Badge tone="success">Step 2</Badge>
                    </InlineStack>
                    <Text variant="headingMd" as="h3">Configure Fitly</Text>
                    <Text variant="bodyMd" tone="subdued">
                      Customize the button look, tweak the Gemini generation prompt, and manage which products show the Try-On button.
                    </Text>
                    <Box paddingBlockStart="200">
                      <Button variant="secondary" onClick={() => navigate("/settings")}>
                        Go to Settings
                      </Button>
                    </Box>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </BlockStack>
          </Layout.Section>

          {/* ─────────────────────────────────────────────────────────────
              SIDE COLUMN: USAGE AND PLAN INFO (1/3 Width)
              ───────────────────────────────────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              
              {/* Account Usage & Plan Details */}
              <Card roundedAbove="sm">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">Account Usage</Text>
                    <Badge tone={PLAN_BADGE_TONE[planKey] ?? "info"}>{planName} Plan</Badge>
                  </InlineStack>
                  <Divider />

                  {loading ? (
                    renderMetricSkeleton()
                  ) : (
                    <BlockStack gap="400">
                      <BlockStack gap="100">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodyMd" fontWeight="medium">Generations Used</Text>
                          <Text variant="bodyMd">{quotaUsed} / {quotaLimit}</Text>
                        </InlineStack>
                        <ProgressBar
                          progress={quotaPercent}
                          tone={quotaPercent >= 90 ? "critical" : quotaPercent >= 70 ? "warning" : "highlight"}
                          size="small"
                        />
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="200">
                         <Text variant="bodySm" tone="subdued">
                           You have <strong>{remaining}</strong> requests left this month.
                         </Text>
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="medium">AI Engine</Text>
                            <Badge tone="magic">Gemini (Google AI)</Badge>
                          </InlineStack>
                      </BlockStack>

                      {quotaPercent >= 80 && (
                        <Box paddingBlockStart="200">
                          <Banner
                            tone={quotaPercent >= 90 ? "critical" : "warning"}
                            title={quotaPercent >= 90 ? "Quota Critical" : "Quota Low"}
                          >
                            <p>Upgrade to avoid disruptions.</p>
                          </Banner>
                        </Box>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Need Help Card */}
              <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderWidth="025" borderColor="border">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Platform Support</Text>
                  <Text variant="bodyMd" tone="subdued">
                    Read the official documentation to optimize your widget placement or contact technical support for custom integration help.
                  </Text>
                  <InlineStack gap="200">
                    <Button variant="tertiary" external url="https://help.shopify.com">
                      View Documentation
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Box>

            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
