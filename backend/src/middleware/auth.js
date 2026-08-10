// auth.js (middleware)
// Isso roda ANTES de qualquer rota protegida. Ele confere se a pessoa
// mandou um "crachá digital" (token JWT) válido no cabeçalho da requisição.
// Se for válido, a gente sabe de qual empresa (company_id) são os dados
// que ela pode ver - assim uma empresa nunca vê os leads de outra.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "troque-essa-chave-em-producao";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token não enviado. Faça login primeiro." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.companyId = payload.companyId;
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

module.exports = { requireAuth, JWT_SECRET };
