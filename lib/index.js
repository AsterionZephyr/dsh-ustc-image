// dsh-ustc-image — 一个 30 行的最小插件：把 USTC 网关的 qwen-image-2.1 暴露成 generate_image 工具。
// 设计目标：没有 provider 概念、没有设置页、只有一个工具。
import { defineTool } from '@deepseek-ai/dsh-tools'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ENDPOINT = 'https://api.llm.ustc.edu.cn/v1/images/generations'
const MODEL = 'qwen-image-2.1'
const SIZES = ['1024x1024', '512x512', '768x1024']

/** 从 DSH 凭据文件里读 USTC_API_KEY（明文存于 refs 段）。 */
function readApiKey() {
  const p = path.join(os.homedir(), '.dsh', '.credentials.yaml')
  const text = fs.readFileSync(p, 'utf8')
  const m = text.match(/^\s*USTC_API_KEY:\s*(\S+)\s*$/m)
  if (!m) throw new Error('未在 ' + p + ' 找到 USTC_API_KEY')
  return m[1]
}

/** 从 PNG 的 IHDR 读宽高；非 PNG 返回 null。 */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

export const name = 'ustc-image'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'generate_image',
    description: 'Generates a brand-new image with qwen-image-2.1 on the USTC gateway. '
      + 'Call it whenever the user asks to draw, paint, or generate a picture. '
      + 'The image is saved to the workspace and shown to the user.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'What to draw. Be specific about subject, style, lighting.' },
      size: { type: 'string', enum: SIZES, description: 'Output size; default 1024x1024. Only these square/portrait sizes work on this gateway.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          bytes: { type: 'number', required: true },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          image: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true },
              mediaType: { type: 'string', required: true },
              bytes: { type: 'number', required: true },
              width: { type: 'number', required: true },
              height: { type: 'number', required: true },
              name: { type: 'string' },
            },
          },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: '已用 qwen-image-2.1 生成图片：' + value.path
          + '（' + value.width + '×' + value.height + '，' + Math.round(value.bytes / 1024) + ' KB）',
      }, { type: 'image', attachment: value.image }],
    },
    timeoutMs: 300000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const size = args.size ?? '1024x1024'
      const key = readApiKey()
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: MODEL, prompt: args.prompt, n: 1, size, response_format: 'b64_json' }),
        signal: exec.signal,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = json?.error?.message ?? JSON.stringify(json).slice(0, 300)
        throw new Error('生图网关返回 HTTP ' + res.status + '：' + detail)
      }
      const item = json?.data?.[0]
      if (!item?.b64_json) throw new Error('网关没有返回 b64_json；拿到的是：' + JSON.stringify(json).slice(0, 300))
      const buf = Buffer.from(item.b64_json, 'base64')
      const dim = pngSize(buf) ?? { width: 0, height: 0 }

      const cwd = exec.agent?.session?.header?.cwd ?? process.cwd()
      const dir = path.join(cwd, 'assets', 'images', 'ustc')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'qwen-image-' + Date.now().toString(36) + '.png')
      fs.writeFileSync(file, buf)

      let image = { attachmentId: '', mediaType: 'image/png', bytes: buf.length, width: dim.width, height: dim.height }
      const attachments = ctx.get('attachments')
      if (!attachments?.saveImage) throw new Error('attachments 服务不可用，无法把图片交回会话')
      {
        const saved = await attachments.saveImage({ data: buf, mediaType: 'image/png', name: path.basename(file) })
        image = {
          attachmentId: String(saved.attachmentId ?? ''),
          mediaType: saved.mediaType ?? 'image/png',
          bytes: saved.bytes ?? buf.length,
          width: saved.width ?? dim.width,
          height: saved.height ?? dim.height,
          name: path.basename(file),
        }
        if (!image.attachmentId) throw new Error('附件存储没有返回 attachmentId，无法把图片交给模型')
      }
      return { path: file, bytes: buf.length, width: dim.width, height: dim.height, image }
    },
  }))
}
