/**
 * 云函数的时间预算。
 *
 * 这些数字不是凭感觉定的，来自 T00 的实测（见 docs/model-recon-20260918.md）：
 * 六次带图请求耗时 15.264–17.303 秒，**全都超过**原来配置的 15000ms。
 * 也就是说原来的单次预算是卡着（甚至低于）实际耗时跑的。
 *
 * 三层预算必须一层套一层，谁先到谁截断：
 *   客户端等待 ≥ 云函数 timeout ≥ 单次模型请求 × 尝试次数 + 下载/解析/缓存余量
 * 最容易出的事故是「云函数还在跑，客户端先超时」，界面上表现为
 * 「云函数日志显示成功，前端却收到失败」—— 查起来非常费时间。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const CONFIG_PATH = 'cloudfunctions/analyze/config.json';
const INDEX_PATH = 'cloudfunctions/analyze/index.js';

/** T00 实测最慢一次带图请求的耗时（毫秒），留作下限依据 */
const OBSERVED_SLOWEST_MS = 17303;

console.log('\n[1] 云函数超时配置');

const cfgExists = fs.existsSync(path.join(ROOT, CONFIG_PATH));
ok(cfgExists, CONFIG_PATH + ' 存在（不写就用平台默认，视觉模型不够）');

let timeout = null;
if (cfgExists) {
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG_PATH), 'utf8'));
  } catch (err) {
    ok(false, CONFIG_PATH + ' 是合法 JSON（' + err.message + '）');
  }
  if (cfg) {
    timeout = cfg.timeout;
    ok(typeof timeout === 'number', 'timeout 是数字（实际 ' + JSON.stringify(timeout) + '）');
    ok(timeout >= 45, 'timeout 至少 45 秒（要放下两次模型尝试，实际 ' + timeout + '）');
    ok(timeout <= 900, 'timeout 不超过官方上限 900 秒（实际 ' + timeout + '）');
  }
}

console.log('\n[2] 单次模型请求预算');

const indexSrc = fs.readFileSync(path.join(ROOT, INDEX_PATH), 'utf8');
const matched = /MODEL_TIMEOUT_MS\s*=\s*(\d+)/.exec(indexSrc);
ok(!!matched, 'index.js 里能找到 MODEL_TIMEOUT_MS');
let modelTimeout = matched ? Number(matched[1]) : 0;
if (matched) {
  ok(
    modelTimeout > OBSERVED_SLOWEST_MS,
    '单次预算高于实测最慢一次（' + modelTimeout + ' > ' + OBSERVED_SLOWEST_MS + '）'
  );
  ok(modelTimeout >= 20000, '单次预算至少 20 秒（实际 ' + modelTimeout + '）');
}

console.log('\n[3] 云函数预算装得下两次尝试');

if (timeout && modelTimeout) {
  // 注意单位：config.json 的 timeout 是「秒」，MODEL_TIMEOUT_MS 是毫秒
  const timeoutMs = timeout * 1000;
  const need = modelTimeout * 2 + 10000;
  ok(
    timeoutMs >= need,
    '云函数 timeout 装得下「两次请求 + 10 秒下载解析缓存余量」（需要 ' +
      need / 1000 + ' 秒，实际 ' + timeout + ' 秒）'
  );
}

console.log('\n[4] 客户端不先截断');

const resultSrc = fs.readFileSync(path.join(ROOT, 'pages/result/index.js'), 'utf8');
const callSite = /callFunction\(\s*\{([\s\S]*?)\}\s*\)/.exec(resultSrc);
ok(!!callSite, 'result 页能找到 callFunction 调用');
if (callSite) {
  const clientTimeout = /timeout\s*:\s*(\d+)/.exec(callSite[1]);
  if (clientTimeout) {
    // 客户端 timeout 是毫秒，config.json 是秒 —— 两边都换算成毫秒再比
    const clientMs = Number(clientTimeout[1]);
    const cloudMs = timeout * 1000;
    ok(
      clientMs >= cloudMs,
      '客户端等待预算不小于云函数 timeout（客户端 ' +
        clientMs / 1000 + ' 秒 / 云函数 ' + timeout + ' 秒）'
    );
  } else {
    ok(true, '客户端未设更小的等待上限（走平台默认，真机仍需核一次）');
  }
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
