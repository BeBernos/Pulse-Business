/**
 * Novidades de cada versão (a mais nova primeiro). Aparece uma vez por versão ao abrir o app.
 * Toda versão nova ganha uma entrada aqui, em linguagem simples (e o número em package.json).
 */
export interface Release {
  version: string;
  date: string;
  title: string;
  items: string[];
  /** Mesmo texto em inglês (quem usa o app em inglês); sem ele, aparece o português. */
  en?: { title: string; items: string[] };
}

export const CHANGELOG: Release[] = [
  {
    version: "1.12.0",
    date: "2026-11-07",
    title: "Ajustes organizados, calendário claro e medidas compactas",
    items: [
      "Ajustes viraram um menu curto: Conta, Perfil, Treino e academia, Lembretes, Família, Claude, Seus dados e Sobre o app — cada um com um resumo e a própria página.",
      "Anilhas nos Ajustes com todas as bolinhas do mesmo tamanho.",
      "Calendário do Progresso: cada dia agora é igual à legenda. Treinou = fundo na cor do treino; faltou = contorno tracejado e número riscado; pulou com motivo = contorno amarelo. O quadro “Não treinou” soma faltas e pulos.",
      "Corpo → Todas as medidas em cartões de duas colunas: metade do tamanho, com o valor grande e a variação de 30 dias só quando mudou.",
    ],
    en: {
      title: "Organized settings, clear calendar and compact measurements",
      items: [
        "Settings became a short menu: Account, Profile, Workout and gym, Reminders, Family, Claude, Your data and About — each with a summary and its own page.",
        "Plates in Settings are all the same size.",
        "Progress calendar: each day now matches the legend. Trained = filled in the workout's color; missed = dashed outline and crossed-out number; skipped with a reason = yellow outline. The “Didn't train” box adds missed and skipped days.",
        "Body → All measurements in two-column cards: half the length, with the value large and the 30-day change only when it changed.",
      ],
    },
  },
  {
    version: "1.11.1",
    date: "2026-11-07",
    title: "Sem o app Android",
    items: ["O Pulse fica só no app instalado pelo Chrome: saiu de Ajustes a opção de baixar o app Android."],
    en: { title: "No Android app", items: ["Pulse stays only as the app installed from Chrome: the option to download the Android app was removed from Settings."] },
  },
  {
    version: "1.11.0",
    date: "2026-11-07",
    title: "Treinou?",
    items: [
      "Dia de treino que passou sem nada registrado aparece no Início: “Treinou?”. “Treinei” leva para lançar o treino; “Não treinei” pede o motivo (doença, viagem, trabalho…) e deixa contar o que houve.",
      "O motivo com o seu texto vai no relatório para o Claude, junto dos dias sem treino.",
      "A notificação do treino agora fica o treino inteiro, também com o Pulse aberto (como um player de música) — antes só aparecia depois de sair do app.",
    ],
    en: {
      title: "Did you train?",
      items: [
        "A training day that passed with nothing logged shows on Home: “Did you train?”. “I trained” takes you to log it; “I didn't train” asks the reason (illness, travel, work…) and lets you say what happened.",
        "The reason and your note go in the report for Claude, with the days you didn't train.",
        "The workout notification now stays for the whole workout, also with Pulse open (like a music player) — before it only showed after leaving the app.",
      ],
    },
  },
  {
    version: "1.10.0",
    date: "2026-11-05",
    title: "App Android do Pulse",
    items: [
      "Novo: o Pulse como app Android (Ajustes → Baixar o app Android do Pulse). Ele abre o mesmo Pulse de sempre, com os mesmos dados — só a notificação do treino passa a ser feita pelo próprio Android.",
      "No app Android, o descanso é um cronômetro de verdade na notificação: anda segundo a segundo, com a tela apagada, sem o Pulse aberto.",
      "Botões “✓ Série feita”, “+15 s” e “Pular” funcionam com a tela apagada; a notificação já passa para a próxima série (superset incluído) e o Pulse grava quando abrir.",
      "Vibra aos 10 s e no fim do descanso na hora certa. No Android 16 (One UI 8), o treino pode ir para a Now Bar da Samsung.",
      "Entrar no app Android: com a senha ou com o código de 6 letras (Ajustes → Conta, no celular já conectado). A digital não funciona dentro do app.",
    ],
    en: {
      title: "Pulse Android app",
      items: [
        "New: Pulse as an Android app (Settings → Download the Pulse Android app). It opens the same Pulse with the same data — only the workout notification is now made by Android itself.",
        "In the Android app, rest is a real timer in the notification: it ticks every second, with the screen off, without Pulse open.",
        "“✓ Set done”, “+15 s” and “Skip” work with the screen off; the notification moves to the next set (supersets included) and Pulse saves it when opened.",
        "Vibrates at 10 s and at the end of rest, on time. On Android 16 (One UI 8), the workout can show in Samsung's Now Bar.",
        "Signing in to the Android app: with your password or the 6-letter code (Settings → Account, on the phone already signed in). Fingerprint doesn't work inside the app.",
      ],
    },
  },
  {
    version: "1.9.0",
    date: "2026-11-05",
    title: "Notificação do treino nova",
    items: [
      "Notificação do treino redesenhada (a opção C que você escolheu): fechada, o ícone é um anel do descanso na cor do dia com o tempo dentro; puxando para baixo, abre um cartão com o anel grande, o próximo exercício, a série com carga e reps e as séries já feitas.",
      "O tempo do descanso anda na notificação (a cada 5 s, e a cada 1 s nos últimos 10). Vibra aos 10 s e no fim.",
      "Botões “✓ Série feita” e “+15 s” direto na notificação, sem abrir o app — no superset, já passa para o próximo da rodada.",
      "Ícone pequeno da barra de status mais nítido.",
    ],
    en: {
      title: "New workout notification",
      items: [
        "Workout notification redesigned (option C you picked): collapsed, the icon is a rest ring in the day colour with the time inside; pulled down, it opens a card with the big ring, the next exercise, the set with load and reps and the sets already done.",
        "Rest time moves in the notification (every 5 s, and every 1 s in the last 10). It vibrates at 10 s and at the end.",
        "“✓ Set done” and “+15 s” buttons right in the notification, without opening the app — in a superset it moves on to the next exercise of the round.",
        "Sharper small status-bar icon.",
      ],
    },
  },
  {
    version: "1.8.0",
    date: "2026-11-05",
    title: "Feedback direto para o Claude e cardio na Mesa",
    items: [
      "Feedback do app vai sozinho para o Claude: o que você anota em Ajustes → Feedback do app chega ao servidor e o Claude que mexe no app lê no começo de cada conversa. Não precisa mais copiar e colar.",
      "O que já virou melhoria sai da lista de pendentes e fica em “Resolvidas”, com a versão em que entrou.",
      "Cardio na Mesa: ao finalizar um treino com cardio, as calorias registradas aparecem no Hoje da Mesa.",
    ],
    en: {
      title: "Feedback straight to Claude and cardio in Mesa",
      items: [
        "App feedback goes to Claude on its own: what you write in Settings → App feedback reaches the server and the Claude that builds the app reads it at the start of every conversation. No more copy and paste.",
        "What already became an improvement leaves the pending list and moves to “Resolved”, with the version it shipped in.",
        "Cardio in Mesa: when you finish a workout with cardio, the logged calories show on Mesa's Today.",
      ],
    },
  },
  {
    version: "1.7.0",
    date: "2026-11-04",
    title: "Conector do Claude",
    items: [
      "Conector do Claude (Ajustes → Claude): o Claude, no claude.ai, lê seus treinos, cargas, peso e o plano, e publica o próximo bloco direto no app — sem copiar e colar. Ele sempre mostra antes o que muda e só publica depois do seu “pode publicar”.",
      "Como ligar: gere o endereço no app, cole em claude.ai → Configurações → Conectores → Adicionar conector personalizado, e ligue o conector “Pulse” na conversa.",
    ],
    en: {
      title: "Claude connector",
      items: [
        "Claude connector (Settings → Claude): Claude on claude.ai reads your workouts, loads, weight and plan, and publishes the next block straight into the app — no copy and paste. It always shows what changes first and only publishes after your “go ahead”.",
        "How to turn it on: create the address in the app, paste it in claude.ai → Settings → Connectors → Add custom connector, and turn on the “Pulse” connector in the chat.",
      ],
    },
  },
  {
    version: "1.6.0",
    date: "2026-11-04",
    title: "Lixeira, sem internet e mais fácil de ler",
    items: [
      "Lixeira: treino, medida, análise ou plano apagado fica 3 dias guardado no servidor e volta com um toque (o treino volta com as séries). Ajustes → Seus dados → Lixeira.",
      "Sem internet: aparece um aviso no topo e no Início — tudo fica salvo no celular e sobe quando a conexão voltar.",
      "Você na Mesa: em Ajustes → Família, escolha quem você é no app de dieta (peso e “Treinou hoje?” vão para essa pessoa).",
      "Tipo de treino (Ajustes → Treino): “Pilates e funcional” põe esses grupos primeiro e tira o RIR do treino.",
      "Textos cinza mais fortes (mais fáceis de ler na academia) e botões melhores para leitores de tela.",
      "Erros que aparecem na tela agora chegam ao servidor (só da sua conta), para serem corrigidos sem precisar de print.",
    ],
    en: {
      title: "Trash, offline and easier to read",
      items: [
        "Trash: a deleted workout, measurement, analysis or plan stays 3 days on the server and comes back with one tap (the workout comes back with its sets). Settings → Your data → Trash.",
        "Offline: a notice shows at the top and on Home — everything stays on the phone and goes up when the connection is back.",
        "You in Mesa: in Settings → Family, pick who you are in the diet app (weight and “Trained today?” go to that person).",
        "Training type (Settings → Workout): “Pilates and functional” lists those groups first and removes RIR from workouts.",
        "Stronger grey text (easier to read at the gym) and better buttons for screen readers.",
        "Errors shown on screen now reach the server (your account only), so they can be fixed without a screenshot.",
      ],
    },
  },
  {
    version: "1.5.0",
    date: "2026-11-04",
    title: "Resumo da semana, metas por músculo e pesagem guiada",
    items: [
      "Resumo da semana passada no Início (de segunda a quarta): treinos feitos × planejados, séries, recordes, peso médio e as metas de volume do bloco.",
      "Metas por músculo: quando o plano traz a meta de séries (ex.: deltoide lateral 16/semana), o Progresso mostra um traço na barra de cada músculo.",
      "Comparar blocos: no Progresso → Análises, o bloco atual ao lado do anterior (adesão, séries, tonelagem, peso e força).",
      "Dor repetida: se a mesma dor aparece em 2 dos últimos 4 treinos, o Início avisa.",
      "Antes de importar um plano, o app mostra o que muda: exercícios que entram, saem e mudam em cada dia.",
      "Onde o tempo foi: no detalhe do treino, quanto tempo cada exercício levou (com o descanso).",
      "Pesagem guiada: o Corpo mostra a média de 7 dias como número principal, e dá para ligar o lembrete nos dias de pesagem (Ajustes → Lembretes).",
    ],
    en: {
      title: "Weekly recap, muscle targets and guided weigh-ins",
      items: [
        "Last week's recap on Home (Monday to Wednesday): workouts done × planned, sets, records, average weight and the block's volume targets.",
        "Muscle targets: when the plan brings a set target (e.g. lateral delts 16/week), Progress shows a mark on each muscle's bar.",
        "Compare blocks: in Progress → Analytics, the current block next to the previous one (adherence, sets, tonnage, weight and strength).",
        "Repeated pain: if the same pain shows up in 2 of the last 4 workouts, Home warns you.",
        "Before importing a plan, the app shows what changes: exercises added, removed and changed on each day.",
        "Where the time went: in the workout detail, how long each exercise took (rest included).",
        "Guided weigh-ins: Body shows the 7-day average as the main number, and you can turn on a reminder on weigh-in days (Settings → Reminders).",
      ],
    },
  },
  {
    version: "1.4.0",
    date: "2026-11-04",
    title: "Treino na notificação, superset junto e trocar exercício",
    items: [
      "Treino na barra de notificações: ao sair do app com o treino aberto, aparece o treino, as séries feitas, a hora em que começou e até que horas vai o descanso — e vibra quando o descanso acaba. Liga/desliga em Ajustes → Treino.",
      "Superset numa tela só: os exercícios da rodada (A1, A2…) ficam juntos em cima; sem ir e voltar entre telas.",
      "Trocar exercício sempre disponível: além do substituto do plano, mostra exercícios parecidos (mesmo músculo) para quando o aparelho está ocupado.",
      "Semana exata: no dia de treino (Treinos → dia), escolha a semana do bloco e veja as séries e cargas exatas, inclusive o deload. A agenda do Início abre direto na semana certa.",
      "Modo série: botões de RIR (0 a 4), “Igual à última”, meta da série em destaque e deslizar para o lado para trocar de série.",
      "Recorde na hora: quando uma série bate seu melhor (1RM estimado), o app comemora na hora.",
      "Ícone novo (o selo do Pulse) e atalhos ao segurar o ícone: Treino de hoje, Registrar peso e Progresso.",
    ],
    en: {
      title: "Workout in notifications, supersets together and swap exercise",
      items: [
        "Workout in the notification bar: when you leave the app mid-workout, it shows the workout, sets done, start time and when the rest ends — and vibrates when rest is over. Toggle in Settings → Workout.",
        "Supersets on one screen: the round's exercises (A1, A2…) stay together at the top; no going back and forth.",
        "Swap exercise always available: besides the plan's substitute, it lists similar exercises (same muscle) for when the machine is taken.",
        "Exact week: in a training day (Workouts → day), pick the block week to see the exact sets and loads, deload included. The Home agenda opens on the right week.",
        "Set mode: RIR buttons (0 to 4), “Same as last time”, the set target highlighted and swipe sideways to change sets.",
        "Records on the spot: when a set beats your best (estimated 1RM), the app celebrates right away.",
        "New icon (the Pulse mark) and shortcuts when you hold the icon: Today's workout, Log weight and Progress.",
      ],
    },
  },
  {
    version: "1.3.3",
    date: "2026-10-29",
    title: "A Mesa dentro do Pulse",
    items: ["O app de dieta da família agora se chama Mesa e abre aqui dentro: Ajustes → Família → Mesa (no computador, também no menu lateral). Na primeira vez, ele pede a senha da família."],
    en: { title: "Mesa inside Pulse", items: ["The family diet app is now called Mesa and opens right here: Settings → Family → Mesa (on the computer, also in the side menu). The first time, it asks for the family password."] },
  },
  {
    version: "1.3.2",
    date: "2026-10-29",
    title: "Peso aparecendo no app de dieta",
    items: ["Corrigido: o peso (e o “Treinou hoje?”) do Rafael chegava ao app de dieta com o nome da conta (“rafa”) e não aparecia na pessoa Rafael. Agora aparece, inclusive o histórico."],
    en: { title: "Weight showing in the diet app", items: ["Fixed: Rafael’s weight (and “Trained today?”) reached the diet app under the account name (“rafa”) and didn’t show on Rafael. It shows now, history included."] },
  },
  {
    version: "1.3.1",
    date: "2026-10-29",
    title: "Peso oficial",
    items: ["O peso do Pulse é o oficial: o app de dieta mostra exatamente o peso de cada dia registrado aqui (com dois no mesmo dia, vale o mais novo; apagar aqui apaga lá). Na próxima sincronização, o histórico inteiro é conferido e corrigido lá."],
    en: { title: "Official weight", items: ["Pulse weight is the official one: the diet app shows exactly the weight of each day logged here (with two on the same day, the newest counts; deleting here deletes there). On the next sync the whole history is checked and fixed there."] },
  },
  {
    version: "1.3.0",
    date: "2026-10-29",
    title: "Modo série, termos explicados e supersets",
    items: [
      "Treino: novo “Modo série” (botão Lista | Série no topo). Mostra só a série da vez, com carga e repetições em número grande, botões − e + (5 kg na barra, 2,5 nos outros) e um ✓ grande. As séries feitas ficam em fichinhas em cima; toque numa para corrigir.",
      "Termos explicados: toque em RIR, 1RM estimado, Volume, Adesão, Massa magra, FFMI, IMC ou na fórmula da gordura para ver o que é. Termo nunca aberto tem um pontinho. Lista completa em Ajustes → Termos do app.",
      "Supersets mais claros: exercícios marcados A1, A2…; no treino aparece a sequência da rodada; no editor do dia a ligação fica destacada (“Junto com A2, sem descanso”).",
    ],
    en: {
      title: "Set mode, explained terms and supersets",
      items: [
        "Workout: new “Set mode” (List | Set switch at the top). It shows only the current set, with load and reps in big numbers, − and + buttons (5 kg on the barbell, 2.5 otherwise) and a big ✓. Done sets sit in chips above; tap one to fix it.",
        "Terms explained: tap RIR, estimated 1RM, Volume, Adherence, Lean mass, FFMI, BMI or the body-fat formula to see what it means. Terms never opened carry a small dot. Full list in Settings → App terms.",
        "Clearer supersets: exercises labeled A1, A2…; the workout shows the round order; the day editor highlights the link (“Paired with A2, no rest”).",
      ],
    },
  },
  {
    version: "1.2.3",
    date: "2026-10-29",
    title: "Atualização mais rápida",
    items: ["O app confere se tem versão nova toda vez que você volta para ele (e a cada hora aberto): o aviso “Nova versão disponível” aparece logo depois de cada melhoria."],
    en: { title: "Faster updates", items: ["The app checks for a new version every time you come back to it (and every hour while open): the “New version available” notice shows up right after each improvement."] },
  },
  {
    version: "1.2.2",
    date: "2026-10-29",
    title: "Acabamento",
    items: [
      "Deslizar para apagar (com “Desfazer”) agora também nas medidas, anotações do feedback, análises do Claude e treinos do histórico.",
      "“Desfazer” aparece embaixo, perto do dedo, com uma barrinha mostrando os 5 segundos.",
      "Semana no Início: linha de batimento mais forte, um ponto na cor do treino em cada pico e “hoje” pulsando.",
      "Dia perdido em cinza riscado (o vermelho ficou só para o app); “prioridade” só com contorno.",
      "Gráficos de Progresso em forma de picos e sem rótulos cortados; meta do peso não encosta mais no valor.",
      "No treino: cabeçalho sem texto aparecendo por baixo e anel de descanso maior.",
    ],
    en: {
      title: "Finishing touches",
      items: [
        "Swipe to delete (with “Undo”) now also on measurements, feedback notes, Claude analyses and workouts in history.",
        "“Undo” shows at the bottom, near your thumb, with a bar counting the 5 seconds.",
        "Week on Home: stronger heartbeat line, a dot in the workout's color on each peak and “today” pulsing.",
        "Missed day in grey strikethrough (red is only for the app now); “priority” with outline only.",
        "Progress charts as peaks and with no clipped labels; the weight goal no longer touches the value.",
        "During the workout: no text showing under the header and a bigger rest ring.",
      ],
    },
  },
  {
    version: "1.2.1",
    date: "2026-10-29",
    title: "Fim de treino que comemora",
    items: [
      "Resumo do treino: a linha da semana se desenha com o pico de hoje, mostra quantas séries do plano você fez e o que avançou (ex.: “+2,5 kg no …”). A comparação de volume só aparece quando sobe e com o treino quase completo.",
      "Início: depois de treinar aparece “Feito hoje”, com os músculos trabalhados e o botão “Ver resumo”.",
      "No treino: o ✓ da próxima série fica grande e na cor do dia; “Finalizar” só ganha destaque quando tudo acabou; histórico e remover foram para o botão “⋯”.",
    ],
    en: {
      title: "A workout ending that celebrates",
      items: [
        "Workout summary: the week line draws itself with today's peak, shows how many planned sets you did and what moved forward (e.g. “+2.5 kg on …”). The volume comparison only shows when it goes up and the workout is nearly complete.",
        "Home: after training you see “Done today”, with the muscles worked and a “See summary” button.",
        "During the workout: the ✓ of the next set is big and in the day's color; “Finish” only stands out when everything is done; history and remove moved to the “⋯” button.",
      ],
    },
  },
  {
    version: "1.2.0",
    date: "2026-10-29",
    title: "Arrastar e deslizar",
    items: [
      "Segure um exercício por meio segundo (o celular vibra) e arraste para mudar a ordem: no dia do treino, na ordem dos dias do programa e no “A seguir” do treino.",
      "Deslize para a esquerda para remover: curto mostra o botão “Remover”, longo ou rápido apaga direto.",
      "Apagou sem querer? O aviso tem “Desfazer” por 5 segundos (no treino, as séries feitas voltam junto).",
      "Exercício adicionado pisca no fim da lista para você ver onde caiu. As setas ↑↓ continuam lá.",
    ],
    en: {
      title: "Drag and swipe",
      items: [
        "Hold an exercise for half a second (the phone vibrates) and drag to reorder: in the workout day, the program's day order and “Up next” during the workout.",
        "Swipe left to remove: a short swipe shows the “Remove” button, a long or fast one deletes right away.",
        "Deleted by mistake? The notice has “Undo” for 5 seconds (in the workout, done sets come back too).",
        "An added exercise flashes at the end of the list so you see where it landed. The ↑↓ arrows are still there.",
      ],
    },
  },
  {
    version: "1.1.1",
    date: "2026-10-28",
    title: "Dois exercícios de mobilidade",
    items: [
      "Novos na biblioteca (Exercícios → Mobilidade): Shoulder Joints Warmup with Dumbbells e Floor Slides (o Wall Slides deitado de barriga para cima).",
      "Os dois com desenho, 3D e “Como fazer”, e já entram na lista que vai para o Claude montar os treinos.",
    ],
    en: {
      title: "Two mobility exercises",
      items: [
        "New in the library (Exercises → Mobility): Shoulder Joints Warmup with Dumbbells and Floor Slides (Wall Slides lying on your back).",
        "Both with drawing, 3D and “How to”, and already in the list that goes to Claude to build your workouts.",
      ],
    },
  },
  {
    version: "1.1.0",
    date: "2026-10-28",
    title: "Pulse com cara própria",
    items: [
      "Início: selo do Pulse, a semana como uma linha de batimento (um pico em cada dia treinado) e a agenda dos próximos treinos.",
      "Cartão do treino com o boneco de frente e de costas mostrando os músculos do dia; no descanso, o que ainda está se recuperando.",
      "No treino: o exercício atual fica em cima, com a figura grande; embaixo, “A seguir” e “Feitos”.",
      "Ao salvar o treino: resumo com os músculos trabalhados, duração, volume, comparação com o último treino igual, recordes e sequência.",
      "Números com fonte nova (Oswald).",
    ],
    en: {
      title: "Pulse with its own look",
      items: [
        "Home: Pulse badge, the week as a heartbeat line (a peak on each day you trained) and your upcoming workouts.",
        "Workout card with the front and back figure showing the day's muscles; on rest days, what is still recovering.",
        "During the workout: the current exercise sits on top with a big figure; below, “Up next” and “Done”.",
        "When you save a workout: a summary with muscles worked, duration, volume, comparison with the last same workout, records and streak.",
        "Numbers in a new font (Oswald).",
      ],
    },
  },
  {
    version: "1.0.2",
    date: "2026-10-28",
    title: "Português ou inglês",
    items: [
      "Cada pessoa escolhe o idioma do app: Ajustes → Perfil → Idioma (PT ou EN). Vale nos outros aparelhos também.",
      "Em inglês: telas, avisos, medidas, músculos e o “Como fazer” de todos os exercícios.",
      "Datas continuam no formato dia/mês; o que vai para o Claude (relatórios e instruções) continua em português.",
    ],
    en: {
      title: "Portuguese or English",
      items: [
        "Each person picks the app language: Settings → Profile → Language (PT or EN). It applies on your other devices too.",
        "In English: screens, notices, measurements, muscles and the “How to” of every exercise.",
        "Dates stay in day/month format; what goes to Claude (reports and instructions) stays in Portuguese.",
      ],
    },
  },
  {
    version: "1.0.1",
    date: "2026-10-28",
    title: "Visual novo",
    items: [
      "Telas mais limpas: títulos e números menores, menos negrito, sem rótulos em maiúsculas.",
      "Sem brilhos vermelhos de fundo; botões sólidos; letras dos dias em tons suaves.",
      "No treino: toque no número da série para anotar ou remover — sem a linha extra embaixo de cada série.",
      "Sessões e cargas mais fáceis de ler; barra de abas mostra a aba ativa só pela cor.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-28",
    title: "Pulse 1.0",
    items: [
      "Treino: digitar o peso não trava mais; o campo sobe acima do teclado.",
      "Terminou as séries de um exercício (ou pulou)? O próximo abre sozinho.",
      "Cada exercício tem a figura do movimento na lista e o passo a passo já aberto no treino.",
      "Treino feito dá para ver e corrigir: Progresso → sessão → Editar cargas e séries.",
      "Progresso → Cargas: o último e o melhor de cada exercício, guardados para sempre.",
      "Plano novo chega do Claude como arquivo .json (Treinos → Importar) e traz o porquê de cada escolha.",
      "Entrar no PC ou num aparelho novo com um código do celular, sem senha nem Bluetooth.",
      "Fotos de progresso com cópia no servidor (só você vê) — não se perdem se trocar de celular.",
      "Gordura corporal estimada pelas medidas; Ajustes → Feedback do app para anotar o que melhorar.",
    ],
  },
];

export const LATEST = CHANGELOG[0];
