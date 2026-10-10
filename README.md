# RENACE Pantalla

Menú en la TV para cafeterías y otros negocios. El servidor guarda varios negocios. Cada TV se vincula con un código de 6 caracteres.

El negocio arma un menú con una plantilla web (Aurora, Vitrina o Cinta). Cambia precios y textos en el panel y la TV los muestra con movimiento, sin volver a exportar una imagen. JPG, GIF y video siguen disponibles en la misma lista.

## Cómo se usa

1. Levanta el servidor.
2. Entra en el panel y crea el negocio.
3. Instala la app en la TV. Aparece un código.
4. En el panel, escribe el código y elige la lista.
5. En Menús creas la carta, editas precios y la agregas a una lista. La TV la muestra unos 45 segundos por ciclo, o los segundos que pongas en la lista.

La primera vez, en la TV o la tablet abre **Servidor** y escribe la dirección, por ejemplo `http://192.168.1.20:8080` o `https://tv.renace.tech`.

## Qué hace el panel

- **Perfil.** Logo, frase y tres colores (navy, acción y precio). La TV los aplica en el menú al guardar.
- **Menús.** Plantillas Aurora, Vitrina y Cinta. El precio se edita en un campo. Puedes poner una foto de fondo.
- **Archivos.** Fotos y videos. Un video se comprime a MP4 de hasta 1920 px (H.264, CRF 28) si el servidor tiene ffmpeg. Si no, se guarda el original.
- **Listas.** Las fotos de una lista son las diapositivas: entran con un movimiento lento y duran los segundos que pongas. El video y el menú van en la misma lista.
- La tablet y la TV escuchan el servidor. Un cambio de precio o de perfil se ve sin esperar el ciclo de 45 segundos.

## Producción en tv.renace.tech

Mismo servidor que el resto de Renace: Docker Swarm, red externa `RenaceNet` y Traefik con Let's Encrypt. El DNS de `tv.renace.tech` apunta a `45.9.191.18`.

En el VPS, la primera vez:

```bash
mkdir -p /opt/tv.renace.tech
cd /opt/tv.renace.tech
git clone https://github.com/ExpertosTI/tv.git .
docker build -t renace-tv:local ./server
docker stack deploy -c deploy/stack.yml tv
docker service ls
curl -fsSL https://tv.renace.tech/api/health
```

Cada cambio de código:

```bash
cd /opt/tv.renace.tech
git fetch origin main && git reset --hard origin/main
docker build -t renace-tv:local ./server
docker service update --force tv_tv
curl -fsSL https://tv.renace.tech/api/health
```

Los archivos y la base quedan en el volumen `tv_tv-data`. No borres ese volumen en un deploy normal.

`SESSION_SECRET` y `ADMIN_PASSWORD` son opcionales. Si no defines el secreto, el servidor lo crea dentro del volumen.

## Servidor

```bash
cd pantalla/server
npm install
npm test
npm start
```

El panel queda en `http://localhost:8080`.

Con Docker, desde la carpeta `pantalla`:

```bash
docker compose up -d --build
```

Los archivos y la base quedan en el volumen `pantalla-data`. Si no defines `SESSION_SECRET`, el servidor crea una clave y la guarda ahí.

Variables útiles:

| Variable | Para qué |
| --- | --- |
| `PUBLIC_BASE_URL` | URL pública detrás de Traefik. En producción es `https://tv.renace.tech`. En una red local, no la pongas. |
| `ADMIN_PASSWORD` | Abre `/admin` para ver los negocios. |
| `ALLOW_REGISTER` | `false` cierra el registro de negocios nuevos. |
| `QUOTA_BYTES` | Tope de archivos por negocio. Por defecto 5 GB. |

Formatos: JPG, PNG, WEBP (20 MB), GIF (40 MB), MP4, MOV y WEBM (250 MB).

## App Android TV

Requisitos en esta máquina: Android SDK y un JDK 17 o superior. El script usa `~/Library/Java/jdk-21*` si existe.

```bash
cd pantalla/android
./build.sh
```

Eso crea la clave de firma la primera vez y genera:

- `app/build/outputs/apk/release/app-release.apk`
- `app/build/outputs/bundle/release/app-release.aab`

El AAB es el archivo que se sube a Play Console. La ficha, el ícono y el banner están en `play-store/`.

Guarda `android/keystore/` y `android/key.properties`. No están en git. Si se pierden, Play no acepta una actualización de la misma app.

En la TV, el control mueve el foco. **Servidor** cambia la dirección. **Nuevo código** pide otro código si el anterior no se usó. La tecla de menú del control también abre el servidor.

La app puede quedar como pantalla de inicio para que el menú vuelva al encender la TV.

## Marca

Colores de la guía RENACE: navy `#00204E`, azul `#0087FF`, acción `#0074DB`. El ícono es una flecha a 45° sobre navy. No incrusta Glancyr Neue: la licencia de esa fuente quedó por confirmar en la guía.
