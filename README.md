# cloudrun-nodedb

CloudBase 云托管 DB 子服务（Node.js + `@cloudbase/node-sdk`），用于给 **Python 主服务**提供稳定的文档型数据库访问能力（避免走 `api.weixin.qq.com/tcb/*` 的 HTTP API）。

## 需要的环境变量

- **TCB_ENV**: CloudBase 环境 ID（例如 `cloud1-9g0y2l6r59f1978b`）
- **CLOUDBASE_REGION**: 可选，默认 `ap-shanghai`

## 提供的接口（内网调用）

- `GET /health`
- `POST /db/get_one` `{ collection, where }`
- `POST /db/query` `{ collection, where, limit?, skip?, orderBy?, order? }`
- `POST /db/add` `{ collection, data }`
- `POST /db/update` `{ collection, where, data }`
- `POST /db/update_by_id` `{ collection, doc_id, data }`
- `POST /db/delete` `{ collection, where }`
- `POST /db/delete_by_id` `{ collection, doc_id }`

## 本地启动（可选）

```bash
npm install
TCB_ENV=cloud1-xxxxxxxxxxxxxxxx npm run dev
```

> 注意：该服务建议只开 **内网访问**，由 Python 主服务通过 `DB_PROXY_URL` 调用。