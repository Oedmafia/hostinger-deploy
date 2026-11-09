<div align="center">

# Hostinger Zero-Downtime Deploy 🚀

**Atomic zero-downtime deployment GitHub Action & CLI for Hostinger servers (PHP, Node, and Web Apps) via SSH.**

<br/>

[ English ](./README.md) • [ Português ](./README.pt.md) • [ Español ](./README.es.md)

<br/>

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-Hostinger_Deploy-673AB7?style=flat-square&logo=github-actions&logoColor=white)](#-github-actions-usage)
[![Node Version](https://img.shields.io/badge/Node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

Replace fragile manual uploads and service interruptions with enterprise-grade deployments based on the **atomic symlink pattern**. Features **sub-millisecond switches**, **instant automated rollback**, and automatic preservation of persistent assets (`.env`, `storage`, uploads).

---

## ⚡ Server Architecture & Safety Model

Instead of overwriting production files in-place, this Action maintains an isolated, reliable folder structure on your Hostinger server:

```text
/home/u123456789/domains/yourdomain.com/
│
├── current -> releases/20261105041500/   # Atomic symbolic link (live version)
│
├── shared/                               # Persistent files & directories
│   ├── .env
│   ├── storage/
│   └── uploads/
│
└── releases/                             # Historical versions
    ├── 20261105030000/
    └── 20261105041500/                   # Active release
```

* **Zero-Downtime:** The active release switch (`ln -nfs`) completes in under 1 millisecond.
* **Low RAM Overhead on Hostinger:** Heavy build steps (`composer install`, `npm run build`) execute on free GitHub runners. Your server only receives a lightweight `.tar.gz` bundle.
* **First Deployment Bootstrap:** Zero manual server preparation needed. The tool automatically bootstraps `releases/`, `shared/`, and configured directories on first run.
* **Pre-Switch Auto-Cleanup:** If a network interruption or upload error occurs during deployment, the incomplete release directory is purged automatically before switching. The active site is never touched.
* **Resilient Rollback:** Point the symlink back to the previous release in 0.1s. If rollback is executed on an initial deployment (only one release in history), it logs a warning and exits cleanly without crashing your CI/CD pipeline.

---

## 📋 Prerequisites & Hostinger Plans

* **Hostinger Plan Requirement:** Requires **Hostinger Premium Web Hosting or higher** (Business, Cloud Startup, or VPS).
  > **Note:** The entry-level **Single Web Hosting** plan does **not** include SSH Access. SSH access (default port `65002`) is required for remote atomic operations.
* **SSH Credentials:** SSH Host, Username, Port, and Private Key (or Password) configured as GitHub Repository Secrets.

---

## 🛠️ GitHub Actions Usage

### Complete Workflow with Quality Gate & Emergency Rollback

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy to Hostinger

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # Step 1: Install Dependencies (PHP example)
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'

      - name: Install Composer Dependencies
        run: composer install --no-dev --optimize-autoloader --no-interaction

      # Step 2: Atomic Deployment
      - name: Deploy to Hostinger
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002' # Default Hostinger SSH port
          remote_path: '/home/u123456789/domains/yourdomain.com'
          keep_releases: 5

      # Step 3: Healthcheck API validation
      - name: Healthcheck
        run: |
          sleep 3
          curl -f -s -i "https://yourdomain.com/health" || (echo "[FATAL] Healthcheck failed!" && exit 1)

      # Step 4: Emergency Rollback (Executes automatically if the Healthcheck fails)
      - name: Emergency Rollback on Failure
        if: failure()
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002'
          remote_path: '/home/u123456789/domains/yourdomain.com'
          command: rollback
```

---

## 🧩 Microservices & Subdirectory APIs

If your project hosts multiple independent APIs or microservices under the same domain (e.g. `/api/v1` or `/auth/v2`), **you do not need to change any frontend URLs or backend `APP_BASE_PATH` settings**.

Set `remote_path` to your specific subfolder:
```yaml
remote_path: '/home/u123456789/domains/yourdomain.com/public_html/api/v1'
```

* **Zero Routing Changes:** The web server resolves the symlink transparently.
* **Independent Versioning:** Each microservice maintains its own `releases/`, `shared/`, and rollback history without interfering with adjacent APIs.

---

## ⚙️ Supported Inputs

| Input | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | **Yes** | - | Hostinger SSH host (e.g. `srv123.main-hosting.eu` or IP) |
| `username` | **Yes** | - | SSH user account (e.g. `u123456789`) |
| `remote_path` | **Yes** | - | Absolute root path of the project or sub-API on Hostinger |
| `key` | No | - | SSH private key string |
| `password` | No | - | SSH account password (if not using private key) |
| `port` | No | `65002` | SSH port number |
| `keep_releases` | No | `5` | Number of recent releases retained on the server |
| `command` | No | `deploy` | Action to execute: `deploy` (default) or `rollback` |

---

## 📄 Excluding Files with `.deployignore`

Create a `.deployignore` file in the root of your project to exclude local development assets from being sent to production:

```text
tests/
docker/
.phpunit.cache
*.sql
README.md
```

> **Note:** `.git`, `.github`, `.env`, and `node_modules` are automatically excluded by default. The `vendor/` directory is preserved.

---

## 💻 CLI Usage (Local / Offline)

You can also execute commands directly via terminal or test the deployment in simulation mode:

```bash
# Display help and available options
npx @oedmafia/hostinger-deploy --help

# Generate a local .tar.gz bundle without uploading
npx @oedmafia/hostinger-deploy pack

# Simulate a full deployment without remote SSH calls (Dry-run mode)
npx @oedmafia/hostinger-deploy deploy --dry-run

# Trigger an immediate rollback to the previous release
npx @oedmafia/hostinger-deploy rollback
```

---

## 👨‍💻 Author

Engineered by **[Edmar Silva (Oedmafia)](https://github.com/Oedmafia)**.  
Released under the [MIT License](LICENSE).
