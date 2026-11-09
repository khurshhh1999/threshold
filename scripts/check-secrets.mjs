import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const errors = []
const secretPrefix = 'sk-' + 'ant-'
for (const file of files) {
  if (/(^|\/)\.env(\.|$)/.test(file) || /(^|\/)\.vercel\//.test(file) || /\.(pem|key)$/.test(file)) {
    errors.push(`${file}: secret file must not be tracked`)
    continue
  }
  if (file === 'scripts/check-secrets.mjs' || file === 'pnpm-lock.yaml') continue
  if (!['.ts','.tsx','.js','.jsx','.mjs','.json','.md','.yml','.yaml'].includes(extname(file))) continue
  const source = readFileSync(file, 'utf8')
  if (source.includes(secretPrefix)) errors.push(`${file}: possible Anthropic key`)
  if (source.includes('NEXT_PUBLIC_ANTHROPIC_API_KEY')) errors.push(`${file}: public API key variable`)
  if (/^['"]use client['"];?/m.test(source) && source.includes('process.env.ANTHROPIC_API_KEY')) errors.push(`${file}: server key referenced in client code`)
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('No tracked secret files or client key references found.')
