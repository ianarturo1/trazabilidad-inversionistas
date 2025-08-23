# Finsolar • Investor Dashboard (estático con Admin)

Este paquete es un **sitio estático** listo para publicarse en Netlify y administrar contenido sin código con **Decap/Netlify CMS** en `/admin`.

## Estructura
- `index.html` — Dashboard (mapa, KPIs, tarjetas de proyectos y Sociality)
- `data/manifest.json` — Slug del inversionista (`defaultTenant`)
- `data/tenants/<slug>.json` — Datos de cada inversionista (proyectos, sociality, paneles)
- `admin/` — Panel CMS (requiere conectar con GitHub y habilitar Identity + Git Gateway)
- `assets/` — Estilos, logos, uploads
- `js/app.js` — Render y lógica ligera

## Flujo de administración
1) Conecta el sitio a un repo de GitHub y a Netlify (Import from Git).
2) En Netlify activa **Identity** y **Git Gateway** (`Site Settings` → Identity → Enable; y `Identity` → `Git Gateway` → `Enable`).
3) Entra a `/admin` (por ejemplo `https://tu-sitio.netlify.app/admin`), inicia sesión y edita:
   - **Inversionistas (detalles)**: crea/edita archivos en `data/tenants`.
   - **Manifest**: define el `defaultTenant` (slug único del inversionista).
4) Abre `/<slug>/` (por ejemplo `/fortacero/`) para ver la vista exclusiva del inversionista; el slug se fuerza automáticamente y no permite cambiar a otros.

> Si no deseas CMS, puedes editar los JSON a mano y subirlos (drag & drop) o por GitHub.

## Notas

El archivo `netlify.toml` redirige cualquier ruta a `index.html`, lo que permite la navegación como una aplicación de una sola página.
