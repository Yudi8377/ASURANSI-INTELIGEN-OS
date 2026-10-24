// Accounts with wildcard/system-wide permissions must enroll in MFA before receiving access tokens.
export function requiresMandatoryMfa(user) {
  return Array.isArray(user?.permissions) && user.permissions.includes('*');
}
