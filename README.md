# dsh-ustc-image

一个 **极简** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：
只注册 **一个** 工具 `generate_image`，背后是 USTC（中国科学技术大学）模型网关上的
`qwen-image-2.1`。

没有 provider 列表、没有设置页、没有多模型路由——就是"一句话出图"。

## 它做什么

- 参数：`prompt`（必填）、`size`（`1024x1024` / `512x512` / `768x1024`，默认 1024²）
- 调用 `POST https://api.llm.ustc.edu.cn/v1/images/generations`，模型 `qwen-image-2.1`
- 强制 `response_format: "b64_json"`（该网关返回的 `data[0].url` 下载会 404，只能走 base64）
- 图片存到 `<会话 cwd>/assets/images/ustc/qwen-image-<时间戳>.png`
- 通过 `ctx.get('attachments').saveImage()` 回传，在对话里内嵌显示

## 前置条件

1. 一个能访问 USTC 网关的 API key。
2. key 要放在 DSH 凭据文件的 `refs` 段里，键名 **`USTC_API_KEY`**：

   ```yaml
   # ~/.dsh/.credentials.yaml
   refs:
     USTC_API_KEY: <your-key>
   ```

   插件启动不读环境变量，每次调用时从该文件现读（改 key 不用重启）。

3. 网关必须已经开放 `qwen-image-2.1`（`GET /v1/models` 能查到）。

## 安装

从 GitHub 直接装（需要 pnpm 能解析 git 依赖）：

```bash
dsh plugin --profile desktop add github:AsterionZephyr/dsh-ustc-image
```

或者本地开发链接：

```bash
dsh plugin --profile desktop add /path/to/dsh-ustc-image
```

装完 **重启 DSH** 生效（插件只在启动时挂载）。

## 已验证的行为

| 项 | 结果 |
| --- | --- |
| `1024x1024` | 200，约 1.3–4.6 s，PNG ≈1.9 MB |
| `512x512` | 200，<1 s |
| `768x1024` | 200，约 38 s |
| `n=2`（同一请求两张） | 200，约 4.5 s |
| `1280x720` | 500 InternalServerError —— 该网关的非方形大尺寸不可用，故未开放 |

## 卸载

```bash
dsh plugin --profile desktop remove dsh-ustc-image
```

## License

MIT
