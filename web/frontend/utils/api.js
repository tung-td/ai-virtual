import { useMemo } from "react";

/**
 * api.js — Authenticated fetch helper for the Shopify embedded app frontend.
 */
export function useApi() {
  const fetchFn = window.shopify?.fetch || fetch;

  return useMemo(() => {
    async function request(url, options = {}) {
      const response = await fetchFn(url, {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        const error = new Error(
          data.error ?? `Request failed: ${response.status}`,
        );
        // @ts-ignore
        error.code = data.code;
        // @ts-ignore
        error.status = response.status;
        throw error;
      }

      return data;
    }

    return {
      get: (url) => request(url, { method: "GET" }),
      post: (url, body) =>
        request(url, { method: "POST", body: JSON.stringify(body) }),
      put: (url, body) =>
        request(url, { method: "PUT", body: JSON.stringify(body) }),
      del: (url) => request(url, { method: "DELETE" }),
    };
  }, [fetchFn]);
}
