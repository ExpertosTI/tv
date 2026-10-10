import { pathToFileURL } from 'node:url';
import { createServer } from './app.js';

export async function start(options = {}) {
  const ctx = createServer(options);
  const host = options.host ?? '127.0.0.1';
  const http = await new Promise((resolve) => {
    const server = ctx.app.listen(options.port ?? 0, host, () => resolve(server));
  });
  return {
    ...ctx,
    http,
    port: http.address().port,
    async stop() {
      await new Promise((resolve) => http.close(resolve));
      ctx.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const ctx = await start({ port, host });
  console.log(`RENACE Pantalla en http://${host}:${ctx.port}`);
  console.log(`Datos en ${ctx.dataDir}`);
}
