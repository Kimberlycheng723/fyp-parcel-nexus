export function landingPathForRole(role) {
  return role === "SUPER_ADMIN" ? "/accounts" : "/dashboard";
}
