import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./inspect_checkpoint.py', import.meta.url));

export function installCheckpoints(app, resolve, root) {
  let running = 0;
  app.get('/api/checkpoint', async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    let file;
    try {
      file = await resolve(req.query.path);
      if (path.relative(root, file).split(path.sep).some(part => part.startsWith('.')) ||
          !/\.(pt|pth)$/i.test(file) || !(await stat(file)).isFile()) {
        throw Error('请选择根目录内的 .pt 或 .pth 文件。');
      }
    } catch {
      return res.status(400).json({ error: '无法访问该检查点。' });
    }
    if (controller.signal.aborted) return;
    if (running >= 2) return res.status(429).json({ error: '正在读取其他检查点，请稍后重新打开。' });
    running++;
    try {
      const { stdout } = await run(process.env.CHECKPOINT_PYTHON || 'python3', ['-I', script, file], {
        signal: controller.signal, timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 12 * 1024 * 1024,
        env: { ...process.env, CUDA_VISIBLE_DEVICES: '', OMP_NUM_THREADS: '1' }
      });
      const data = JSON.parse(stdout);
      res.status(data.error ? 422 : 200).json(data);
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error.code === 'ENOENT' ? '找不到 Python 解释器，请设置 CHECKPOINT_PYTHON。'
          : '读取检查点失败或超出预览资源限制。';
        res.status(503).json({ error: message });
      }
    } finally { running--; }
  });
}
