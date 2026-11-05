const VERSION = "v8";
const SHELL = `mc-shell-${VERSION}`;
const ITEMS = "mc-items";
const FONTS = "mc-fonts";

const SHELL_FILES = [
    "./",
    "index.html",
    "style.css",
    "app.js",
    "data.csv",
    "manifest.webmanifest",
    "Assets/Icons/apple-touch-icon.png",
    "Assets/Icons/icon-192.png",
    "Assets/Icons/icon-512.png",
    "Assets/Resources/Logo.png",
    "Assets/Resources/Table.svg",
    "Assets/Resources/Grid.svg",
];

self.addEventListener("install", e => {
    e.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        await Promise.allSettled(SHELL_FILES.map(f => cache.add(new Request(f, { cache: "reload" }))));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", e => {
    e.waitUntil((async () => {
        const keep = new Set([SHELL, ITEMS, FONTS]);
        for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
        await self.clients.claim();
    })());
});

const networkFirst = async (req, cacheName, fallbackKey, init) => {
    const cache = await caches.open(cacheName);
    try {
        const res = await fetch(req, init);
        if (res.ok) cache.put(fallbackKey || req, res.clone());
        return res;
    } catch (err) {
        const hit = await cache.match(fallbackKey || req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
    }
};

const cacheFirst = async (req, cacheName) => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
};

const staleWhileRevalidate = async (req, cacheName, e) => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req);
    const refresh = fetch(req).then(res => {
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
    }).catch(() => hit || Response.error());
    if (e) e.waitUntil(refresh);
    return hit || refresh;
};

self.addEventListener("fetch", e => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
        e.respondWith(staleWhileRevalidate(req, FONTS, e));
        return;
    }

    if (url.origin !== location.origin) return;

    if (req.mode === "navigate") {
        e.respondWith(networkFirst(req, SHELL, "index.html"));
        return;
    }

    if (url.pathname.endsWith("/data.csv")) {
        e.respondWith(networkFirst(req, SHELL, undefined, { cache: "no-cache" }));
        return;
    }

    if (url.pathname.includes("/Assets/Items/")) {
        e.respondWith(cacheFirst(req, ITEMS));
        return;
    }

    e.respondWith(staleWhileRevalidate(req, SHELL, e));
});