export function createAuthGuard({ pool }) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('createAuthGuard requires a pool with query()');
  }

  return async function auth(request, reply) {
    try {
      await request.jwtVerify();
      // MFA challenge tokens are only for the MFA verification endpoints. Reject
      // them here even if a future issuer accidentally adds access-token claims.
      if (request.user?.purpose === 'mfa_challenge' ||
          !request.user?.userId ||
          !request.user?.tenantId ||
          !Array.isArray(request.user?.permissions)) {
        throw new Error('Invalid token claims');
      }
    } catch {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Sesi tidak valid atau telah kedaluwarsa.'
      });
    }

    // A signed JWT is not sufficient: check current account and tenant state on every protected request.
    const principal = await pool.query(
      'SELECT u.status AS user_status, t.status AS tenant_status FROM asuransi.users u JOIN asuransi.tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2 LIMIT 1',
      [request.user.userId, request.user.tenantId]
    );

    if (!principal.rowCount || principal.rows[0].user_status !== 'active') {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Akun tidak aktif atau sesi telah dicabut.'
      });
    }

    if (principal.rows[0].tenant_status !== 'active') {
      return reply.code(403).send({
        error: 'TENANT_SUSPENDED',
        message: 'Organisasi tidak aktif. Hubungi administrator.'
      });
    }
  };
}
