/// <reference lib="webworker" />
// Service worker do app: cache offline (precache do Workbox) + notificações dos lembretes.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//] }));

// "Atualizar" do aviso de nova versão
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (e) => {
  let d: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    d = e.data?.json() ?? {};
  } catch {
    d = { title: e.data?.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Pulse", {
      body: d.body,
      tag: d.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: d.url || "#/inicio" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  // botões da notificação do treino ("Série feita", "+15 s", "Pular"): o app (aberto em segundo plano) faz o trabalho
  // e redesenha a notificação; sem o app vivo, abre o treino
  if (e.action) {
    e.waitUntil(
      (async () => {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (wins.length) for (const w of wins) w.postMessage({ type: "pulse-action", action: e.action });
        else await self.clients.openWindow(self.registration.scope + "#/treino");
      })(),
    );
    return;
  }
  e.notification.close();
  const hash = (e.notification.data?.url as string) || "#/inicio";
  e.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(scope)) {
          await (w as WindowClient).navigate(scope + hash).catch(() => undefined);
          return (w as WindowClient).focus();
        }
      }
      return self.clients.openWindow(scope + hash);
    })(),
  );
});
