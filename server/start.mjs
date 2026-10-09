import { createAppServer } from './app.mjs';

const value = process.env.PORT ?? '3000';
if (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) > 65535) {
  console.error('PORT must be an integer between 0 and 65535');
  process.exitCode = 1;
} else {
  try {
    const server = await createAppServer();
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(Number(value), '127.0.0.1', () => {
      console.log(`Incident explorer: http://127.0.0.1:${server.address().port}`);
    });
    const shutdown = () => { server.close(); server.closeIdleConnections(); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error(`Unable to start: ${error.message}. Generate the dataset with npm run seed.`);
    process.exitCode = 1;
  }
}
