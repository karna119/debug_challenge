
const PISTON_API_URLS = [
  'http://localhost:3001', // Local backend
  'https://emkc.org/api/v2/piston',
  'https://piston.engineering/api/v2'
];

export interface CompileResult {
  stdout: string;
  stderr: string;
  output: string;
  code: number;
  signal: string | null;
}

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  c: { language: 'c', version: '10.2.1' },
  cpp: { language: 'cpp', version: '10.2.1' },
};

export const compileCode = async (language: string, sourceCode: string): Promise<CompileResult> => {
  const langConfig = LANGUAGE_MAP[language];
  if (!langConfig) throw new Error('Unsupported language');

  let lastError: any = null;

  for (const apiUrl of PISTON_API_URLS) {
    try {
      const isLocal = apiUrl.includes('localhost');
      const endpoint = isLocal ? `${apiUrl}/api/execute` : `${apiUrl}/execute`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: langConfig.language,
          version: langConfig.version,
          sourceCode: sourceCode, // Local backend expects 'sourceCode'
          files: [
            {
              name: `main.${language === 'python' ? 'py' : language === 'java' ? 'java' : language === 'c' ? 'c' : 'cpp'}`,
              content: sourceCode,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status code ${response.status}`);
      }

      const data = await response.json();

      // Handle both local (flat) and Piston (run-wrapped) response formats
      const run = data.run || data;

      return {
        stdout: run.stdout || '',
        stderr: run.stderr || '',
        output: run.output || '',
        code: run.code ?? 0,
        signal: run.signal ?? null,
      };
    } catch (error) {
      console.warn(`Failed to compile with ${apiUrl}:`, error);
      lastError = error;
      continue; // Try next URL
    }
  }

  throw lastError || new Error('All compilation services failed');
};
