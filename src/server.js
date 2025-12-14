const express = require("express");
const cors = require("cors");
const { getDb, getEnvId } = require("./cloudbase");

function getPort() {
  const raw = process.env.PORT || "80";
  const p = Number.parseInt(raw, 10);
  return Number.isFinite(p) ? p : 80;
}

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, error: message, ...extra });
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "*", credentials: true }));

app.get("/health", (_req, res) => ok(res, { status: "healthy" }));
app.get("/", (_req, res) => ok(res, { service: "cloudrun-nodedb", env: process.env.TCB_ENV || "" }));

// POST /db/query { collection, where, limit, skip, order_by, order_type }
app.post("/db/query", async (req, res) => {
  try {
    const { collection, where = {}, limit = 100, skip = 0, order_by = null, order_type = "desc" } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    const db = getDb();
    let q = db.collection(collection).where(where);
    if (order_by) q = q.orderBy(order_by, order_type);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);
    const r = await q.get();
    return ok(res, r?.data || []);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/get_one { collection, where }
app.post("/db/get_one", async (req, res) => {
  try {
    const { collection, where = {} } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    const db = getDb();
    const r = await db.collection(collection).where(where).limit(1).get();
    return ok(res, (r?.data && r.data[0]) || null);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/add { collection, data }
app.post("/db/add", async (req, res) => {
  try {
    const { collection, data } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    if (!data || typeof data !== "object") return fail(res, 400, "缺少 data");
    const db = getDb();
    const r = await db.collection(collection).add(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/update { collection, where, data }
app.post("/db/update", async (req, res) => {
  try {
    const { collection, where = {}, data } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    if (!data || typeof data !== "object") return fail(res, 400, "缺少 data");
    const db = getDb();
    const r = await db.collection(collection).where(where).update(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/update_by_id { collection, doc_id, data }
app.post("/db/update_by_id", async (req, res) => {
  try {
    const { collection, doc_id, data } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    if (!doc_id) return fail(res, 400, "缺少 doc_id");
    if (!data || typeof data !== "object") return fail(res, 400, "缺少 data");
    const db = getDb();
    const r = await db.collection(collection).doc(doc_id).update(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/delete { collection, where }
app.post("/db/delete", async (req, res) => {
  try {
    const { collection, where = {} } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    const db = getDb();
    const r = await db.collection(collection).where(where).remove();
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

// POST /db/delete_by_id { collection, doc_id }
app.post("/db/delete_by_id", async (req, res) => {
  try {
    const { collection, doc_id } = req.body || {};
    if (!collection) return fail(res, 400, "缺少 collection");
    if (!doc_id) return fail(res, 400, "缺少 doc_id");
    const db = getDb();
    const r = await db.collection(collection).doc(doc_id).remove();
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, String(e?.message || e));
  }
});

const port = getPort();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudrun-nodedb] listening :${port}, env=${getEnvId()}`);
});


