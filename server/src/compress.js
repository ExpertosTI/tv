import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} salió con código ${code}`));
    });
  });
}

export async function compressVideo(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${base}.mp4`);
  const tempPath = path.join(dir, `${base}.compressing.mp4`);
  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', "scale='min(1920,iw)':-2",
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    tempPath,
  ]);
  const bytes = fs.statSync(tempPath).size;
  if (path.resolve(inputPath) !== path.resolve(outputPath)) fs.rmSync(inputPath, { force: true });
  fs.rmSync(outputPath, { force: true });
  fs.renameSync(tempPath, outputPath);
  return { storageName: path.basename(outputPath), bytes, mime: 'video/mp4' };
}
