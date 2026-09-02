const path = require('path');

// sequelize-cli is always invoked from app/backend (.sequelizerc resolves its paths
// relative to cwd), so this points at the repo's single root .env -- the same file
// ConfigModule reads, so the CLI and the running app can never target different
// databases. Inside the container the path does not exist, dotenv quietly does nothing,
// and the values below come from the container environment instead.
require('dotenv').config({ path: path.resolve(process.cwd(), '../../.env') });

const connection = {
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  dialectOptions:
    process.env.DB_SSL === 'true'
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
};

module.exports = {
  development: connection,
  test: connection,
  production: connection,
};
