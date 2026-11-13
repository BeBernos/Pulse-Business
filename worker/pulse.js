// Worker "pulse" (endereço novo: pulse.example.workers.dev). Serve o mesmo app (dist/) e repassa todo /api/*
// ao Worker "app-treino" pela ligação interna TREINO (service binding): contas, dados, lembretes e a ponte com o
// Plano da Família continuam num lugar só — o mesmo banco D1, sem cópia. O pedido segue com o endereço e o cookie
// do "pulse", então login, passkey (domínio-pai) e a checagem de origem funcionam aqui como lá.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env.TREINO) return Response.json({ error: "Ligação com o app-treino não configurada." }, { status: 503 });
      return env.TREINO.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
