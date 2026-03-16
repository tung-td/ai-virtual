import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
  Checkbox,
  ColorPicker,
  BlockStack,
  InlineStack,
  Divider,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

const CATEGORY_OPTIONS = [
  { label: "Auto-detect (Recommended)", value: "auto" },
  { label: "Tops / Shirts / Jackets", value: "tops" },
  { label: "Bottoms / Pants / Skirts", value: "bottoms" },
  { label: "One-pieces / Dresses", value: "one-pieces" },
];

const AI_ENGINE_OPTIONS = [
  { label: "Premium Engine (fashn.ai)", value: "premium" },
  { label: "Community Engine (HuggingFace)", value: "community" },
  { label: "Development Mocking", value: "mock" },
];

/** --- HSB <-> HEX Helpers --- */
function hsbToHex({ hue, saturation, brightness }) {
  const s = saturation, v = brightness;
  const c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const h = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToHsb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { hue: 240, saturation: 0.67, brightness: 0.95 };
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { hue: h * 360, saturation: s, brightness: max };
}

export default function SettingsPage() {
  const api = useApi();
  const shopify = useAppBridge();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [globalEnable, setGlobalEnable] = useState(true);
  const [ctaText, setCtaText] = useState("Virtual Try-On");
  const [category, setCategory] = useState("auto");
  const [aiEngine, setAiEngine] = useState("premium");
  const [primaryColor, setPrimaryColor] = useState({ hue: 240, saturation: 0.67, brightness: 0.95 });
  const [overageEnabled, setOverageEnabled] = useState(true);

  // Tracking baseline for dirty/clean state
  const savedRef = useRef(null);
  const hexColor = useMemo(() => hsbToHex(primaryColor), [primaryColor]);

  const isDirty = useMemo(() => {
    if (!savedRef.current) return false;
    const s = savedRef.current;
    return (
      globalEnable !== s.globalEnable ||
      ctaText !== s.ctaText ||
      category !== s.category ||
      aiEngine !== s.aiEngine ||
      overageEnabled !== s.overageEnabled ||
      hexColor !== hsbToHex(s.primaryColor)
    );
  }, [globalEnable, ctaText, category, aiEngine, overageEnabled, primaryColor, hexColor]);

  // Handle native SaveBar visibility purely via DOM for reliability with <ui-save-bar>
  useEffect(() => {
    const saveBarNode = document.getElementById("app-bridge-save-bar");
    if (saveBarNode) {
      if (isDirty) {
        saveBarNode.show();
      } else {
        saveBarNode.hide();
      }
    }
  }, [isDirty]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get("/api/shop/settings");
      const s = data.settings;

      const cfg = typeof s.widget_config === "string" ? JSON.parse(s.widget_config || "{}") : (s.widget_config ?? {});

      const formState = {
        globalEnable: cfg.global_enable ?? true,
        ctaText: cfg.cta_text ?? "Virtual Try-On",
        category: cfg.default_category ?? "auto",
        aiEngine: s.ai_engine || "premium",
        overageEnabled: s.quota?.overage_enabled ?? true,
        primaryColor: hexToHsb(cfg.primary_color || "#6366f1"),
      };

      setGlobalEnable(formState.globalEnable);
      setCtaText(formState.ctaText);
      setCategory(formState.category);
      setAiEngine(formState.aiEngine);
      setOverageEnabled(formState.overageEnabled);
      setPrimaryColor(formState.primaryColor);
      savedRef.current = formState;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      await api.put("/api/shop/settings", {
        overage_enabled: overageEnabled,
        ai_engine: aiEngine,
        widget_config: {
          global_enable: globalEnable,
          cta_text: ctaText,
          default_category: category,
          primary_color: hexColor,
        },
      });
      // Accept changes as new baseline
      savedRef.current = { globalEnable, ctaText, category, aiEngine, overageEnabled, primaryColor };
      // Force an update
      setCtaText((v) => v);
      shopify.toast.show("Configuration applied successfully");

      const saveBarNode = document.getElementById("app-bridge-save-bar");
      if (saveBarNode) saveBarNode.hide();

    } catch (e) {
      setError(e.message);
      shopify.toast.show("Could not save settings: " + e.message, { isError: true });
    } finally {
      setSaving(false);
    }
  }, [api, shopify, globalEnable, ctaText, category, aiEngine, overageEnabled, primaryColor, hexColor]);

  const handleDiscard = useCallback(() => {
    if (!savedRef.current) return;
    const s = savedRef.current;
    setGlobalEnable(s.globalEnable);
    setCtaText(s.ctaText);
    setCategory(s.category);
    setAiEngine(s.aiEngine);
    setOverageEnabled(s.overageEnabled);
    setPrimaryColor(s.primaryColor);
    
    const saveBarNode = document.getElementById("app-bridge-save-bar");
    if (saveBarNode) saveBarNode.hide();
  }, []);

  return (
    <Page>
      <TitleBar title="Settings" />

      {/* --- Native UI Component provided by Shopify App Bridge V4 --- */}
      <ui-save-bar id="app-bridge-save-bar">
        <button variant="primary" onClick={handleSave} disabled={saving}></button>
        <button onClick={handleDiscard} disabled={saving}></button>
      </ui-save-bar>

      <BlockStack gap="500">
        
        {error && (
          <Banner tone="critical" title="Save Error" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        )}

        {/* ────────── SECTION 1: GLOBAL VISIBILITY ────────── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Widget Visibility"
            description="Control whether the Virtual Try-On widget appears on your storefront. Ensure the App Block is enabled in your Theme Editor."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200"><SkeletonBodyText lines={2} /></BlockStack>
              ) : (
                <BlockStack gap="400">
                  <Checkbox
                    label="Enable Virtual Try-On globally"
                    helpText="Shows the Try-On button on every product page automatically."
                    checked={globalEnable}
                    onChange={setGlobalEnable}
                  />
                  {!globalEnable && (
                    <Box paddingBlockStart="200">
                      <Banner tone="info" title="Widget is inactive">
                        The Try-On button will be hidden from all your products.
                      </Banner>
                    </Box>
                  )}
                </BlockStack>
              )}
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        <Divider />

        {/* ────────── SECTION 2: AI PROVIDER SETUP ────────── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Processing Platform"
            description="Select the engine that powers the Try-On feature. Premium runs quickly (~15s) with high consistency. Community operates on a shared free queue and may take minutes."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={2} />
                </BlockStack>
              ) : (
                <BlockStack gap="500">
                  <Select
                    label="Active AI Engine"
                    options={AI_ENGINE_OPTIONS}
                    value={aiEngine}
                    onChange={setAiEngine}
                  />
                  <Divider />
                  <Checkbox
                    label="Allow over-quota usage billing"
                    helpText="Generations beyond your monthly limit are billed automatically at your plan's standard overage rate to prevent feature interruption."
                    checked={overageEnabled}
                    onChange={setOverageEnabled}
                  />
                </BlockStack>
              )}
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        <Divider />

        {/* ────────── SECTION 3: STOREFRONT DESIGNER ────────── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Storefront Designer"
            description="Adapt the try-on button to blend perfectly with your existing Shopify theme."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200"><SkeletonBodyText lines={6} /></BlockStack>
              ) : (
                <BlockStack gap="500">
                  
                  <TextField
                    label="Call to action text"
                    value={ctaText}
                    onChange={setCtaText}
                    maxLength={32}
                    showCharacterCount
                  />

                  <Select
                    label="Fallback Garment Category"
                    options={CATEGORY_OPTIONS}
                    value={category}
                    onChange={setCategory}
                    helpText="Used if the app cannot automatically detect the correct garment type from the product's Shopify tags."
                  />

                  {/* Modern Split Preview layout using Flex InlineGrid */}
                  <BlockStack gap="300">
                    <Text variant="bodyMd" as="label" fontWeight="medium">Brand Hex Color</Text>
                    
                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="start">
                      
                      {/* Left side: Actual color picker control */}
                      <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderColor="border" borderWidth="025">
                         <BlockStack gap="400" align="center">
                            <ColorPicker onChange={setPrimaryColor} color={primaryColor} />
                            
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <div style={{ width: 24, height: 24, backgroundColor: hexColor, borderRadius: 4, border: "1px solid #C9CCCF" }} />
                              <Text variant="bodyMd"><code>{hexColor}</code></Text>
                            </InlineStack>
                         </BlockStack>
                      </Box>
                      
                      {/* Right side: Storefront Preview Mockup */}
                      <Box padding="400" borderRadius="200" background="bg-surface" shadow="100" borderColor="border" borderWidth="025">
                        <BlockStack gap="400" align="center">
                          <Text variant="bodySm" tone="subdued">Storefront Preview</Text>
                          
                          {/* Fake product card skeleton */}
                          <div style={{ width: "100%", maxWidth: "280px", margin: "0 auto" }}>
                            <BlockStack gap="300">
                              <Box background="bg-surface-secondary" padding="600" borderRadius="100" />
                              <SkeletonBodyText lines={2} />
                              
                              {/* The live button */}
                              <button
                                style={{
                                  width: "100%",
                                  padding: "12px 16px",
                                  borderRadius: "4px",
                                  backgroundColor: hexColor,
                                  color: "#ffffff",
                                  border: "none",
                                  fontSize: "14px",
                                  fontWeight: "500",
                                  letterSpacing: "0.5px",
                                  fontFamily: "inherit",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                                  cursor: "not-allowed"
                                }}
                                disabled
                              >
                                {ctaText || "Virtual Try-On"}
                              </button>
                            </BlockStack>
                          </div>
                        </BlockStack>
                      </Box>

                    </InlineGrid>
                  </BlockStack>
                </BlockStack>
              )}
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Bottom spacer */}
        <Box paddingBlockEnd="1600" />
      </BlockStack>
    </Page>
  );
}
