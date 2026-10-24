export function findLoginPrincipal(pool, email) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('findLoginPrincipal requires a pool with query()');
  }
  return pool.query(`SELECT u.id,u.tenant_id,u.email,u.full_name,u.password_hash,u.status,
    COALESCE(jsonb_agg(DISTINCT perm.value) FILTER (WHERE perm.value IS NOT NULL),'[]'::jsonb) AS permissions
    FROM asuransi.users u
    LEFT JOIN asuransi.user_roles ur ON ur.user_id=u.id
    LEFT JOIN asuransi.roles r ON r.id=ur.role_id AND r.tenant_id=u.tenant_id
    LEFT JOIN LATERAL jsonb_array_elements_text(r.permissions) perm(value) ON true
    WHERE lower(u.email)=lower($1)
    GROUP BY u.id LIMIT 2`, [email]);
}
