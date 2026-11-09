<div align="center">

# Hostinger Zero-Downtime Deploy 🚀

**GitHub Action y CLI para Despliegues Atómicos sin Tiempo de Inactividad (Zero-Downtime) en servidores de Hostinger (PHP, Node y Aplicaciones Web) vía SSH.**

<br/>

[ English ](./README.md) • [ Português ](./README.pt.md) • [ Español ](./README.es.md)

<br/>

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-Hostinger_Deploy-673AB7?style=flat-square&logo=github-actions&logoColor=white)](#-uso-en-github-actions)
[![Node Version](https://img.shields.io/badge/Node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

Reemplace las subidas manuales lentas y las caídas de servicio por despliegues profesionales basados en el **patrón de enlaces simbólicos atómicos (Symlinks)**. Incluye **cambio de versión en milisegundos**, **reversión automática instantánea (Rollback)** y conservación de archivos persistentes (`.env`, `storage`, uploads).

---

## ⚡ Arquitectura en el Servidor y Modelo de Seguridad

En lugar de sobrescribir los archivos directamente en producción, esta Action mantiene una estructura de carpetas aislada y confiable en su servidor de Hostinger:

```text
/home/u123456789/domains/tudominio.com/
│
├── current -> releases/20261105041500/   # Enlace simbólico atómico (versión activa)
│
├── shared/                               # Archivos y carpetas persistentes
│   ├── .env
│   ├── storage/
│   └── uploads/
│
└── releases/                             # Historial de versiones anteriores
    ├── 20261105030000/
    └── 20261105041500/                   # Versión actual en producción
```

* **Zero-Downtime:** El cambio a la nueva versión (`ln -nfs`) se completa en menos de 1 milisegundo.
* **Ahorro de Memoria RAM en Hostinger:** Los procesos pesados de compilación (`composer install`, `npm run build`) se ejecutan en los servidores gratuitos de GitHub. Su servidor solo recibe un paquete `.tar.gz` ultraligero.
* **Bootstrap en el Primer Despliegue:** Cero configuración manual previa en el servidor. Las carpetas `releases/`, `shared/` y los directorios configurados se crean automáticamente en la primera ejecución.
* **Limpieza Automática Pre-Switch:** Si ocurre un corte de red o error durante la subida/extracción, la carpeta incompleta se elimina de inmediato antes de modificar el symlink. El sitio activo nunca se ve afectado.
* **Rollback Resiliente:** Regresa a la versión previa en 0.1s. Si se ejecuta en el primer despliegue (sin historial previo), emite una advertencia clara y finaliza de forma segura sin romper su flujo de CI/CD.

---

## 📋 Requisitos y Planes de Hostinger

* **Requisito de Plan de Hostinger:** Se requiere el plan **Hostinger Premium o superior** (Business, Cloud Startup o VPS).
  > **Nota:** El plan básico **Single** **no** incluye Acceso SSH. El acceso SSH (puerto predeterminado `65002`) es obligatorio para ejecutar operaciones atómicas y enlaces simbólicos.
* **Credenciales SSH:** Host, Usuario, Puerto y Clave Privada SSH (o Contraseña) configurados en los Secrets del repositorio en GitHub.

---

## 🛠️ Uso en GitHub Actions

### Flujo Completo con Validación y Rollback Automático

Cree el archivo `.github/workflows/deploy.yml` en su repositorio:

```yaml
name: Despliegue en Hostinger

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Descargar código (Checkout)
        uses: actions/checkout@v4

      # Paso 1: Instalar dependencias (ejemplo para PHP)
      - name: Configurar PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'

      - name: Instalar dependencias de PHP
        run: composer install --no-dev --optimize-autoloader --no-interaction

      # Paso 2: Acción de Despliegue Atómico
      - name: Despliegue Atómico en Hostinger
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002' # Puerto SSH predeterminado de Hostinger
          remote_path: '/home/u123456789/domains/tudominio.com'
          keep_releases: 5

      # Paso 3: Verificación de salud de la API (Healthcheck)
      - name: Healthcheck
        run: |
          sleep 3
          curl -f -s -i "https://tudominio.com/health" || (echo "[FATAL] Healthcheck falló!" && exit 1)

      # Paso 4: Reversión Automática de Emergencia (Se ejecuta solo si falla el Healthcheck)
      - name: Rollback de Emergencia
        if: failure()
        uses: Oedmafia/hostinger-deploy@main
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          port: '65002'
          remote_path: '/home/u123456789/domains/tudominio.com'
          command: rollback
```

---

## 🧩 Microservicios y APIs en Subcarpetas

Si su proyecto aloja múltiples microservicios o APIs independientes en el mismo dominio (ej: `/api/v1` o `/auth/v2`), **no necesita modificar ninguna URL en el frontend ni cambiar el `APP_BASE_PATH` en su código PHP**.

Configure `remote_path` apuntando a la subcarpeta específica:
```yaml
remote_path: '/home/u123456789/domains/tudominio.com/public_html/api/v1'
```

* **Sin cambios de enrutamiento:** El servidor web resuelve el enlace simbólico de forma transparente.
* **Aislamiento total:** Cada microservicio conserva su propio historial de `releases/`, `shared/` y rollback sin interferir con las demás APIs del sitio.

---

## ⚙️ Parámetros (Inputs) Soportados

| Parámetro | Requerido | Predeterminado | Descripción |
| :--- | :--- | :--- | :--- |
| `host` | **Sí** | - | Dominio o dirección IP del servidor SSH de Hostinger |
| `username` | **Sí** | - | Cuenta de usuario SSH (ej: `u123456789`) |
| `remote_path` | **Sí** | - | Ruta absoluta del directorio raíz o sub-API en Hostinger |
| `key` | No | - | Contenido de la clave privada SSH |
| `password` | No | - | Contraseña SSH (si no utiliza clave privada) |
| `port` | No | `65002` | Puerto SSH |
| `keep_releases` | No | `5` | Cantidad de versiones anteriores conservadas en el servidor |
| `command` | No | `deploy` | Acción a ejecutar: `deploy` (predeterminado) o `rollback` |

---

## 📄 Exclusión de Archivos con `.deployignore`

Puede crear un archivo `.deployignore` en la raíz de su proyecto para evitar transferir archivos de desarrollo innecesarios a producción:

```text
tests/
docker/
.phpunit.cache
*.sql
README.md
```

> **Nota:** Carpetas como `.git`, `.github`, `.env` y `node_modules` se excluyen automáticamente por defecto. La carpeta `vendor/` se conserva intacta.

---

## 💻 Uso como CLI (Local / Offline)

También puede utilizar la herramienta directamente desde la terminal o probarla en modo simulación:

```bash
# Ver opciones y comandos disponibles
npx @oedmafia/hostinger-deploy --help

# Generar un paquete .tar.gz local sin transferirlo
npx @oedmafia/hostinger-deploy pack

# Simulación completa sin ejecutar comandos SSH (Modo Dry-run)
npx @oedmafia/hostinger-deploy deploy --dry-run

# Reversión inmediata a la versión anterior
npx @oedmafia/hostinger-deploy rollback
```

---

## 👨‍💻 Autor

Desarrollado por **[Edmar Silva (Oedmafia)](https://github.com/Oedmafia)**.  
Distribuido bajo la [Licencia MIT](LICENSE).
