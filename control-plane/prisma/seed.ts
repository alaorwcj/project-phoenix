import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Acme Corporation',
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created tenant: ${tenant.name} (ID: ${tenant.id})`);

  // Create test user (admin)
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@acme.local',
      passwordHash: await bcrypt.hash('admin123456', 10),
      role: 'ADMIN',
      tenantId: tenant.id,
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create operator user
  const operatorUser = await prisma.user.create({
    data: {
      email: 'operator@acme.local',
      passwordHash: await bcrypt.hash('operator123456', 10),
      role: 'OPERATOR',
      tenantId: tenant.id,
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created operator user: ${operatorUser.email}`);

  // Create viewer user
  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@acme.local',
      passwordHash: await bcrypt.hash('viewer123456', 10),
      role: 'VIEWER',
      tenantId: tenant.id,
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created viewer user: ${viewerUser.email}`);

  // Create default environments
  const devEnv = await prisma.environment.create({
    data: {
      name: 'Development',
      slug: 'dev',
      description: 'Development environment for testing',
      tenantId: tenant.id,
      variables: {},
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created environment: ${devEnv.name}`);

  const stagingEnv = await prisma.environment.create({
    data: {
      name: 'Staging',
      slug: 'staging',
      description: 'Staging environment for pre-production testing',
      tenantId: tenant.id,
      variables: {},
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created environment: ${stagingEnv.name}`);

  const prodEnv = await prisma.environment.create({
    data: {
      name: 'Production',
      slug: 'prod',
      description: 'Production environment',
      tenantId: tenant.id,
      variables: {},
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created environment: ${prodEnv.name}`);

  // Create test hosts
  const host1 = await prisma.host.create({
    data: {
      name: 'docker-host-01',
      hostname: 'docker-host-01.acme.local',
      agentId: 'agent-001',
      status: 'ONLINE',
      dockerVersion: '24.0.7',
      tenantId: tenant.id,
      metadata: {
        os: 'Linux',
        arch: 'x86_64',
        kernelVersion: '6.1.0',
      },
      lastHeartbeat: new Date(),
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created host: ${host1.hostname} (agent: ${host1.agentId})`);

  const host2 = await prisma.host.create({
    data: {
      name: 'docker-host-02',
      hostname: 'docker-host-02.acme.local',
      agentId: 'agent-002',
      status: 'OFFLINE',
      dockerVersion: '24.0.7',
      tenantId: tenant.id,
      metadata: {
        os: 'Linux',
        arch: 'arm64',
        kernelVersion: '6.1.0',
      },
      lastHeartbeat: new Date(Date.now() - 3600000), // 1 hour ago
      createdAt: new Date(),
    },
  });

  console.log(`✅ Created host: ${host2.hostname} (agent: ${host2.agentId})`);

  // Print test credentials
  console.log('\n📋 Test Credentials:');
  console.log(`\nTenant: ${tenant.name}`);
  console.log(`Tenant ID: ${tenant.id}`);
  console.log('\nUsers:');
  console.log(`  Admin:    ${adminUser.email} / admin123456`);
  console.log(`  Operator: ${operatorUser.email} / operator123456`);
  console.log(`  Viewer:   ${viewerUser.email} / viewer123456`);
  console.log('\nEnvironments:');
  console.log(`  Development: ${devEnv.slug}`);
  console.log(`  Staging:     ${stagingEnv.slug}`);
  console.log(`  Production:  ${prodEnv.slug}`);
  console.log('\nHosts (for heartbeat testing):');
  console.log(`  Host 1: ${host1.agentId} (${host1.status})`);
  console.log(`  Host 2: ${host2.agentId} (${host2.status})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
