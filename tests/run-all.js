const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;

// 自动发现，避免新增套件后忘记登记（曾经漏跑过 ideal 套件）。
// 骨架测试放最前，它最快，先跑能立刻暴露文件缺失。
function discoverSuites() {
  const files = fs.readdirSync(TESTS_DIR)
    .filter(function (name) {
      return /^check-.*\.js$/.test(name);
    })
    .sort();

  const skeleton = 'check-skeleton.js';
  const ordered = files.indexOf(skeleton) >= 0
    ? [skeleton].concat(files.filter(function (name) { return name !== skeleton; }))
    : files;

  return ordered.map(function (name) {
    return path.join('tests', name);
  });
}

const SUITES = discoverSuites();

let failedSuites = 0;

SUITES.forEach(function (suite) {
  const file = path.join(__dirname, '..', suite);
  console.log('\n========== ' + suite + ' ==========');
  try {
    const out = execFileSync(process.execPath, [file]).toString();
    process.stdout.write(out);
  } catch (err) {
    failedSuites++;
    process.stdout.write((err.stdout || '').toString());
    console.error((err.stderr || '').toString());
  }
});

console.log('\n========== 汇总 ==========');
console.log(failedSuites === 0
  ? '全部套件通过 (' + SUITES.length + '/' + SUITES.length + ')'
  : failedSuites + ' 个套件失败');
process.exit(failedSuites > 0 ? 1 : 0);
