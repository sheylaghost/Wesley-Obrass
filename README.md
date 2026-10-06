# Obras

App (PWA) de checklist com fotos e controle de gastos por obra. Preto e branco, funciona no PC, celular e iPad, e funciona sem internet.

## Rodar
```bash
npm install
npm run dev      # http://localhost:5173 (também acessível pelo IP da rede, use no celular)
npm run build    # gera a pasta dist/
```

## Publicar (grátis)
Suba a pasta no GitHub e importe o repositório na Vercel ou Netlify (build: `npm run build`, pasta: `dist`).
O PWA exige HTTPS, que as duas já dão.

## Instalar no iPad/iPhone
Abrir o link no Safari > Compartilhar > Adicionar à Tela de Início. No Android, Chrome > Instalar app.

## Onde mexer
- `src/main.js`: dados, telas (gastos, checklist, diário, gráficos) e ações (tudo em funções simples: `home()`, `obra()`, `lista()`).
- `src/styles.css`: cores em `:root` (`--bg`, `--ink`...), tema escuro incluso.
- `vite.config.js`: nome, cores e ícones do app instalado. Ícones em `public/`.
- Categorias: constante `CATS` no `main.js`.

## Sobre os dados
Ficam salvos no aparelho (IndexedDB), não em servidor. Use "Baixar backup" na tela inicial de vez em quando.
Se o Safari ficar muito tempo sem abrir o app, pode limpar os dados: por isso o backup e, no futuro, a sincronização.

## Supabase (sincronização)
1. Crie um projeto em supabase.com e rode `supabase/schema.sql` no SQL Editor.
2. Copie `.env.example` para `.env` e preencha URL e chave anon (Project Settings > API). Na Vercel/Netlify, cadastre as mesmas variáveis.
3. Abra o app, crie a conta e entre. Depois de criar as contas, desative novos cadastros em Authentication > Sign In / Providers.
Sem as variáveis, o app continua funcionando só local.

### Convites por link
Em projetos Supabase já configurados, rode `supabase/convites.sql` uma vez no SQL Editor; não rode `schema.sql` para atualizar, pois ele recria as tabelas e apaga os dados. Publique a nova versão do app. Um administrador pode gerar um link na tela Equipe. O link é de uso único, expira em 7 dias e deve ser enviado diretamente ao convidado; qualquer pessoa que o receba poderá usá-lo primeiro. O convidado abre o link e entra ou cria uma conta com o próprio e-mail.

## Próximo passo sugerido
Mover as fotos para o Supabase Storage (hoje vão dentro do registro da obra).
