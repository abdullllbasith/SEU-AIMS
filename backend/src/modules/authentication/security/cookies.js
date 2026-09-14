export function cookieOptions(config, { maxAgeMs }) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(res, { accessToken, refreshToken, csrfToken, config }) {
  res.cookie(config.auth.accessCookie, accessToken, cookieOptions(config, {
    maxAgeMs: config.auth.accessTtlSeconds * 1000,
  }));
  res.cookie(config.auth.refreshCookie, refreshToken, cookieOptions(config, {
    maxAgeMs: config.auth.refreshTtlSeconds * 1000,
  }));
  res.cookie(config.auth.csrfCookie, csrfToken, {
    httpOnly: false,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: '/',
    maxAge: config.auth.refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res, { config }) {
  const base = {
    path: '/',
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
  };
  res.clearCookie(config.auth.accessCookie, { ...base, httpOnly: true });
  res.clearCookie(config.auth.refreshCookie, { ...base, httpOnly: true });
  res.clearCookie(config.auth.csrfCookie, { ...base, httpOnly: false });
}
