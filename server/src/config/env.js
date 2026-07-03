// Central config, read once from the environment with dev-safe defaults.
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fwa_ops',
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10
  }
}

export const isProd = config.nodeEnv === 'production'
