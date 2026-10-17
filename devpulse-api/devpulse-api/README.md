# DevPulse API

API REST de monitoramento de disponibilidade HTTP/HTTPS, criada como projeto de portfólio com **Node.js, TypeScript, Fastify, PostgreSQL, Prisma, Docker Compose e Vitest**.

## Funcionalidades

- Cadastro e login com JWT (token com validade de 1 hora).
- Senhas armazenadas com Argon2id.
- CRUD de monitores por usuário.
- Verificações periódicas de endpoints, com latência, status HTTP e histórico.
- Incidentes abertos quando um monitor falha e resolvidos quando volta a responder.
- Documentação Swagger em `/docs`.
- Rate limiting, Helmet, validação de entrada, limite de payload e isolamento por usuário.
- Proteções iniciais contra SSRF para bloquear esquemas não HTTP, loopback, redes privadas/reservadas, credenciais na URL e portas não padrão.
- Docker Compose para subir PostgreSQL localmente.

## Requisitos

- Windows 10/11
- Node.js 20.11 ou superior
- npm
- Docker Desktop (recomendado) ou PostgreSQL instalado localmente

## Rodar no Windows (PowerShell)

1. Extraia o ZIP e abra a pasta `devpulse-api` no VS Code.
2. Crie o arquivo `.env` a partir do exemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Suba o banco:

   ```powershell
   docker compose up -d postgres
   ```

4. Instale as dependências:

   ```powershell
   npm install
   ```

5. Gere o cliente Prisma e crie as tabelas:

   ```powershell
   npx prisma generate
   npx prisma migrate dev --name init
   ```

6. Inicie a API:

   ```powershell
   npm run dev
   ```

A API ficará em `http://localhost:3333`, documentação em `http://localhost:3333/docs` e health check em `http://localhost:3333/health`.

> Se o comando Docker não existir, instale/abra o Docker Desktop. Alternativamente, instale PostgreSQL localmente e ajuste `DATABASE_URL` no `.env`.

## Rotas

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/health` | Estado da API | Não |
| POST | `/auth/register` | Criar conta | Não |
| POST | `/auth/login` | Entrar | Não |
| GET | `/monitors` | Listar monitores do usuário | JWT |
| POST | `/monitors` | Criar monitor | JWT |
| GET | `/monitors/:id` | Detalhes de um monitor | JWT |
| PATCH | `/monitors/:id` | Atualizar monitor | JWT |
| DELETE | `/monitors/:id` | Excluir monitor | JWT |
| GET | `/monitors/:id/checks?limit=50` | Histórico de checks | JWT |
| GET | `/monitors/:id/incidents` | Histórico de incidentes | JWT |

## Exemplos rápidos

### Criar conta

```http
POST /auth/register
Content-Type: application/json

{
  "email": "voce@example.com",
  "password": "uma-senha-forte-com-12"
}
```

A resposta inclui um token JWT. Envie-o nas rotas protegidas:

```http
Authorization: Bearer SEU_TOKEN
```

### Criar monitor

```http
POST /monitors
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "name": "Meu site",
  "url": "https://example.com",
  "intervalMs": 60000
}
```

O intervalo permitido é de 15 segundos a 24 horas. O padrão é 60 segundos. O usuário pode ter até 25 monitores por padrão, configurável por `MAX_MONITORS_PER_USER`.

## Testes e build

```powershell
npm test
npm run build
```

Os testes cobrem as regras iniciais de validação SSRF e o endpoint de saúde. Os testes de integração precisam de variáveis de ambiente válidas; o endpoint de saúde também inicializa o cliente Prisma, então configure o `.env` antes de executá-los.

## Variáveis de ambiente

Veja `.env.example`. **Troque `JWT_SECRET` por um segredo aleatório antes de qualquer uso fora do computador local.** Um exemplo para gerar segredo no PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

## Segurança: limites conhecidos e próximos passos

Este repositório é um MVP educacional, não uma auditoria de segurança nem um serviço pronto para produção.

- A proteção SSRF faz resolução DNS antes da requisição, mas ainda existe risco de DNS rebinding entre validação e conexão. Em produção, adicione controle de saída de rede/egress proxy que bloqueie IPs privados e metadados, ou use um cliente HTTP que fixe o IP validado mantendo SNI/Host corretamente.
- Redirecionamentos HTTP não são seguidos; registre diretamente a URL final desejada.
- Os checks são executados por um scheduler simples dentro do processo da API. Em produção, mova-os para worker/filas dedicadas, use locks distribuídos e limite a concorrência.
- A validação de endereço bloqueia redes comuns privadas/reservadas, mas deve passar por revisão especializada antes de exposição pública.
- Considere refresh tokens, revogação de sessões, auditoria, alertas, métricas, retenção de histórico, migrações em CI e testes de integração com banco isolado.
- CORS é configurado por `CORS_ORIGIN`; não use `*` em produção.
- Configure HTTPS, secrets manager, backups, monitoramento da própria API e atualização regular de dependências antes de implantar.

## Estrutura

```text
src/
  app.ts
  server.ts
  env.ts
  lib/
  routes/
  security/
  services/
prisma/
  schema.prisma
tests/
```

## Licença

MIT — veja `LICENSE`.
