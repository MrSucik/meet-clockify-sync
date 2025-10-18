import { z } from 'zod';

// Environment schema
const envSchema = z.object({
  // Google Meet API Configuration
  GOOGLE_CLIENT_ID: z.string().min(1, 'Google Client ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'Google Client Secret is required'),
  GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI must be a valid URL'),

  // Google User Configuration
  GOOGLE_USER_EMAIL: z.string().email('GOOGLE_USER_EMAIL must be a valid email'),

  // Clockify API Configuration
  CLOCKIFY_API_TOKEN: z.string().min(1, 'Clockify API token is required'),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']),

  // Sync Configuration
  SYNC_DAYS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !Number.isNaN(val) && val >= 1 && val <= 365, {
      message: 'SYNC_DAYS must be a number between 1 and 365',
    }),

  // API Configuration
  CLOCKIFY_API_BASE: z.string().url('CLOCKIFY_API_BASE must be a valid URL'),

  // Rate Limiting Configuration
  CLOCKIFY_API_DELAY: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !Number.isNaN(val) && val >= 0 && val <= 10000, {
      message: 'CLOCKIFY_API_DELAY must be a number between 0 and 10000 (milliseconds)',
    }),

  // Project Configuration
  MEET_PROJECT_NAME: z.string().min(1, 'MEET_PROJECT_NAME is required'),
});

// Inferred type
export type Environment = z.infer<typeof envSchema>;

// Cached environment
let cachedEnv: Environment | null = null;

/**
 * Validates and returns the application environment configuration
 */
export function validateEnvironment(skipDotenv: boolean = false): Environment {
  if (cachedEnv) {
    return cachedEnv;
  }

  if (!skipDotenv) {
    try {
      require('dotenv/config');
    } catch (error) {
      console.error('❌ Failed to load .env file:', error);
      process.exit(1);
    }
  }

  try {
    cachedEnv = envSchema.parse(process.env);

    console.log('✅ Environment validation successful');
    console.log(`   Environment: ${cachedEnv.NODE_ENV}`);
    console.log(`   Sync Days: ${cachedEnv.SYNC_DAYS}`);

    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ Environment validation failed:\n');

      const missingVars: string[] = [];
      const invalidVars: string[] = [];

      // biome-ignore lint/suspicious/noExplicitAny: Zod error types are complex
      error.issues.forEach((err: any) => {
        const field = err.path.join('.');
        if (err.code === 'invalid_type' && err.received === 'undefined') {
          missingVars.push(`  - ${field}: ${err.message}`);
        } else {
          invalidVars.push(`  - ${field}: ${err.message}`);
        }
      });

      if (missingVars.length > 0) {
        console.error('Missing required variables:');
        for (const msg of missingVars) {
          console.error(msg);
        }
        console.error('');
      }

      if (invalidVars.length > 0) {
        console.error('Invalid variable values:');
        for (const msg of invalidVars) {
          console.error(msg);
        }
        console.error('');
      }

      console.error(
        'Please check your .env file and ensure all required variables are set correctly.',
      );
      console.error('See .env.example for the required configuration.\n');
    } else {
      console.error('❌ Environment validation error:', error);
    }

    process.exit(1);
  }
}

/**
 * Gets the validated environment
 */
export function getEnvironment(): Environment {
  if (!cachedEnv) {
    throw new Error('Environment not validated yet. Call validateEnvironment() first.');
  }
  return cachedEnv;
}

/**
 * Resets the cached environment (useful for tests)
 */
export function resetEnvironment(): void {
  cachedEnv = null;
}
