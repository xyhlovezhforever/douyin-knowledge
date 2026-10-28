# 视评台

视评台把视频元数据、转写、摘要与评论信号整理成统一报告。当前 MVP 已直接接入开源 `youtubei.js` 和微信视频号公开元数据接口，并为 MediaCrawler 与 video-fetch-yjf 提供标准 HTTP 连接器。

## 本地启动

```powershell
npm install
npm run setup:integrations
npm run dev
```

打开 `http://127.0.0.1:5173`。API 默认运行在 `http://127.0.0.1:8787`。

当前仓库的 `npm run dev` 会同时启动 Web、主 API、本地统一连接器和 MediaCrawler API。首次安装运行 `npm run setup:integrations`，脚本会初始化两个 Git submodule、安装隔离依赖、配置 MediaCrawler 自动启动 Chrome，并创建本地 `.env`。

从 GitHub 克隆时也可以直接初始化子模块：

```powershell
git clone --recurse-submodules https://github.com/xyhlovezhforever/video_link_text.git
cd video_link_text
npm install
npm run setup:integrations
npm run dev
```

## 当前能力

- 自动识别 YouTube、B站、抖音、小红书、TikTok 与微信视频号链接
- YouTube 元数据、公开字幕和热门评论提取
- 无模型密钥的抽取式摘要与主题提取
- 评论价值评分：问题、经验、纠错、资源与讨论
- 转写搜索、评论类型筛选、来源追溯
- MediaCrawler 和 video-fetch-yjf 外部连接器状态检查
- 视频号优先使用 video-fetch-yjf，外部连接器不可用时自动回退到公开元数据
- B站、抖音和小红书会先尝试 video-fetch-yjf，再自动回退到 MediaCrawler
- TikTok 通过 video-fetch-yjf 获取公开元数据
- 小红书图文笔记在没有视频轨时自动回退到公开 SSR 元数据
- 本地示例报告，可在目标平台网络不可达时验收界面

YouTube 的公开接口会受地区、网络与视频权限影响。字幕或评论不可用时，报告会保留其余结果并显示具体警告。视频号公开网页可以提供文案、作者、封面与互动数，但不提供音视频流和评论正文，因此公开回退报告不会生成转写或高价值评论。失效、私密或仅限微信内查看的链接会返回明确提示。

抖音和小红书的评论接口通常需要登录态。首次触发 MediaCrawler 时会打开平台登录页；完成扫码后登录状态会保存在本机项目环境中。应用不会绕过登录、验证码或内容权限。

## 连接 MediaCrawler 或 video-fetch-yjf

复制 `.env.example` 为 `.env`，配置任意一个连接器地址：

```dotenv
MEDIACRAWLER_CONNECTOR_URL=http://127.0.0.1:8901/analyze
VIDEO_FETCH_CONNECTOR_URL=http://127.0.0.1:8902/analyze
```

仓库内置桥接服务时使用：

```dotenv
MEDIACRAWLER_API_URL=http://127.0.0.1:8901/api
MEDIACRAWLER_CONNECTOR_URL=http://127.0.0.1:8902/mediacrawler/analyze
VIDEO_FETCH_CONNECTOR_URL=http://127.0.0.1:8902/video-fetch/analyze
```

连接器接收：

```json
{
  "url": "https://www.bilibili.com/video/BV...",
  "platform": "bilibili"
}
```

连接器需要直接返回 `VideoReport`，或返回 `{ "report": VideoReport }`。核心字段如下：

```ts
type VideoReport = {
  id: string;
  sourceUrl: string;
  platform: 'youtube' | 'bilibili' | 'douyin' | 'xiaohongshu' | 'tiktok' | 'wechat_channels' | 'unknown';
  connector: string;
  title: string;
  author: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  transcript: Array<{ startMs: number; endMs: number; text: string }>;
  comments: Array<{
    id: string;
    author: string;
    text: string;
    likes: number;
    replies: number;
    score: number;
    signal: 'question' | 'experience' | 'correction' | 'resource' | 'discussion';
    reasons: string[];
  }>;
  totals: { transcriptSegments: number; commentsFetched: number; commentsRanked: number };
  warnings: string[];
  analyzedAt: string;
};
```

完整定义位于 `shared/types.ts`。连接器地址由服务端环境变量固定，用户输入不会被当作请求地址，因此不会形成任意 URL 代理。

## 验证

```powershell
npm test
npm run build
```

## 合规边界

只处理有权访问的公开内容。MediaCrawler 等工具需要遵守目标平台的服务条款、著作权规则、访问频率限制与适用法律，不应被用于大规模采集或规避访问控制。
