import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

type RecordRow = {
  project_id: string;
  preview_url: string;
  original_key: string | null;
  cover_image_url: string;
};

type Statement = {
  query: string;
  values: unknown[];
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
};

const projectId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const key = `projects/${projectId}/${mediaId}.jpg`;
const previewUrl = `https://raw.githubusercontent.com/prem-pk-dev/PHOTOGRAPHY-MEDIA/commit-sha/${key}`;

function deleteRequest(body: unknown = { id: mediaId }) {
  return new Request("https://example.test/api/admin/projects/media/delete", {
    method: "POST",
    headers: {
      cookie: "__Host-gf_admin=unit-test-session",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeDb(options: {
  role?: "owner" | "editor" | null;
  record?: RecordRow | null;
  batchChanges?: number;
} = {}) {
  const batches: Array<Array<{ query: string; values: unknown[] }>> = [];
  const statements: Array<{ query: string; values: unknown[] }> = [];
  const row = options.record === undefined
    ? {
        project_id: projectId,
        preview_url: previewUrl,
        original_key: key,
        cover_image_url: "https://example.test/other-cover.jpg",
      }
    : options.record;

  return {
    batches,
    statements,
    prepare(query: string): Statement {
      const statement = {
        query,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return options.role === null
              ? null
              : { id: "admin-1", email: "owner@example.test", role: options.role ?? "owner" } as T;
          }
          if (query.includes("SELECT m.project_id, m.preview_url, m.original_key, p.cover_image_url")) {
            return row as T | null;
          }
          return null;
        },
      };
      return statement;
    },
    async batch(batchStatements: Statement[]) {
      const recorded = batchStatements.map(statement => ({
        query: statement.query,
        values: [...statement.values],
      }));
      batches.push(recorded);
      statements.push(...recorded);
      const changes = options.batchChanges ?? 1;
      return recorded.map(() => ({ success: true, meta: { changes } }));
    },
  };
}

const token = "unit-test-github-token";

test("permanent media deletion rejects unauthenticated and editor requests before GitHub access", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return new Response("unexpected", { status: 500 });
  };
  try {
    const unauthenticatedDb = makeDb({ role: null });
    const unauthenticated = await worker.fetch(deleteRequest(), {
      DB: unauthenticatedDb,
      MEDIA_GITHUB_TOKEN: token,
    });
    assert.equal(unauthenticated.status, 401);

    const editorDb = makeDb({ role: "editor" });
    const forbidden = await worker.fetch(deleteRequest(), {
      DB: editorDb,
      MEDIA_GITHUB_TOKEN: token,
    });
    assert.equal(forbidden.status, 403);
    assert.equal(externalCalls, 0);
    assert.equal(unauthenticatedDb.batches.length, 0);
    assert.equal(editorDb.batches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion validates the media ID before reading or deleting anything", async () => {
  const db = makeDb();
  const response = await worker.fetch(deleteRequest({ id: "../untrusted/path" }), {
    DB: db,
    MEDIA_GITHUB_TOKEN: token,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "validation_failed" });
  assert.equal(db.batches.length, 0);
});

test("permanent media deletion protects the current cover and unmanaged legacy media", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return new Response("unexpected", { status: 500 });
  };
  try {
    const coverDb = makeDb({
      record: {
        project_id: projectId,
        preview_url: previewUrl,
        original_key: key,
        cover_image_url: previewUrl,
      },
    });
    const cover = await worker.fetch(deleteRequest(), {
      DB: coverDb,
      MEDIA_GITHUB_TOKEN: token,
    });
    assert.equal(cover.status, 409);
    assert.deepEqual(await cover.json(), { error: "replace_cover_before_deleting" });

    const legacyDb = makeDb({
      record: {
        project_id: projectId,
        preview_url: "https://media-assets.example.test/legacy.jpg",
        original_key: null,
        cover_image_url: "https://example.test/other-cover.jpg",
      },
    });
    const legacy = await worker.fetch(deleteRequest(), {
      DB: legacyDb,
      MEDIA_GITHUB_TOKEN: token,
    });
    assert.equal(legacy.status, 409);
    assert.deepEqual(await legacy.json(), { error: "media_repository_file_not_managed" });

    assert.equal(externalCalls, 0);
    assert.equal(coverDb.batches.length, 0);
    assert.equal(legacyDb.batches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion removes the exact repository object before D1 metadata and audit", async () => {
  const originalFetch = globalThis.fetch;
  const db = makeDb();
  const calls: Array<{ url: string; method: string; authorization: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({
      url: String(input),
      method,
      authorization: headers.get("authorization") ?? "",
      body,
    });
    if (method === "GET") {
      return new Response(JSON.stringify({ sha: "remote-blob-sha" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ commit: { sha: "delete-commit-sha" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await worker.fetch(deleteRequest(), {
      DB: db,
      MEDIA_GITHUB_TOKEN: token,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      id: mediaId,
      deletedFromRepository: true,
    });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url === `https://api.github.com/repos/prem-pk-dev/PHOTOGRAPHY-MEDIA/contents/${key}`));
    assert.ok(calls.every(call => call.authorization === `Bearer ${token}`));
    assert.deepEqual(calls.map(call => call.method), ["GET", "DELETE"]);
    assert.deepEqual(calls[1].body, {
      message: `Permanently delete portfolio media ${mediaId}`,
      sha: "remote-blob-sha",
      branch: "main",
    });
    assert.equal(db.batches.length, 1);
    assert.equal(db.batches[0].length, 2);
    assert.match(db.batches[0][0].query, /DELETE FROM project_media WHERE id = \? AND NOT EXISTS/);
    assert.deepEqual(db.batches[0][0].values, [mediaId, projectId, previewUrl]);
    assert.match(db.batches[0][1].query, /media_permanently_deleted/);
    assert.deepEqual(db.batches[0][1].values.slice(1), ["admin-1", mediaId]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion completes D1 cleanup when GitHub already returns 404", async () => {
  const originalFetch = globalThis.fetch;
  const db = makeDb();
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await worker.fetch(deleteRequest(), {
      DB: db,
      MEDIA_GITHUB_TOKEN: token,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      id: mediaId,
      deletedFromRepository: true,
    });
    assert.deepEqual(methods, ["GET"]);
    assert.equal(db.batches.length, 1);
    assert.match(db.batches[0][0].query, /DELETE FROM project_media/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion leaves D1 untouched when GitHub lookup or deletion fails", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const scenario of [
      { name: "lookup", status: 403, expected: "media_repository_lookup_failed", methods: ["GET"] },
      { name: "delete", status: 500, expected: "media_repository_delete_failed", methods: ["GET", "DELETE"] },
    ]) {
      const db = makeDb();
      const methods: string[] = [];
      globalThis.fetch = async (_input, init) => {
        const method = init?.method ?? "GET";
        methods.push(method);
        if (scenario.name === "delete" && method === "GET") {
          return new Response(JSON.stringify({ sha: "remote-blob-sha" }), { status: 200 });
        }
        return new Response("GitHub unavailable", { status: scenario.status });
      };

      const response = await worker.fetch(deleteRequest(), {
        DB: db,
        MEDIA_GITHUB_TOKEN: token,
      });
      assert.equal(response.status, 503, scenario.name);
      assert.deepEqual(await response.json(), { error: scenario.expected, githubStatus: scenario.status });
      assert.deepEqual(methods, scenario.methods);
      assert.equal(db.batches.length, 0, scenario.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
