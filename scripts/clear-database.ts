import { DataSource } from 'typeorm';

/**
 * ⚠️ WARNING: This script will DELETE ALL DATA from the database
 * This action is IRREVERSIBLE. Make sure you have a backup!
 */

const clearDatabase = async () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Create a direct connection to query the database
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    logging: false,
  });

  try {
    console.log('🔌 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Get all table names
      const tables = await queryRunner.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );

      if (tables.length === 0) {
        console.log('ℹ️ No tables found in the database');
        return;
      }

      console.log(`\n📋 Found ${tables.length} table(s):`);
      tables.forEach((t: any) => console.log(`   - ${t.table_name}`));

      // Truncate all tables (try with CASCADE first for managed PostgreSQL like Neon)
      console.log('\n🗑️  Truncating all tables...');
      for (const table of tables) {
        const tableName = table.table_name;
        try {
          // Use CASCADE to handle foreign keys
          await queryRunner.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
          console.log(`   ✓ ${tableName}`);
        } catch (error) {
          console.log(`   ✗ ${tableName} (${(error as any).message})`);
        }
      }

      console.log('\n✅ Database cleared successfully!');
      console.log('⚠️  All data has been deleted. This cannot be undone.');

    } finally {
      await queryRunner.release();
    }

  } catch (error) {
    console.error('❌ Error clearing database:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
};

// Run the script with confirmation
const promptConfirmation = (): Promise<boolean> => {
  return new Promise((resolve) => {
    console.warn('\n⚠️  WARNING: This will DELETE ALL DATA from the database!');
    console.warn('This action CANNOT be reversed.\n');

    const args = process.argv.slice(2);
    if (args.includes('--force')) {
      console.log('✓ Proceeding with --force flag\n');
      resolve(true);
      return;
    }

    console.log('To proceed, run with the --force flag:');
    console.log('npm run clear:db -- --force\n');
    resolve(false);
  });
};

(async () => {
  const confirmed = await promptConfirmation();
  if (confirmed) {
    await clearDatabase();
  } else {
    console.log('❌ Operation cancelled. No data was deleted.');
    process.exit(0);
  }
})();

