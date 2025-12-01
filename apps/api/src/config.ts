import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  // Server
  PORT: parseInt(optionalEnv('PORT', '3000'), 10),
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),

  // URLs
  APP_URL: optionalEnv('APP_URL', 'http://localhost:5173'),
  API_URL: optionalEnv('API_URL', 'http://localhost:3000'),
  VIEWER_URL: optionalEnv('VIEWER_URL', 'http://localhost:5174'),

  // Practice Fusion OAuth
  PRACTICE_FUSION_CLIENT_ID: requireEnv('PRACTICE_FUSION_CLIENT_ID'),
  PRACTICE_FUSION_CLIENT_SECRET: requireEnv('PRACTICE_FUSION_CLIENT_SECRET'),
  PRACTICE_FUSION_DOCS_BASE_URL: optionalEnv(
    'PRACTICE_FUSION_DOCS_BASE_URL',
    'https://qa-api.practicefusion.com/ehr/documents/v3'
  ),

  // Database
  DATABASE_PATH: optionalEnv('DATABASE_PATH', './data/myhealthurl.db'),

  // AWS S3
  AWS_PROFILE: optionalEnv('AWS_PROFILE', 'practice-fusion-admin'),
  AWS_REGION: optionalEnv('AWS_REGION', 'us-east-1'),
  S3_BUCKET_NAME: optionalEnv('S3_BUCKET_NAME', 'smart-health-links'),

  // Security
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'),

  // SHL Defaults
  SHL_EXPIRATION_DAYS_DEFAULT: parseInt(optionalEnv('SHL_EXPIRATION_DAYS_DEFAULT', '90'), 10),
  SHL_EXPIRATION_DAYS_MAX: parseInt(optionalEnv('SHL_EXPIRATION_DAYS_MAX', '365'), 10),

  // Notifications (optional - will be stubbed if not provided)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
} as const;

// Validate hex string format for keys
function validateHexKey(name: string, value: string, expectedLength: number): void {
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${name} must be a hex string`);
  }
  if (value.length !== expectedLength) {
    throw new Error(`${name} must be ${expectedLength} hex characters (${expectedLength / 2} bytes)`);
  }
}

// Validate keys on startup
validateHexKey('SESSION_SECRET', config.SESSION_SECRET, 64);
validateHexKey('ENCRYPTION_KEY', config.ENCRYPTION_KEY, 64);
