const https = require('https');
const http = require('http');
const { URL } = require('url');
const prompt = require('./prompt.js');

function buildRequestBody(options) {
  const messages = options.imageBase64
    ? prompt.attachImage(options.messages, 'data:image/jpeg;base64,' + options.imageBase64)
    : options.messages;

  const body = {
    model: options.model,
    messages: messages,
    temperature: 0.2,
    max_tokens: 1600
  };
  // qwen3.8-max 这类思考模型默认会先思考再回答，非流式请求要等思考全部
  // 生成完才返回 —— 完整提示词下 60 秒 0 字节（2026-09-24 实测）。
  // 本项目要的是结构化 JSON 和响应速度，默认关思考；不是所有兼容接口
  // 都认这个参数，所以可配置、不传则不带该字段（换模型时在配置里覆盖）。
  if (options.reasoningEffort !== undefined) {
    body.reasoning_effort = options.reasoningEffort;
  }
  return body;
}

function parseModelOutput(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('模型返回为空');
  }
  let text = raw.trim();

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1].trim();

  if (text.charAt(0) !== '{') {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('模型返回中找不到 JSON 对象');
    }
    text = text.slice(start, end + 1);
  }

  return JSON.parse(text);
}

function defaultHttpPost(urlString, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const target = new URL(urlString);
    const payload = JSON.stringify(body);
    const client = target.protocol === 'http:' ? http : https;

    const req = client.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }, headers)
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', function (err) { reject(err); });
    req.setTimeout(timeoutMs, function () {
      req.destroy(new Error('模型请求超时（' + timeoutMs + 'ms）'));
    });
    req.write(payload);
    req.end();
  });
}

function extractContent(responseBody) {
  const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
  const choice = parsed.choices && parsed.choices[0];
  if (!choice) {
    throw new Error('模型响应缺少 choices');
  }
  const content = choice.message ? choice.message.content : choice.text;
  if (Array.isArray(content)) {
    return content.map(function (part) {
      return typeof part === 'string' ? part : (part.text || '');
    }).join('');
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型响应内容为空');
  }
  return content;
}

function createCallModel(config) {
  const cfg = config || {};
  const httpPost = cfg.httpPost || defaultHttpPost;
  const timeoutMs = cfg.timeoutMs || 12000;
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
  const path = cfg.path || '/chat/completions';

  return function callModel(messages, options) {
    const opts = options || {};
    if (!baseUrl) {
      return Promise.reject(new Error('未配置模型地址（MODEL_BASE_URL）'));
    }
    if (!cfg.apiKey) {
      return Promise.reject(new Error('未配置模型密钥（MODEL_API_KEY）'));
    }
    if (!cfg.model) {
      return Promise.reject(new Error('未配置模型名称（MODEL_NAME）'));
    }

    const body = buildRequestBody({
      model: cfg.model,
      messages: messages,
      imageBase64: opts.imageBase64,
      reasoningEffort: cfg.reasoningEffort
    });

    const headers = { Authorization: 'Bearer ' + cfg.apiKey };

    return httpPost(baseUrl + path, headers, body, timeoutMs).then(function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('模型返回状态码 ' + res.statusCode + '：' + String(res.body).slice(0, 200));
      }
      return extractContent(res.body);
    });
  };
}

module.exports = {
  buildRequestBody,
  parseModelOutput,
  extractContent,
  defaultHttpPost,
  createCallModel
};
