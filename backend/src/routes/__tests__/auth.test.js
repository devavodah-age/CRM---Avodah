// Set JWT_SECRET BEFORE requiring any module that imports middleware/auth,
// which calls process.exit(1) at load time if JWT_SECRET is missing.
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { testPool, cleanDb } = require('../../test-helpers/db');

let app;

beforeAll(async () => {
  app = require('../../server-factory');

  await cleanDb();

  // Seed a test company and user
  const companyRes = await testPool.query(
    "INSERT INTO companies (name) VALUES ('Test Co') RETURNING id"
  );
  const companyId = companyRes.rows[0].id;
  const hash = await bcrypt.hash('senha123', 10);
  await testPool.query(
    "INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, 'Test User', 'test@test.com', $2, 'admin')",
    [companyId, hash]
  );
});

afterAll(async () => {
  await cleanDb();
  await testPool.end();
});

describe('POST /api/auth/login', () => {
  it('returns token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'senha123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body).toHaveProperty('company');
    expect(res.body.company).toHaveProperty('id');
    expect(res.body.company).toHaveProperty('name');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'senha123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
