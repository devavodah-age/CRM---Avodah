// Set JWT_SECRET BEFORE requiring any module that imports middleware/auth,
// which calls process.exit(1) at load time if JWT_SECRET is missing.
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { testPool, cleanDb } = require('../../test-helpers/db');

let app, token, companyId;

beforeAll(async () => {
  app = require('../../server-factory');

  await cleanDb();

  const co = await testPool.query("INSERT INTO companies (name) VALUES ('Lead Test Co') RETURNING id");
  companyId = co.rows[0].id;
  const hash = await bcrypt.hash('pass123', 10);
  await testPool.query(
    "INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, 'U', 'lead@test.com', $2, 'admin')",
    [companyId, hash]
  );
  const res = await request(app).post('/api/auth/login').send({ email: 'lead@test.com', password: 'pass123' });
  token = res.body.token;
});

afterAll(async () => {
  await cleanDb();
  await testPool.end();
});

describe('GET /api/leads', () => {
  it('returns paginated leads with metadata', async () => {
    const res = await request(app).get('/api/leads?page=1&limit=10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('leads');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page', 1);
    expect(res.body.data).toHaveProperty('limit', 10);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/leads', () => {
  it('creates a lead and returns it', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'João Teste', phone: '11999990000', value: 500 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('João Teste');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '11999990000' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/leads/:id/stage', () => {
  it('updates lead stage', async () => {
    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Stage Test Lead' });
    const leadId = create.body.data.id;

    const res = await request(app)
      .patch(`/api/leads/${leadId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'contato' });
    expect(res.status).toBe(200);
    expect(res.body.data.lead.stage).toBe('contato');
  });
});

describe('DELETE /api/leads/:id', () => {
  it('deletes lead and returns 204', async () => {
    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delete Me' });
    const leadId = create.body.data.id;

    const res = await request(app)
      .delete(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
