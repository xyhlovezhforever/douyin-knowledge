try {
  process.loadEnvFile();
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code !== 'ENOENT') throw error;
}
