import { execFile } from "child_process";
import path from "path";

export function runPythonExtractor(
  filePath: string,
  mimeType: string
): Promise<{ text: string; chunks: { index: number; content: string }[] }> {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "../../../python/python/extract_and_chunk.py");

    execFile(
      "python3",
      [script, filePath, mimeType],
      { maxBuffer: 1024 * 1024 * 50 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        if (stderr) return reject(new Error(stderr));

        try {
          resolve(JSON.parse(stdout.toString()));
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}
