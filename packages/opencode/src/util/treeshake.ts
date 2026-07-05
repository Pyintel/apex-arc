import ts from "typescript"
import path from "path"

export function treeshake(filepath: string, content: string): string {
  const ext = path.extname(filepath).toLowerCase()
  if (ext !== ".ts" && ext !== ".tsx" && ext !== ".js" && ext !== ".jsx") {
    return content // Fallback for unsupported extensions
  }

  const sourceFile = ts.createSourceFile(
    filepath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const replacements: { start: number; end: number; text: string }[] = []

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      if (node.body) {
        let isArrowSingleExpr = false
        if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
          isArrowSingleExpr = true
        }

        if (!isArrowSingleExpr) {
          replacements.push({
            start: node.body.getStart(),
            end: node.body.getEnd(),
            text: "{ /* [body elided for context efficiency] */ }",
          })
        } else {
            replacements.push({
                start: node.body.getStart(),
                end: node.body.getEnd(),
                text: "/* [body elided for context efficiency] */",
            })
        }
      }
    }
    if (!(ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node))) {
      ts.forEachChild(node, visit)
    }
  }

  visit(sourceFile)

  // Sort replacements in reverse order so we don't mess up indices
  replacements.sort((a, b) => b.start - a.start)

  let result = content
  for (const rep of replacements) {
    result = result.substring(0, rep.start) + rep.text + result.substring(rep.end)
  }

  return result
}
