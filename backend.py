from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from openai import OpenAI
import asyncio

# 初始化FastAPI应用
app = FastAPI(title="LLM根因分析后端", version="1.0")

# 配置CORS跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 兼容所有版本的请求体大小限制中间件
MAX_REQUEST_SIZE = 100 * 1024 * 1024  # 100MB

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/llm/analyze":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            raise HTTPException(status_code=413, detail="请求体过大，最大支持100MB")
    return await call_next(request)

# 初始化DeepSeek客户端
client = OpenAI(
    api_key="sk-968a3ba3662d4502ab663ddb5c1f1706",
    base_url="https://api.deepseek.com"
)

# 定义请求体模型
class AnalyzeRequest(BaseModel):
    prompt: str
    stream: bool = True

# 根因分析系统提示词
SYSTEM_PROMPT = """
你是一位专业的网络运维专家，擅长根因定位与故障分析。
请根据用户提供的告警信息、系统日志、性能指标等数据，进行以下分析：
1. 问题概述：简要描述检测到的异常
2. 根因定位：详细分析故障的根本原因
3. 影响范围：说明故障可能影响的服务和业务
4. 修复建议：给出具体、可执行的修复步骤
5. 预防措施：提出避免类似故障再次发生的建议

请使用Markdown格式输出，语言简洁专业，重点突出。
"""

# 流式输出生成器
def generate_stream(prompt: str):
    try:
        stream = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            stream=True,
            temperature=0.3,
            max_tokens=4096
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                yield chunk.choices[0].delta.content
                
    except Exception as e:
        yield f"\n\n**API调用错误：** {str(e)}"

# 核心分析接口
@app.post("/api/llm/analyze")
async def analyze_root_cause(request: AnalyzeRequest):
    if request.stream:
        return StreamingResponse(
            generate_stream(request.prompt),
            media_type="text/plain"
        )
    else:
        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": request.prompt}
                ],
                stream=False,
                temperature=0.3,
                max_tokens=4096
            )
            return {"result": response.choices[0].message.content}
        except Exception as e:
            return {"error": str(e)}

# 健康检查接口
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "后端服务运行正常"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        # 移除了不兼容的limit_max_request_size参数
        timeout_keep_alive=300  # 5分钟超时
    )