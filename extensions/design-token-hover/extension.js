const vscode = require('vscode')
const fs = require('fs')
const path = require('path')

const TOKEN_RE = /token\(\s*(['"])([^'"]+)\1\s*\)/g
const TOKEN_TEXT_RE = /@token-text\s+(?:(['"])([^'"]+)\1|([A-Za-z_][\w-]*))/g
const LOOKUP_REL = '.vscode/tokens.lookup.json'

/** @type {Map<string, string>} */
let tokens = new Map()

/**
 * @param {string} folder
 */
function loadLookup(folder) {
  try {
    const raw = fs.readFileSync(path.join(folder, LOOKUP_REL), 'utf8')
    tokens = new Map(Object.entries(JSON.parse(raw)))
  } catch {
    tokens = new Map()
  }
}

/**
 * @param {string} key
 */
function lookupTokenText(key) {
  return (
    tokens.get(`@token-text ${key}`) ??
    tokens.get(`@token-text '${key}'`) ??
    tokens.get(`@token-text "${key}"`)
  )
}

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!folder) return

  loadLookup(folder)

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, LOOKUP_REL)
  )
  const reload = () => loadLookup(folder)
  watcher.onDidChange(reload)
  watcher.onDidCreate(reload)

  context.subscriptions.push(
    watcher,
    vscode.languages.registerHoverProvider(['css', 'scss', 'less', 'postcss'], {
      provideHover(doc, position) {
        const line = doc.lineAt(position.line).text

        TOKEN_RE.lastIndex = 0
        let match
        while ((match = TOKEN_RE.exec(line)) !== null) {
          const start = match.index
          const end = start + match[0].length
          if (position.character < start || position.character > end) continue
          const value = tokens.get(match[2])
          if (value === undefined) return undefined
          return new vscode.Hover(
            new vscode.MarkdownString(`\`${value}\``),
            new vscode.Range(position.line, start, position.line, end)
          )
        }

        TOKEN_TEXT_RE.lastIndex = 0
        while ((match = TOKEN_TEXT_RE.exec(line)) !== null) {
          const start = match.index
          const end = start + match[0].length
          if (position.character < start || position.character > end) continue
          const key = match[2] ?? match[3]
          if (key === undefined) continue
          const value = lookupTokenText(key)
          if (value === undefined) return undefined
          return new vscode.Hover(
            new vscode.MarkdownString(`\`${value}\``),
            new vscode.Range(position.line, start, position.line, end)
          )
        }

        return undefined
      },
    })
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
