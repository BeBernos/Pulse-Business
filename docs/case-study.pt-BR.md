# Estudo de caso — Pulse

*[Read in English](case-study.md)*

**Papel:** produto, UX e engenharia, de ponta a ponta · **Período:** 2026 – hoje, 24 versões · **Usuários:** duas pessoas
na casa, em todo dia de treino

## O problema

Os programas de treino eram escritos em conversas longas com uma IA: blocos de 13 semanas, progressão de carga por semana,
deloads, supersets. Na academia, viviam em prints e anotações. A carga era lembrada (ou não), o descanso era cronometrado em
outro app e ninguém sabia dizer se o bloco estava funcionando — então o próximo bloco era planejado por impressão. Os apps
comerciais ignoravam a estrutura do programa ou queriam vender os próprios planos e bibliotecas de vídeo.

## Objetivos

- Abrir o app e ver o treino **de hoje** com a prescrição desta semana — nada para digitar antes da primeira série.
- Registrar uma série com um toque, com o celular numa mão e sem sinal.
- Explicar cada exercício visualmente, sem vídeos ou links de terceiros.
- Mandar dados reais para a IA (cargas, RIR, dores, dias pulados, corpo) montar o próximo bloco, e importar a resposta com
  segurança.

## Decisões principais

| Decisão | Por quê | Custo |
|---|---|---|
| **Um contrato de plano documentado e validado com Zod** | A IA escreve programas que o app com certeza entende; erros são explicados antes de importar | O contrato evolui junto com o prompt e os testes, nunca sozinho |
| **Desenhar as animações a partir de dados de movimento** | Sem licença de vídeo, estilo consistente, 300+ exercícios cobertos por uma dúzia de famílias de movimento; os mesmos dados alimentam 2D e 3D | Ajuste à mão de poses para exercícios incomuns, protegido por um teste que exige movimento para todo exercício |
| **Offline primeiro com sincronização por registro** | Academia tem sinal ruim; uma série nunca pode se perder | "Vence o carimbo maior" por registro e lápides → uma lixeira para recuperar o que foi apagado |
| **Derivar a senha no aparelho** | O plano grátis do Workers dá ~10 ms de CPU por pedido; PBKDF2 com 600 mil rodadas não cabe lá | O servidor guarda um hash da chave derivada, então a senha nunca viaja |
| **Notificação ao vivo em vez de app nativo** | Uma notificação web com o anel do descanso e botões resolve a academia sem loja de apps | Limites da notificação web com a tela travada; uma casca nativa foi feita e depois deixada de lado |

## O que saiu

- O treino da semana abre com um toque; supersets, aquecimento e cardio fazem parte do mesmo fluxo.
- Recordes são reconhecidos na hora; adesão, volume por músculo e composição corporal estão sempre a uma tela de distância.
- A IA recebe um relatório estruturado e devolve o próximo bloco por um conector MCP, depois de mostrar o que muda.
- Uma ponte na casa: o peso é dividido com o app de alimentação da família (Mesa), e a agenda de treino diz à Mesa quais
  dias são de treino.

## O que eu faria a seguir

Um modo treinador em que um personal publica programas para vários alunos a partir do mesmo contrato, e licenciar o motor
de movimento sozinho.
