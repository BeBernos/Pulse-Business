# Análise do Claude — `pulse/analysis@1` (Fase 4)

Ponte sem API nem automação da conta: **Progresso → Claude**.

1. **Mandar o relatório**: o app monta a mensagem (pedido + contexto do plano + relatório `app-treino/log@1` do período) e abre o menu Compartilhar do Android → app do Claude. No PC, copia.
2. **Colar a resposta**: a pessoa copia a resposta inteira do Claude e cola no app. O app acha o bloco ` ```json ` com `"format": "pulse/analysis@1"` (aceita texto em volta, outros blocos, aspas “curvas”), valida e guarda na tabela `analyses` (sincroniza entre aparelhos, entra no backup). Sem bloco válido: mostra o erro e oferece guardar como texto.
3. **Histórico**: lista das análises; cada uma abre formatada (resumo, destaques, atenção, por exercício com link, próximos passos). Apagar some também nos outros aparelhos.

Projeto no Claude (opcional, recomendado): instruções fixas em `PROJECT_INSTRUCTIONS` (`src/lib/analysis.ts`), copiáveis na própria tela.

## Bloco

```json
{
  "format": "pulse/analysis@1",
  "from": "2026-10-13",
  "to": "2026-10-19",
  "title": "Semana 12: boa adesão, ombro pede cuidado",
  "summary": "Texto corrido (até 2000 caracteres).",
  "highlights": ["…"],
  "attention": ["…"],
  "exercises": [{ "name": "Seated Dumbbell Lateral Raise", "note": "…", "trend": "up" }],
  "nextSteps": ["…"],
  "planChange": { "summary": "…" }
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `format` | sim | exatamente `pulse/analysis@1` |
| `title` | sim | até 120 caracteres |
| `summary` | sim | até 2000 caracteres |
| `from`, `to` | não | `AAAA-MM-DD` |
| `highlights`, `attention`, `nextSteps` | não | até 20 itens, cada um até 600 caracteres |
| `exercises` | não | até 40; `name` = nome exato do app (inglês); `trend` ∈ `up`, `flat`, `down` |
| `planChange` | não | só proposta: o plano novo vem à parte (`app-treino/plan@1`) e só entra se a pessoa importar |

Regras que o pedido e o Projeto repetem ao Claude: nomes de exercício exatos; não extrapolar cargas (a progressão vem do plano); mudança de treino só com aprovação; `Lying Triceps Extension with a Barbell` vetado.

Código: `src/lib/analysis.ts` (schema, `parseAnalysis`, `shareMessage`, textos), `src/screens/Claude.tsx` (telas), `saveAnalysis` em `src/db.ts`. Testes: `src/lib/analysis.test.ts`, `src/sync.test.ts`.
