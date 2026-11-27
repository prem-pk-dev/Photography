const baseUrl = process.env.PREVIEW_BASE_URL ?? "https://test-preview-admin-auth-e2e.golden-films.pages.dev";
const email = process.env.PREVIEW_ADMIN_EMAIL;
const password = process.env.PREVIEW_ADMIN_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    redirect: "manual",
    headers: {
      ...(options.headers ?? {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });
  assert(response.status < 300 || response.status === 401, `${options.method ?? "GET"} ${path} returned ${response.status}`);
  return response;
}

async function readJson(response, label) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${label} returned non-JSON response`); }
  return data;
}

assert(email && password, "Missing PREVIEW_ADMIN_EMAIL or PREVIEW_ADMIN_PASSWORD repository secret.");
assert(password.length <= 128, "Preview admin password exceeds the supported maximum.");

let cookie;
let loggedIn = false;
try {
  const ready = await request("/api/ready");
  assert(ready.status === 200, `Preview readiness check returned ${ready.status}`);
  const readyBody = await readJson(ready, "Preview readiness");
  assert(readyBody && typeof readyBody === "object", "Preview readiness payload is invalid.");

  const login = await fetch(new URL("/api/admin/login", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `Preview admin login failed with HTTP ${login.status}; verify the Preview account and repository secrets.`);
  const loginBody = await readJson(login, "Admin login");
  assert(loginBody?.ok === true && ["owner", "editor"].includes(loginBody?.admin?.role), "Admin login response contract is invalid.");

  const cookies = typeof login.headers.getSetCookie === "function"
    ? login.headers.getSetCookie()
    : [login.headers.get("set-cookie") ?? ""];
  const adminCookie = cookies.find((value) => value.startsWith("__Host-gf_admin="));
  assert(adminCookie, "Login succeeded but the secure admin session cookie was not returned.");
  cookie = adminCookie.split(";")[0];
  loggedIn = true;
  console.log("PASS: Preview admin login and secure session cookie.");

  const session = await request("/api/admin/session", { cookie });
  assert(session.status === 200, `Authenticated session check returned ${session.status}`);
  const sessionBody = await readJson(session, "Admin session");
  assert(sessionBody?.authenticated === true && sessionBody?.admin?.role === loginBody.admin.role, "Authenticated session identity/role mismatch.");
  console.log("PASS: Authenticated session read.");

  const cms = await request("/api/admin/content", { cookie });
  assert(cms.status === 200, `Admin CMS read returned ${cms.status}`);
  const cmsBody = await readJson(cms, "Admin CMS");
  assert(Array.isArray(cmsBody?.pages), "Admin CMS response did not contain a pages array.");
  console.log(`PASS: Read-only CMS listing (${cmsBody.pages.length} page records).`);

  const revisions = await request("/api/admin/content/revisions?page=home&limit=5", { cookie });
  assert(revisions.status === 200, `Admin CMS revisions read returned ${revisions.status}`);
  const revisionBody = await readJson(revisions, "CMS revisions");
  assert(revisionBody?.page === "home" && Array.isArray(revisionBody?.revisions), "CMS revisions response contract is invalid.");
  console.log(`PASS: Read-only home revision listing (${revisionBody.revisions.length} records).`);
} finally {
  if (loggedIn && cookie) {
    const logout = await fetch(new URL("/api/admin/logout", baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: { cookie },
    });
    assert(logout.status === 200, `Preview admin logout failed with HTTP ${logout.status}`);
    const logoutBody = await readJson(logout, "Admin logout");
    assert(logoutBody?.ok === true, "Admin logout response contract is invalid.");
    const after = await fetch(new URL("/api/admin/session", baseUrl), {
      redirect: "manual",
      headers: { cookie },
    });
    assert(after.status === 401, `Session remained valid after logout (HTTP ${after.status}).`);
    console.log("PASS: Logout invalidated the Preview admin session.");
  }
}

console.log("Preview Admin/CMS E2E passed. No CMS content, projects, media, or customer records were changed.");
