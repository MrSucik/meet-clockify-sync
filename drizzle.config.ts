import type { Config } from 'drizzle-kit';

export default {
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url:
			process.env.DATABASE_URL ||
			'postgresql://meet_user:changeme@localhost:5432/meet_clockify',
	},
} satisfies Config;
