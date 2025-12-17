const cloudbase = require("@cloudbase/node-sdk");

function getEnvId() {
  const env = process.env.TCB_ENV || process.env.CLOUDBASE_ENV || "";
  if (!env) {
    throw new Error("未配置 TCB_ENV（CloudBase 环境 ID），例如 cloud1-xxxxxxxxxxxxxxxx");
  }
  return env;
}

function getRegion() {
  return process.env.CLOUDBASE_REGION || process.env.TENCENTCLOUD_REGION || "ap-shanghai";
}

function initApp(context = null) {
  return cloudbase.init({
    env: getEnvId(),
    region: getRegion(),
    context: context || undefined,
  });
}

function getDb(context = null) {
  return initApp(context).database();
}

module.exports = { getEnvId, getRegion, initApp, getDb };


