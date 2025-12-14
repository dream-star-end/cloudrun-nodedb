# cloudrun-nodedb

CloudBase 云托管 DB 子服务（Node.js），使用 `@cloudbase/node-sdk` 访问云开发/CloudBase 文档型数据库。

## 需要的环境变量

- `TCB_ENV`: CloudBase 环境 ID（例如：`cloud1-9g0y2l6r59f1978b`）
- （可选）`CLOUDBASE_REGION`: 默认 `ap-shanghai`

## 提供的接口

- `GET /health`
- `POST /db/query`
- `POST /db/get_one`
- `POST /db/add`
- `POST /db/update`
- `POST /db/update_by_id`
- `POST /db/delete`
- `POST /db/delete_by_id`

## 与 Python 主服务对接

在 Python 主服务设置：

- `DB_PROXY_URL=http://<cloudrun-nodedb 的内网域名>`