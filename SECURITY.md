# Security

*[Português abaixo](#segurança-resumo-em-português)*

Pulse stores a person's training history, body measurements and progress photos. The design goal: **each person sees only
their own data, and secrets never travel or rest in clear text.**

## Threat model

| Threat | Mitigation |
|---|---|
| Password theft in transit or from the database | The password never leaves the device: the app derives a key with **PBKDF2-SHA256 (600,000 iterations)** and sends only that; the server stores a hash of it. |
| Session hijacking | Session token in a `HttpOnly; Secure; SameSite=Strict` cookie; the server stores only a hash of the token; sessions renew with use and can be revoked per device. |
| Lost phone / shared computer | **Passkeys** (WebAuthn via SimpleWebAuthn) and sign-in with a 6-letter, single-use, 10-minute code generated on a signed-in device — no password typed on the new device. |
| One account reading another's data | Every row in D1 carries the owner's `user_id`; every query is scoped to the authenticated user; local databases are separate per person. A device holding another person's data refuses to sync into the wrong account. |
| Accidental or malicious deletion | Deletions are tombstones; the server copies the previous value to a trash table for 3 days, restorable from the app. |
| The AI connector link leaks | The MCP endpoint uses a per-person token stored only as a SHA-256 hash; generating a new one revokes the old; publishing a plan requires validation and the user's approval. |
| Installation hijack | Creating the first (owner) account requires a setup code kept as a Worker secret; other accounts join by invitation. |

## Reporting

Please open a private security advisory on GitHub or contact the author through [github.com/BeBernos](https://github.com/BeBernos).

---

## Segurança (resumo em português)

O Pulse guarda o histórico de treino, as medidas e as fotos de progresso de cada pessoa. O objetivo: **cada pessoa vê só os
próprios dados, e segredos nunca viajam nem ficam guardados em claro.**

- **Senha:** nunca sai do aparelho — vai uma chave derivada com PBKDF2-SHA256 (600 mil rodadas); o servidor guarda só um hash.
- **Sessão:** cookie `HttpOnly; Secure; SameSite=Strict`, só o hash do token no servidor, revogável por aparelho.
- **Celular perdido ou computador emprestado:** passkeys (WebAuthn) e entrada com código de 6 letras, de uso único e válido
  por 10 minutos, gerado num aparelho já conectado.
- **Uma conta lendo a outra:** toda linha do D1 tem o `user_id` do dono e toda consulta é limitada ao usuário autenticado.
- **Apagar sem querer:** lápides + lixeira de 3 dias no servidor, com restauração pelo app.
- **Conector da IA:** token por pessoa guardado só como hash; gerar outro desliga o anterior; publicar exige validação e aprovação.
- **Instalação:** a primeira conta exige um código de instalação guardado como segredo do Worker; as outras entram por convite.
