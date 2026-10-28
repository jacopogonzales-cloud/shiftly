// Bryntum Scheduler at runtime, from the files scripts/vendor-bryntum.mjs copies into public/vendor/bryntum.
// The module is never bundled (webpackIgnore + a URL Next serves as a static file); only its types are imported.
import type * as Bryntum from "@bryntum/scheduler";

const BASE = "/vendor/bryntum";
const MODULE_URL = `${BASE}/scheduler.module.js`;
const STYLES = ["scheduler.css", "svalbard-light.css", "fontawesome/css/fontawesome.css", "fontawesome/css/solid.css"].map((f) => `${BASE}/${f}`);

export type BryntumModule = typeof Bryntum;

let loading: Promise<BryntumModule> | null = null;

/** Vendor CSS goes before the app's own stylesheets, so scheduler-theme.css wins ties as with a normal import order. */
function stylesheet(href: string): Promise<void> {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[data-bryntum="${href}"]`);
  if (existing?.sheet) return Promise.resolve();
  const link = existing ?? document.createElement("link");
  const done = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error(`Couldn't load ${href}`)), { once: true });
  });
  if (!existing) {
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.bryntum = href;
    const firstAppStyle = document.head.querySelector('link[rel="stylesheet"]:not([data-bryntum]), style');
    document.head.insertBefore(link, firstAppStyle);
  }
  return done;
}

/** Loads the module and its CSS once per page; Bryntum measures rows and headers, so the CSS must be in first. */
export function loadBryntum(): Promise<BryntumModule> {
  loading ??= Promise.all([import(/* webpackIgnore: true */ MODULE_URL) as Promise<BryntumModule>, ...STYLES.map(stylesheet)])
    .then(([mod]) => mod)
    .catch((err) => {
      // Let a retry start over, without waiting on links that already failed.
      loading = null;
      for (const link of document.head.querySelectorAll<HTMLLinkElement>("link[data-bryntum]")) if (!link.sheet) link.remove();
      throw err;
    });
  return loading;
}
