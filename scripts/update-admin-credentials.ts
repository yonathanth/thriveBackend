import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { Admin } from '../src/entities/admin.entity';

/**
 * Sets the admin login. Pass the email and password as arguments or as ADMIN_EMAIL /
 * ADMIN_PASSWORD (environment or .env):
 *   npm run update:admin -- admin@example.com 'a-long-password'
 */
const TARGET_EMAIL_RAW = process.argv[2] || readEnv('ADMIN_EMAIL') || '';
const TARGET_EMAIL = TARGET_EMAIL_RAW.trim().toLowerCase();
const TARGET_PASSWORD = process.argv[3] || readEnv('ADMIN_PASSWORD') || '';

function readEnv(key: string): string | undefined {
  if (process.env[key]) {
    return process.env[key];
  }

  const envPath = path.resolve(__dirname, '..', '.env');

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [name, ...rest] = trimmed.split('=');
      if (name.trim() === key) {
        const value = rest.join('=').trim();
        return value.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return undefined;
}

const updateAdminCredentials = async () => {
  if (!TARGET_EMAIL || !TARGET_PASSWORD) {
    console.error('❌ Give an email and password: npm run update:admin -- <email> <password>');
    process.exit(1);
  }
  if (TARGET_PASSWORD.length < 8) {
    console.error('❌ Use a password of at least 8 characters');
    process.exit(1);
  }

  const databaseUrl = readEnv('DATABASE_URL');

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set and .env could not be read');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [Admin],
    synchronize: false,
    logging: false,
  });

  try {
    console.log('🔌 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const adminRepo = dataSource.getRepository(Admin);
    const hashedPassword = await bcrypt.hash(TARGET_PASSWORD, 10);

    // First, try to find an admin with the target email
    let admin = await adminRepo.findOne({
      where: { email: TARGET_EMAIL },
    });

    if (admin) {
      admin.password = hashedPassword;
      await adminRepo.save(admin);
      console.log(`✅ Updated existing admin (${TARGET_EMAIL_RAW}) password successfully.`);
      return;
    }

    // If no admin with the target email, update the first existing admin
    const existingAdmins = await adminRepo.find({
      order: { id: 'ASC' },
      take: 1,
    });

    if (existingAdmins.length > 0) {
      admin = existingAdmins[0];
      admin.email = TARGET_EMAIL;
      admin.password = hashedPassword;
      await adminRepo.save(admin);
      console.log(
        `✅ Updated admin ID ${admin.id} to email ${TARGET_EMAIL_RAW} with new password.`,
      );
      return;
    }

    // If no admins exist, create a new one
    admin = adminRepo.create({
      email: TARGET_EMAIL,
      password: hashedPassword,
      name: 'Admin',
      role: 'admin',
      isActive: true,
    });

    await adminRepo.save(admin);
    console.log(`✅ Created new admin ${TARGET_EMAIL_RAW} with specified password.`);
  } catch (error) {
    console.error('❌ Error updating admin credentials:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
};

updateAdminCredentials()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });

