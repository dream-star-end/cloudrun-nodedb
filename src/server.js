const express = require("express");
const cors = require("cors");
const { getDb, getEnvId, getRegion } = require("./cloudbase");

const app = express();
app.disable("x-powered-by");

// CORS（默认允许所有，云托管内网调用时也不影响）
const corsOrigins = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins.includes("*") ? true : corsOrigins }));

app.use(express.json({ limit: "1mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const bodyStr = JSON.stringify(req.body || {});
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} body=${bodyStr.substring(0, 200)}`);
  next();
});

function ok(res, data) {
  return res.json({ success: true, data });
}
function fail(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

app.get("/health", (req, res) => ok(res, { status: "healthy", env: getEnvId(), region: getRegion() }));

// ---------------- DB APIs ----------------
// 注意：这些接口只建议内网访问（Python 主服务调用），不要暴露到公网。

app.post("/db/get_one", async (req, res) => {
  try {
    const { collection, where } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");
    const db = getDb();
    const r = await db.collection(collection).where(where).limit(1).get();
    return ok(res, r?.data?.[0] || null);
  } catch (e) {
    return fail(res, 500, "db/get_one 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/query", async (req, res) => {
  try {
    const { collection, where, limit = 100, orderBy, order = "asc", skip = 0 } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");
    const db = getDb();
    let q = db.collection(collection).where(where);
    if (orderBy) q = q.orderBy(orderBy, order);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);
    const r = await q.get();
    return ok(res, r?.data || []);
  } catch (e) {
    return fail(res, 500, "db/query 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/add", async (req, res) => {
  try {
    const { collection, data } = req.body || {};
    if (!collection || !data) return fail(res, 400, "缺少 collection/data");
    const db = getDb();
    const r = await db.collection(collection).add(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, "db/add 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/update", async (req, res) => {
  try {
    const { collection, where, data } = req.body || {};
    if (!collection || !where || !data) return fail(res, 400, "缺少 collection/where/data");
    const db = getDb();
    const r = await db.collection(collection).where(where).update(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, "db/update 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/update_by_id", async (req, res) => {
  try {
    const { collection, doc_id, data } = req.body || {};
    if (!collection || !doc_id || !data) return fail(res, 400, "缺少 collection/doc_id/data");
    const db = getDb();
    const r = await db.collection(collection).doc(doc_id).update(data);
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, "db/update_by_id 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/delete", async (req, res) => {
  try {
    const { collection, where } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");
    const db = getDb();
    const r = await db.collection(collection).where(where).remove();
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, "db/delete 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/delete_by_id", async (req, res) => {
  try {
    const { collection, doc_id } = req.body || {};
    if (!collection || !doc_id) return fail(res, 400, "缺少 collection/doc_id");
    const db = getDb();
    const r = await db.collection(collection).doc(doc_id).remove();
    return ok(res, r);
  } catch (e) {
    return fail(res, 500, "db/delete_by_id 失败", { error: String(e?.message || e) });
  }
});

const port = Number(process.env.PORT || 80);
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudrun-nodedb] listening on :${port}, env=${process.env.TCB_ENV || ""}`);
});


