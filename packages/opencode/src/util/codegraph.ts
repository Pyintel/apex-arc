import ts from "typescript"
import path from "path"

export interface CodeSymbol {
  name: string
  type: "class" | "function" | "method" | "interface" | "type" | "variable"
  start_line: number
  end_line: number
  body_content: string
}

export interface CodeEdge {
  from_symbol_name: string
  to_symbol_name: string
  type: "calls" | "imports" | "extends"
}

export interface CodeGraph {
  symbols: CodeSymbol[]
  edges: CodeEdge[]
}

export function extractCodeGraph(filepath: string, content: string): CodeGraph {
  const ext = path.extname(filepath).toLowerCase()
  if (ext !== ".ts" && ext !== ".tsx" && ext !== ".js" && ext !== ".jsx") {
    return { symbols: [], edges: [] } // Fallback for unsupported extensions
  }

  const sourceFile = ts.createSourceFile(
    filepath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const symbols: CodeSymbol[] = []
  const edges: CodeEdge[] = []

  let currentSymbol: CodeSymbol | null = null
  const symbolStack: CodeSymbol[] = []

  function getLine(pos: number) {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
  }

  function visit(node: ts.Node) {
    let newSymbol: CodeSymbol | null = null

    if (ts.isClassDeclaration(node) && node.name) {
      newSymbol = {
        name: node.name.text,
        type: "class",
        start_line: getLine(node.getStart()),
        end_line: getLine(node.getEnd()),
        body_content: node.getText(),
      }

      // Check for 'extends' clauses
      if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                  for (const type of clause.types) {
                      edges.push({
                          from_symbol_name: node.name.text,
                          to_symbol_name: type.expression.getText(),
                          type: "extends"
                      })
                  }
              }
          }
      }
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      newSymbol = {
        name: node.name.text,
        type: "function",
        start_line: getLine(node.getStart()),
        end_line: getLine(node.getEnd()),
        body_content: node.getText(),
      }
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      newSymbol = {
        name: node.name.text,
        type: "method",
        start_line: getLine(node.getStart()),
        end_line: getLine(node.getEnd()),
        body_content: node.getText(),
      }
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      newSymbol = {
        name: node.name.text,
        type: "interface",
        start_line: getLine(node.getStart()),
        end_line: getLine(node.getEnd()),
        body_content: node.getText(),
      }
      // Check for 'extends' clauses
      if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                  for (const type of clause.types) {
                      edges.push({
                          from_symbol_name: node.name.text,
                          to_symbol_name: type.expression.getText(),
                          type: "extends"
                      })
                  }
              }
          }
      }
    } else if (ts.isTypeAliasDeclaration(node) && node.name) {
      newSymbol = {
        name: node.name.text,
        type: "type",
        start_line: getLine(node.getStart()),
        end_line: getLine(node.getEnd()),
        body_content: node.getText(),
      }
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
               node.parent && node.parent.parent &&
               ts.isVariableStatement(node.parent.parent)) {
        // Only top-level variable statements or within a module
        if (ts.isSourceFile(node.parent.parent.parent) || ts.isModuleBlock(node.parent.parent.parent)) {
            newSymbol = {
                name: node.name.text,
                type: "variable",
                start_line: getLine(node.getStart()),
                end_line: getLine(node.getEnd()),
                body_content: node.parent.parent.getText(),
            }
        }
    }

    if (newSymbol) {
      symbols.push(newSymbol)
      symbolStack.push(newSymbol)
      currentSymbol = newSymbol
    }

    if (ts.isCallExpression(node)) {
        let calleeName = ""
        if (ts.isIdentifier(node.expression)) {
            calleeName = node.expression.text
        } else if (ts.isPropertyAccessExpression(node.expression)) {
            calleeName = node.expression.name.text
        }

        if (calleeName && currentSymbol) {
             edges.push({
                from_symbol_name: currentSymbol.name,
                to_symbol_name: calleeName,
                type: "calls"
            })
        }
    } else if (ts.isImportDeclaration(node)) {
         if (node.importClause) {
             const moduleName = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : node.moduleSpecifier.getText()
             if (node.importClause.name) {
                 edges.push({
                     from_symbol_name: sourceFile.fileName, // Use filename as the context
                     to_symbol_name: node.importClause.name.text,
                     type: "imports" // From file to imported symbol
                 })
             }
             if (node.importClause.namedBindings) {
                 if (ts.isNamedImports(node.importClause.namedBindings)) {
                     for (const el of node.importClause.namedBindings.elements) {
                          edges.push({
                              from_symbol_name: sourceFile.fileName,
                              to_symbol_name: el.name.text,
                              type: "imports"
                          })
                     }
                 }
             }
         }
    }

    ts.forEachChild(node, visit)

    if (newSymbol) {
      symbolStack.pop()
      currentSymbol = symbolStack.length > 0 ? symbolStack[symbolStack.length - 1] : null
    }
  }

  visit(sourceFile)
  return { symbols, edges }
}
