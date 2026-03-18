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
  Button,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useApi } from "../utils/api";

const CATEGORY_OPTIONS = [
  { label: "Auto-detect (Recommended)", value: "auto" },
  { label: "Tops / Shirts / Jackets", value: "tops" },
  { label: "Bottoms / Pants / Skirts", value: "bottoms" },
  { label: "One-pieces / Dresses", value: "one-pieces" },
];

const DEFAULT_GEMINI_PROMPT =
  "You are a professional photo editor. I will give you two images:\n" +
  "1. A photo of a person (customer)\n" +
  "2. A product/garment image\n\n" +
  "Your task: Place the person wearing the garment in a clean, professional " +
  "product store setting. The result should look photorealistic, " +
  "well-lit, and suitable for an e-commerce product page. " +
  "Keep the person's face, skin tone, and body proportions exactly the same. " +
  "The garment should fit naturally on the person.";

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
  const sv = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { hue: h * 360, saturation: sv, brightness: max };
}

export default function SettingsPage() {
  const api = useApi();
  const shopify = useAppBridge();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [globalEnable, setGlobalEnable] = useState(true);
  const [ctaText, setCtaText] = useState("Try On with Fitly");
  const [category, setCategory] = useState("auto");
  const [primaryColor, setPrimaryColor] = useState({ hue: 240, saturation: 0.67, brightness: 0.95 });
  const [overageEnabled, setOverageEnabled] = useState(true);
  const [geminiPrompt, setGeminiPrompt] = useState(DEFAULT_GEMINI_PROMPT);

  const savedRef = useRef(null);
  const hexColor = useMemo(() => hsbToHex(primaryColor), [primaryColor]);

  const isDirty = useMemo(() => {
    if (!savedRef.current) return false;
    const s = savedRef.current;
    return (
      globalEnable !== s.globalEnable ||
      ctaText !== s.ctaText ||
      category !== s.category ||
      overageEnabled !== s.overageEnabled ||
      hexColor !== hsbToHex(s.primaryColor) ||
      geminiPrompt !== s.geminiPrompt
    );
  }, [globalEnable, ctaText, category, overageEnabled, primaryColor, hexColor, geminiPrompt]);

  useEffect(() => {
    const saveBarNode = document.getElementById("app-bridge-save-bar");
    if (saveBarNode) { isDirty ? saveBarNode.show() : saveBarNode.hide(); }
  }, [isDirty]);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get("/api/shop/settings");
      const s = data.settings;

      const cfg = typeof s.widget_config === "string"
        ? JSON.parse(s.widget_config || "{}")
        : (s.widget_config ?? s.widget ?? {});

      const formState = {
        globalEnable: cfg.global_enable ?? true,
        ctaText: cfg.cta_text ?? "Try On with Fitly",
        category: cfg.default_category ?? "auto",
        overageEnabled: s.quota?.overage_enabled ?? true,
        primaryColor: hexToHsb(cfg.primary_color || "#6366f1"),
        geminiPrompt: cfg.gemini_prompt ?? s.gemini_prompt ?? DEFAULT_GEMINI_PROMPT,
      };

      setGlobalEnable(formState.globalEnable);
      setCtaText(formState.ctaText);
      setCategory(formState.category);
      setOverageEnabled(formState.overageEnabled);
      setPrimaryColor(formState.primaryColor);
      setGeminiPrompt(formState.geminiPrompt);
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
        gemini_prompt: geminiPrompt,
        widget_config: {
          global_enable: globalEnable,
          cta_text: ctaText,
          default_category: category,
          primary_color: hexColor,
          gemini_prompt: geminiPrompt,
        },
      });
      savedRef.current = { globalEnable, ctaText, category, overageEnabled, primaryColor, geminiPrompt };
      setCtaText((v) => v);
      shopify.toast.show("Settings saved successfully");
      const saveBarNode = document.getElementById("app-bridge-save-bar");
      if (saveBarNode) saveBarNode.hide();
    } catch (e) {
      setError(e.message);
      shopify.toast.show("Could not save: " + e.message, { isError: true });
    } finally {
      setSaving(false);
    }
  }, [api, shopify, globalEnable, ctaText, category, overageEnabled, primaryColor, hexColor, geminiPrompt]);

  const handleDiscard = useCallback(() => {
    if (!savedRef.current) return;
    const s = savedRef.current;
    setGlobalEnable(s.globalEnable);
    setCtaText(s.ctaText);
    setCategory(s.category);
    setOverageEnabled(s.overageEnabled);
    setPrimaryColor(s.primaryColor);
    setGeminiPrompt(s.geminiPrompt ?? DEFAULT_GEMINI_PROMPT);
    const saveBarNode = document.getElementById("app-bridge-save-bar");
    if (saveBarNode) saveBarNode.hide();
  }, []);

  return (
    <Page>
      <TitleBar title="Settings" />

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

        {/* ── SECTION 1: GLOBAL VISIBILITY ── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Widget Visibility"
            description="Control whether the Fitly Try-On button appears on your storefront. Enable the App Embed in your Theme Editor."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200"><SkeletonBodyText lines={2} /></BlockStack>
              ) : (
                <BlockStack gap="400">
                  <Checkbox
                    label="Enable Fitly Try-On globally"
                    helpText="Shows the Try-On button on every product page. You can also control per-product visibility from the Products page."
                    checked={globalEnable}
                    onChange={setGlobalEnable}
                  />
                  {!globalEnable && (
                    <Box paddingBlockStart="200">
                      <Banner tone="info" title="Widget is inactive">
                        The Try-On button is hidden from all products.
                      </Banner>
                    </Box>
                  )}
                </BlockStack>
              )}
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        <Divider />

        {/* ── SECTION 2: GEMINI AI CONFIGURATION ── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Gemini AI Configuration"
            description="Fitly uses Google Gemini to generate photorealistic try-on results (~20s). Customize the generation prompt to match your brand style."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={4} />
                </BlockStack>
              ) : (
                <BlockStack gap="400">
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200" borderColor="border" borderWidth="025">
                    <InlineStack gap="200" blockAlign="center">
                      <div style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: "linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)"
                      }} />
                      <Text variant="bodySm" tone="subdued">Powered by Google Gemini — engine is fixed to ensure consistent quality</Text>
                    </InlineStack>
                  </Box>

                  <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderColor="border" borderWidth="025">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="medium">Generation Prompt</Text>
                        <Button size="slim" variant="plain" onClick={() => setGeminiPrompt(DEFAULT_GEMINI_PROMPT)}>
                          Reset to default
                        </Button>
                      </InlineStack>
                      <TextField
                        label=""
                        labelHidden
                        value={geminiPrompt}
                        onChange={setGeminiPrompt}
                        multiline={6}
                        autoComplete="off"
                        helpText="Both the customer photo and the product image are sent automatically — this prompt instructs how Gemini should compose the result."
                      />
                    </BlockStack>
                  </Box>

                  <Divider />
                  <Checkbox
                    label="Allow over-quota usage billing"
                    helpText="Generations beyond your plan's monthly limit are billed at your plan's overage rate to prevent service interruption."
                    checked={overageEnabled}
                    onChange={setOverageEnabled}
                  />
                </BlockStack>
              )}
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        <Divider />

        {/* ── SECTION 3: STOREFRONT DESIGNER ── */}
        <Layout>
          <Layout.AnnotatedSection
            title="Storefront Designer"
            description="Customize the Try-On button to match your Shopify theme."
          >
            <Card roundedAbove="sm">
              {loading ? (
                <BlockStack gap="200"><SkeletonBodyText lines={6} /></BlockStack>
              ) : (
                <BlockStack gap="500">
                  <TextField
                    label="Button label"
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
                    helpText="Used if Gemini cannot auto-detect the garment type from product tags."
                  />

                  <BlockStack gap="300">
                    <Text variant="bodyMd" as="label" fontWeight="medium">Brand Color</Text>
                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="start">
                      <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderColor="border" borderWidth="025">
                        <BlockStack gap="400" align="center">
                          <ColorPicker onChange={setPrimaryColor} color={primaryColor} />
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <div style={{ width: 24, height: 24, backgroundColor: hexColor, borderRadius: 4, border: "1px solid #C9CCCF" }} />
                            <Text variant="bodyMd"><code>{hexColor}</code></Text>
                          </InlineStack>
                        </BlockStack>
                      </Box>

                      <Box padding="400" borderRadius="200" background="bg-surface" shadow="100" borderColor="border" borderWidth="025">
                        <BlockStack gap="400" align="center">
                          <Text variant="bodySm" tone="subdued">Storefront Preview</Text>
                          <div style={{ width: "100%", maxWidth: "280px", margin: "0 auto" }}>
                            <BlockStack gap="300">
                              <Box background="bg-surface-secondary" padding="600" borderRadius="100" />
                              <SkeletonBodyText lines={2} />
                              <button
                                style={{
                                  width: "100%", padding: "12px 16px", borderRadius: "4px",
                                  backgroundColor: hexColor, color: "#ffffff", border: "none",
                                  fontSize: "14px", fontWeight: "500", letterSpacing: "0.5px",
                                  fontFamily: "inherit", boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                                  cursor: "not-allowed",
                                }}
                                disabled
                              >
                                {ctaText || "Try On with Fitly"}
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

        <Box paddingBlockEnd="1600" />
      </BlockStack>
    </Page>
  );
}
