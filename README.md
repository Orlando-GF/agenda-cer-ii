# Agenda CER II

Sistema web simples para organização de agendas de consultas, exames e orientações familiares.

## Recursos

- Login com perfis de administrador e atendente.
- Cadastro de profissionais e usuários.
- Agendas por data e turno, com horário em lista pronta e limite de vagas.
- Agenda de consulta, exame ou orientação familiar sempre vinculada a um profissional responsável.
- Agenda de exame sem exigir a seleção do exame específico do paciente.
- Orientação familiar com prontuário do familiar vinculado ao prontuário do paciente.
- Fila de espera por especialidade, com solicitações ordenadas pela data da solicitação médica.
- Procedimentos/motivos da fila vinculados à especialidade, com seleção de múltiplos procedimentos e opção `Outros`.
- Histórico de movimentações da fila e botão para chamar paciente com data/hora automática.
- Tela principal com lista compacta agrupada por data, filtros de profissional, tipo, turno e situação.
- Cadastro de vagas por prontuário, nome e observação, com suporte a paciente novo usando `novo`.
- Bloqueio de paciente repetido e de agenda lotada.
- Impressão da lista de pacientes.
- Desativação de cadastros sem perder o histórico.

## Executar localmente

```powershell
npm install
npm run db:local
npm run dev
```

Abra o endereço informado pelo Wrangler. No primeiro acesso, o sistema pedirá a criação do administrador.

## Publicar na Cloudflare

### Opção A: Cloudflare Pages pelo GitHub

Ao conectar este repositório no Cloudflare Pages:

- Root directory: deixe vazio ou `/`.
- Build command: deixe vazio ou use `npm install`.
- Build output directory: `public`.
- Variáveis de ambiente: não precisa.

O arquivo `wrangler.toml` já contém `pages_build_output_dir = "public"` e o binding `DB`.

Antes do primeiro uso, aplique as migrações no D1 remoto:

```powershell
npm run db:remote
```

Depois faça o deploy pelo painel do Cloudflare Pages ou pelo push no GitHub.

### Opção B: Wrangler pelo terminal

1. Entre na conta da Cloudflare pelo terminal:

```powershell
npx wrangler login
```

2. Crie o banco:

```powershell
npx wrangler d1 create ceproeste
```

3. Copie o `database_id` exibido e substitua `COLOQUE_O_ID_DO_D1_AQUI` em `wrangler.toml`.

4. Aplique a estrutura do banco e publique:

```powershell
npm run db:remote
npm run deploy
```

## Observações

- Não publique senhas ou dados de pacientes no repositório.
- Use usuários individuais e senhas que não sejam compartilhadas.
- Faça exportações/backup periódicos do D1.
