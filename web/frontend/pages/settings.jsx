import { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  SkeletonBodyText,
  Divider,
  Box,
  Badge,
  Checkbox,
  ColorPicker,
  BlockStack,
  InlineStack,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

const CATEGORY_OPTIONS = [
  { label: "Auto-detect", value: "auto" },
  { label: "Tops", value: "tops" },
  { label: "Bottoms", value: "bottoms" },
  { label: "One-pieces", value: "one-pieces" },
];

// Local Color Conversion Utils
function hsbToHex({ hue, saturation, brightness }) {
  const s = saturation;
  const v = brightness;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;

  if (hue >= 0 && hue < 60) [r, g, b] = [c, x, 0];
  else if (hue >= 60 && hue < 120) [r, g, b] = [x, c, 0];
  else if (hue >= 120 && hue < 180) [r, g, b] = [0, c, x];
  else if (hue >= 180 && hue < 240) [r, g, b] = [0, x, c];
  else if (hue >= 240 && hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (val) => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsb(hex) {
  const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!rgb) return { hue: 0, saturation: 0, brightness: 0 };

  const r = parseInt(rgb[1], 16) / 255;
  const g = parseInt(rgb[2], 16) / 255;
  const b = parseInt(rgb[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;

  if (max !== min) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { hue: h * 360, saturation: s, brightness: max };
}

function hexToHsbSafe(hex) {
  try {
    return hexToHsb(hex || "#6366f1");
  } catch {
    return { hue: 240, saturation: 0.67, brightness: 0.95 };
  }
}

export default function SettingsPage() {
  const api = useApi();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Widget config state
  const [ctaText, setCtaText] = useState("Try On");
  const [category, setCategory] = useState("auto");
  const [aiEngine, setAiEngine] = useState("premium");
  const [primaryColor, setPrimaryColor] = useState({
    hue: 240,
    saturation: 0.67,
    brightness: 0.95,
  });
  const [overageEnabled, setOverageEnabled] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("/api/shop/settings");
      const s = data.settings;
      setSettings(s);
      setOverageEnabled(s.quota?.overage_enabled ?? true);
      setAiEngine(s.ai_engine || "premium");

      const cfg =
        typeof s.widget_config === "string"
          ? JSON.parse(s.widget_config || "{}")
          : (s.widget_config ?? {});

      setCtaText(cfg.cta_text ?? "Try On");
      setCategory(cfg.default_category ?? "auto");
      setPrimaryColor(hexToHsbSafe(cfg.primary_color));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.put("/api/shop/settings", {
        overage_enabled: overageEnabled,
        ai_engine: aiEngine,
        widget_config: {
          cta_text: ctaText,
          default_category: category,
          primary_color: hsbToHex(primaryColor),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Settings"
      primaryAction={{
        content: "Save Changes",
        onAction: handleSave,
        loading: saving,
      }}
    >
      <TitleBar title="Settings" />

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
        {saved && (
          <Banner
            tone="success"
            title="Success"
            onDismiss={() => setSaved(false)}
          >
            <p>Settings saved successfully!</p>
          </Banner>
        )}

        <Layout>
          {/* AI Engine & Plan info */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Plan & AI Engine
                  </Text>

                  {loading ? (
                    <SkeletonBodyText lines={2} />
                  ) : (
                    <InlineGrid columns={2} gap="400">
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued">
                          Current Plan
                        </Text>
                        <Badge tone="info">
                          {settings?.plan?.charAt(0).toUpperCase() +
                            settings?.plan?.slice(1)}
                        </Badge>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued">
                          Monthly Quota
                        </Text>
                        <Text variant="bodyMd">
                          {settings?.quota?.used} / {settings?.quota?.limit}{" "}
                          generations
                        </Text>
                      </BlockStack>
                    </InlineGrid>
                  )}

                  <Divider />

                  <Select
                    label="AI Generation Engine"
                    options={[
                      {
                        label: "Premium (fashn.ai) - Fast & Reliable",
                        value: "premium",
                      },
                      {
                        label: "Community (Hugging Face) - Free but Slow",
                        value: "community",
                      },
                      {
                        label: "Mock Mode - For UI testing only",
                        value: "mock",
                      },
                    ]}
                    value={aiEngine}
                    onChange={setAiEngine}
                    helpText="Choose your AI processing source. Community mode is free but may have significant wait times."
                    disabled={loading}
                  />

                  <Checkbox
                    label="Allow over-quota generations (additional charges apply)"
                    checked={overageEnabled}
                    onChange={setOverageEnabled}
                    disabled={loading}
                  />
                </BlockStack>
              </Card>

              {/* Widget Appearance */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Widget Appearance
                  </Text>
                  <Divider />

                  <TextField
                    label="Try On button text"
                    value={ctaText}
                    onChange={setCtaText}
                    autoComplete="off"
                    helpText="Label displayed on the 'Try On' button in your product pages."
                    disabled={loading}
                  />

                  <Select
                    label="Default product category"
                    options={CATEGORY_OPTIONS}
                    value={category}
                    onChange={setCategory}
                    helpText="Helps the AI identify the type of garment."
                    disabled={loading}
                  />

                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="label">
                      Primary Brand Color
                    </Text>
                    <InlineStack gap="400" align="start">
                      <Box
                        borderColor="border"
                        borderWidth="025"
                        borderRadius="200"
                        padding="0"
                        overflowX="hidden"
                        overflowY="hidden"
                      >
                        <ColorPicker
                          onChange={setPrimaryColor}
                          color={primaryColor}
                        />
                      </Box>
                      <BlockStack gap="100">
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "4px",
                            backgroundColor: hsbToHex(primaryColor),
                            border: "1px solid #ddd",
                          }}
                        />
                        <Text variant="bodySm" tone="subdued">
                          HEX: <code>{hsbToHex(primaryColor)}</code>
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Sidebar Info/Tips */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    Need Help?
                  </Text>
                  <Text as="p" tone="subdued">
                    Premium engine requires an API Key. Ensure your account is
                    topped up.
                  </Text>
                  <Button
                    variant="tertiary"
                    url="https://app.fashn.ai"
                    external
                  >
                    Go to Fashn.ai
                  </Button>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    Widget Tips
                  </Text>
                  <Text as="p" tone="subdued">
                    Choose a primary color that matches your theme's brand color
                    for the best customer experience.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
