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

// 对顶层的嵌套普通对象使用 cmd.set() 包装，避免 CloudBase 将其展开为点号路径
// 这解决了 "Cannot create field 'xxx' in element {field: null}" 的问题
// 只处理顶层字段，且只处理普通对象（非 Date、非数组、非 command 表达式）
function wrapNestedObjectsWithSet(data, cmd) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  const result = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    // 跳过 null/undefined、原始类型、Date、数组
    if (val === null || val === undefined || typeof val !== "object" || val instanceof Date || Array.isArray(val)) {
      result[key] = val;
      continue;
    }
    // 跳过已经是 command 表达式的值（有 _setType 或其他内部标记）
    if (val._setType || val._actions || val._callFunction) {
      result[key] = val;
      continue;
    }
    // 跳过带有 $date 等特殊结构（已被 processQuery 处理为 Date）
    // 跳过点号路径字段（如 "unreadCount.xxx"）
    if (key.includes(".")) {
      result[key] = val;
      continue;
    }
    // 对于普通嵌套对象，使用 set() 命令确保整体替换
    result[key] = cmd.set(val);
  }
  return result;
}

app.get("/health", (req, res) => ok(res, { status: "healthy", env: getEnvId(), region: getRegion() }));

// ---------------- DB APIs ----------------
// 注意：这些接口只建议内网访问（Python 主服务调用），不要暴露到公网。

// 递归处理查询条件：
// - 将 {"$date": "..."} 转为 new Date(...)
// - 将 Mongo 风格比较操作符（$gte/$gt/$lte/$lt/$in/$nin/$ne）转换为 cloudbase db.command 表达式
// - 将 $or/$and 逻辑操作符转换为 cloudbase db.command 表达式
function processQuery(obj, cmd) {
  if (Array.isArray(obj)) {
    return obj.map((v) => processQuery(v, cmd));
  } else if (obj && typeof obj === "object") {
    // 检查是否是 {"$date": "..."} 结构
    if (Object.keys(obj).length === 1 && obj["$date"] && typeof obj["$date"] === "string") {
      return new Date(obj["$date"]);
    }

    // 处理 $or 逻辑操作符：{ "$or": [{...}, {...}] }
    // CloudBase SDK 中 $or 需要使用 cmd.or([...]) 并且需要放在 where 的顶层
    if (obj["$or"] && Array.isArray(obj["$or"]) && cmd) {
      const orConditions = obj["$or"].map((cond) => processQuery(cond, cmd));
      // 如果只有 $or 一个 key，直接返回 cmd.or(...)
      if (Object.keys(obj).length === 1) {
        return cmd.or(orConditions);
      }
      // 如果有其他字段，需要合并（这种情况比较复杂，一般不推荐）
      const newObj = { ...processQuery({ ...obj, $or: undefined }, cmd) };
      delete newObj.$or;
      // 把 $or 条件放进去（CloudBase 可能不支持这种混合方式，但尽力处理）
      return cmd.and([newObj, cmd.or(orConditions)]);
    }

    // 处理 $and 逻辑操作符：{ "$and": [{...}, {...}] }
    if (obj["$and"] && Array.isArray(obj["$and"]) && cmd) {
      const andConditions = obj["$and"].map((cond) => processQuery(cond, cmd));
      if (Object.keys(obj).length === 1) {
        return cmd.and(andConditions);
      }
      const newObj = { ...processQuery({ ...obj, $and: undefined }, cmd) };
      delete newObj.$and;
      return cmd.and([newObj, ...andConditions]);
    }

    // 处理类似 { "$gte": ..., "$lt": ... } 的操作符对象
    const keys = Object.keys(obj);
    const isOpObject = keys.length > 0 && keys.every((k) => k.startsWith("$"));
    if (isOpObject && cmd) {
      const opMap = {
        $gte: (v) => cmd.gte(v),
        $gt: (v) => cmd.gt(v),
        $lte: (v) => cmd.lte(v),
        $lt: (v) => cmd.lt(v),
        $in: (v) => cmd.in(v),
        $nin: (v) => cmd.nin(v),
        $ne: (v) => cmd.neq(v),
        // 数组字段包含匹配：tags: { "$all": ["标签"] }
        $all: (v) => cmd.all(v),
      };

      let expr = null;
      for (const k of keys) {
        const fn = opMap[k];
        if (!fn) continue;
        const val = processQuery(obj[k], cmd);
        const part = fn(val);
        expr = expr ? expr.and(part) : part;
      }
      if (expr) return expr;
    }

    // 递归处理对象的每个值
    const newObj = {};
    for (const key in obj) {
      newObj[key] = processQuery(obj[key], cmd);
    }
    return newObj;
  }
  return obj;
}

