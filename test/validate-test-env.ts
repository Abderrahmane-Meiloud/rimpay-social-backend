const required = ['DATABASE_URL_TEST', 'JWT_SECRET', 'JWT_EXPIRES_IN'] as const;

if (process.env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be "test". Refusing to run.');
}

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is not set. Refusing to run.`);
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
