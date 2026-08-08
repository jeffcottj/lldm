const SHELL_CACHE = "lldm-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest"])),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok)
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ??
            new Response("LLDM is reconnecting to the last committed room.", {
              status: 503,
            }),
        ),
      ),
  );
});
