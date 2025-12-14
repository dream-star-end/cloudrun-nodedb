const cloudbase = require("@cloudbase/node-sdk");

function getEnvId() {
  const env = process.env.TCB_ENV || process.env.CLOUDBASE_ENV || "";
  if (!env) throw new Error("未配置 TCB_ENV（CloudBase 环境ID），例如 cloud1-xxxxxxxxxxxxxxxx");
  return env;
}

function getRegion() {
  return process.env.CLOUDBASE_REGION || process.env.TENCENTCLOUD_REGION || "ap-shanghai";
}

function getDb(context = null) {
  const app = cloudbase.init({
    env: getEnvId(),
    region: getRegion(),
    context: context || undefined,
  });
  return app.database();
}

module.exports = { getDb, getEnvId, getRegion };


