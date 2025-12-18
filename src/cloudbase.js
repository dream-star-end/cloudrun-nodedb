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
  const config = {
    env: getEnvId(),
    region: getRegion(),
    context: context || undefined,
  };

  // 尝试从环境变量读取密钥（如果在云托管免鉴权失败或本地运行时需要）
  // 增加 trim() 防止复制粘贴时带入空格
  const secretId = (process.env.TENCENT_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || "").trim();
  const secretKey = (process.env.TENCENT_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || "").trim();
  const token = (process.env.TENCENT_TOKEN || process.env.TENCENTCLOUD_SESSIONTOKEN || "").trim();

  if (secretId && secretKey) {
    config.secretId = secretId;
    config.secretKey = secretKey;
    if (token) config.token = token;
  }

  // Debug log to check credentials
  console.log("Init CloudBase:", {
    env: config.env,
    hasSecretId: !!config.secretId,
    sidPrefix: config.secretId ? config.secretId.substring(0, 4) + "***" : "N/A",
    hasSecretKey: !!config.secretKey,
  });

  return cloudbase.init(config);
}

function getDb(context = null) {
  return initApp(context).database();
}

module.exports = { getEnvId, getRegion, initApp, getDb };