app.post("/db/get_one", async (req, res) => {
  try {
    var { collection, where } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");

    const db = getDb();
    where = processQuery(where, db.command); // 处理日期对象/比较操作符
    const doc = await db.collection(collection).where(where).limit(1).get();
    return ok(res, doc?.data?.[0] || null);
  } catch (e) {
    return fail(res, 500, "db/get_one 失败", { error: String(e?.message || e) });
  }
});

// 根据文档 ID 获取文档（使用 .doc() 方法，比 where 查 _id 更可靠）
app.post("/db/get_by_id", async (req, res) => {
  try {
    const { collection, doc_id } = req.body || {};
    if (!collection || !doc_id) return fail(res, 400, "缺少 collection/doc_id");

    const db = getDb();
    const doc = await db.collection(collection).doc(doc_id).get();
    return ok(res, doc?.data?.[0] || null);
  } catch (e) {
    // CloudBase SDK 在文档不存在时可能抛出错误，返回 null
    if (e?.message?.includes("not exist") || e?.errCode === -502005) {
      return ok(res, null);
    }
    return fail(res, 500, "db/get_by_id 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/query", async (req, res) => {
  try {
    var { collection, where, limit = 100, orderBy, order = "asc", skip = 0 } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");

    const db = getDb();
    where = processQuery(where, db.command); // 处理日期对象/比较操作符
    let q = db.collection(collection).where(where);
    if (orderBy) q = q.orderBy(orderBy, order);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);
    const list = await q.get();
    return ok(res, list?.data || []);
  } catch (e) {
    return fail(res, 500, "db/query 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/add", async (req, res) => {
  try {
    var { collection, data } = req.body || {};
    if (!collection || !data) return fail(res, 400, "缺少 collection/data");
    const db = getDb();
    // Normalize payload: {"$date":"..."} -> Date
    data = processQuery(data, db.command);
    // @cloudbase/node-sdk: add() 直接接受数据对象，不需要 { data: ... } 包装
    // 错误用法: add({ data }) 会导致数据被嵌套在 data 字段下
    // 正确用法: add(data) 直接存储字段到文档顶层
    const addRes = await db.collection(collection).add(data);
    console.log(`[db/add] collection=${collection}, result:`, JSON.stringify(addRes));
    return ok(res, addRes);
  } catch (e) {
    return fail(res, 500, "db/add 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/update", async (req, res) => {
  try {
    var { collection, where, data } = req.body || {};
    if (!collection || !where || !data) return fail(res, 400, "缺少 collection/where/data");
    const db = getDb();
    // Normalize where/data: date objects and operator expressions
    where = processQuery(where, db.command);
    data = processQuery(data, db.command);
    // @cloudbase/node-sdk: update() 直接接受数据对象
    const updRes = await db.collection(collection).where(where).update(data);
    return ok(res, updRes);
  } catch (e) {
    return fail(res, 500, "db/update 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/update_by_id", async (req, res) => {
  try {
    var { collection, doc_id, data } = req.body || {};
    if (!collection || !doc_id || !data) return fail(res, 400, "缺少 collection/doc_id/data");
    const db = getDb();
    const cmd = db.command;
    data = processQuery(data, cmd);
    // 对于嵌套对象字段，使用 set() 命令确保整体替换而非深度合并
    // 避免 "Cannot create field 'xxx' in element {field: null}" 错误
    data = wrapNestedObjectsWithSet(data, cmd);
    // @cloudbase/node-sdk: update() 直接接受数据对象
    const updIdRes = await db.collection(collection).doc(doc_id).update(data);
    return ok(res, updIdRes);
  } catch (e) {
    return fail(res, 500, "db/update_by_id 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/delete", async (req, res) => {
  try {
    var { collection, where } = req.body || {};
    if (!collection || !where) return fail(res, 400, "缺少 collection/where");
    const db = getDb();
    where = processQuery(where, db.command);
    const delRes = await db.collection(collection).where(where).remove();
    return ok(res, delRes);
  } catch (e) {
    return fail(res, 500, "db/delete 失败", { error: String(e?.message || e) });
  }
});

app.post("/db/delete_by_id", async (req, res) => {
  try {
    const { collection, doc_id } = req.body || {};
    if (!collection || !doc_id) return fail(res, 400, "缺少 collection/doc_id");
    const db = getDb();
    const delIdRes = await db.collection(collection).doc(doc_id).remove();
    return ok(res, delIdRes);
  } catch (e) {
    return fail(res, 500, "db/delete_by_id 失败", { error: String(e?.message || e) });
  }
});

const port = Number(process.env.PORT || 80);
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudrun-nodedb] listening on :${port}, env=${process.env.TCB_ENV || ""}`);
});

module.exports = app;
