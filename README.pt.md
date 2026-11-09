<div align="center">

# Hostinger Zero-Downtime Deploy 🚀

**GitHub Action e CLI para Deploy Atômico com Zero-Downtime em servidores Hostinger (PHP, Node e Web Apps) via SSH.**

<br/>

[ English ](./README.md) • [ Português ](./README.pt.md) • [ Español ](./README.es.md)

<br/>

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-Hostinger_Deploy-673AB7?style=flat-square&logo=github-actions&logoColor=white)](#-uso-no-github-actions)
[![Node Version](https://img.shields.io/badge/Node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

Substitua uploads manuais e instabilidades por deploys profissionais baseados no **padrão de links simbólicos atômicos (Symlinks)**, com suporte a **rollback instantâneo automático** e preservação de arquivos persistentes (`.env`, `storage`, uploads).

---

## ⚡ Arquitetura no Servidor e Modelo de Segurança

Em vez de sobrescrever arquivos diretamente em produção, a Action cria uma estrutura isolada no seu servidor da Hostinger:

```text
/home/u123456789/domains/meusite.com/
│
├── current -> releases/20261105041500/   # Link simbólico atômico (versão ativa)
│
├── shared/                               # Arquivos e pastas persistentes
│   ├── .env
│   ├── storage/
│   └── uploads/
│
└── releases/                             # Histórico das últimas versões
    ├── 20261105030000/
    └── 20261105041500/                   # Versão atual
```

* **Zero-Downtime:** A troca para a nova versão (`ln -nfs`) leva menos de 1 milissegundo.
* **Economia de RAM na Hostinger:** O build pesado (`composer install`, `npm run build`) roda nos servidores gratuitos do GitHub. A Hostinger recebe apenas um pacote `.tar.gz` ultraleve.
* **Bootstrap no 1º Deploy:** Nenhuma configuração manual prévia necessária no servidor. As pastas `releases/`, `shared/` e diretórios persistentes são criados automaticamente no primeiro deploy.
* **Limpeza Automática pré-switch:** Se ocorrer queda de internet ou erro durante o upload/extração, a pasta incompleta é removida automaticamente antes de tocar no symlink. O site ativo nunca é afetado.
* **Rollback Resiliente:** Reverte para a versão anterior em 0.1s. Se o rollback for executado no primeiro deploy (sem versões anteriores no histórico), a Action exibe um aviso amigável e encerra com segurança, sem quebrar sua pipeline de CI/CD.

---

## 📋 Pré-requisitos e Planos Hostinger

* **Requisito de Plano Hostinger:** É necessário o plano **Hostinger Premium ou superior** (Business, Cloud Startup ou VPS).
  > **Atenção:** O plano de entrada **Single** **não** possui Acesso SSH. O acesso SSH (porta padrão `65002`) é obrigatório para operações atômicas e symlinks.
* **Credenciais SSH:** Host, Usuário, Porta e Chave Privada SSH (ou Senha) configurados nos Secrets do repositório no GitHub.

---

## 🛠️ Uso no GitHub Actions

### Workflow Completo com Healthcheck e Rollback Automático

Crie um arquivo `.github/workflows/deploy.yml` no seu repositório:

```yaml
name: Deploy para Hostinger

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout do código
        uses: actions/checkout@v4

      # Passo 1: Instalar dependências (exemplo para PHP)
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'

      - name: Instalar Dependências do PHP
        run: composer install --no-dev --optimize-autoloader --no-interaction

      # Passo 2: O Deploy Atômico na Hostinger
      - name: Deploy Atômico
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002' # Porta SSH padrão da Hostinger
          remote_path: '/home/u123456789/domains/meusite.com'
          keep_releases: 5

      # Passo 3: Verificação de saúde da API
      - name: Healthcheck
        run: |
          sleep 3
          curl -f -s -i "https://meusite.com/health" || (echo "[FATAL] Healthcheck falhou!" && exit 1)

      # Passo 4: Rollback Automático (Executa apenas se o Healthcheck falhar!)
      - name: Rollback de Emergência
        if: failure()
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002'
          remote_path: '/home/u123456789/domains/meusite.com'
          command: rollback
```

---

## 🧩 Microsserviços e APIs em Subpastas

Se o seu domínio abriga múltiplos microsserviços ou APIs independentes (ex: `/api/v1` ou `/auth/v2`), **você não precisa alterar rotas no frontend nem mudar o `APP_BASE_PATH` no seu PHP**.

Basta apontar o `remote_path` diretamente para a subpasta daquela API:
```yaml
remote_path: '/home/u123456789/domains/meusite.com/public_html/api/v1'
```

* **Sem alteração de rotas:** O servidor web da Hostinger resolve o link simbólico de forma transparente.
* **Isolamento total:** Cada microsserviço tem seu próprio histórico de `releases/`, `shared/` e rollback independente sem afetar as demais APIs do site.

---

## ⚙️ Inputs Suportados

| Input | Obrigatório | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `host` | **Sim** | - | IP ou domínio do servidor SSH da Hostinger |
| `username` | **Sim** | - | Usuário SSH (ex: `u123456789`) |
| `remote_path` | **Sim** | - | Caminho absoluto do site ou sub-API na Hostinger |
| `key` | Não | - | Conteúdo da chave privada SSH |
| `password` | Não | - | Senha do SSH (se não usar chave) |
| `port` | Não | `65002` | Porta SSH |
| `keep_releases` | Não | `5` | Quantidade de versões antigas mantidas no servidor |
| `command` | Não | `deploy` | Ação a executar: `deploy` (padrão) ou `rollback` |

---

## 📄 Ignorando arquivos com `.deployignore`

Você pode criar um arquivo `.deployignore` na raiz do seu projeto para evitar enviar arquivos de desenvolvimento desnecessários:

```text
tests/
docker/
.phpunit.cache
*.sql
README.md
```

> **Nota:** Arquivos como `.git`, `.github`, `.env` e `node_modules` já são ignorados automaticamente por padrão. A pasta `vendor/` é preservada.

---

## 💻 Uso como CLI (Local / Offline)

Você também pode usar a ferramenta diretamente pelo terminal ou testar em modo simulação:

```bash
# Ver opções disponíveis
npx @oedmafia/hostinger-deploy --help

# Testar empacotamento offline (gera o .tar.gz local)
npx @oedmafia/hostinger-deploy pack

# Simulação de deploy (Dry-run sem enviar SSH)
npx @oedmafia/hostinger-deploy deploy --dry-run

# Rollback imediato para a versão anterior
npx @oedmafia/hostinger-deploy rollback
```

---

## 👨‍💻 Autor

Criado por **[Edmar Silva (Oedmafia)](https://github.com/Oedmafia)**.  
Licenciado sob a [Licença MIT](LICENSE).
