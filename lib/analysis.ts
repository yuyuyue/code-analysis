import ts, { Node } from 'typescript'
import { PluginDriver } from './plugin-driver'
import { AnalysisOptions, Source, Module, ApiCall, ParseReturn } from './type'
import { v4 as uuidv4 } from 'uuid'

export default class Analysis {
  private options: AnalysisOptions
  private pluginDriver: PluginDriver
  private modules: Module[]

  constructor(options: AnalysisOptions) {
    this.options = options
    this.modules = []
    this.pluginDriver = new PluginDriver({
      plugins: options?.plugins ?? [],
    })
  }

  async run() {
    // 1. 扫描文件
    const files = await Promise.all(
      this.options.entry.map(async (ent) => {
        const source: Source = {
          name: ent.name,
          paths: [],
        }
        source.paths = await this.pluginDriver.hookReduce(
          'scanFiles',
          [],
          [ent.roots],
          (reduction, result) => {
            return [...reduction, ...result]
          }
        )
        return source
      })
    )
    // 2. 解析文件
    this.scanModule(files)
    // 3. 结果处理
    this.emit()
  }

  scanModule(sources: Source[]) {
    const self = this
    sources.forEach((source) => {
      const paths = source.paths
      paths.forEach((path) => {
        const parse = this.pluginDriver.hookFirstSync('parse', [path])
        if (!parse) {
          return
        }
        if (Array.isArray(parse)) {
          parse.forEach((p) => handleModule(p))
        } else {
          handleModule(parse)
        }

        function handleModule(parse: ParseReturn) {
          const { ast, checker, baseLine = 0 } = parse
          if (!ast) {
            return
          }
          const module: Module = {
            id: 'module' + uuidv4(),
            ast,
            path,
            baseLine,
            checker,
            imports: {},
            dynamicallyImports: {},
            apiCalls: [],
          }
          self.modules.push(module)
          self.importDeclaration(module)
          self.anlysisAst(module)
          self.modules.push(module)
        }
      })
    })
  }

  importDeclaration(module: Module) {
    const { ast, baseLine } = module
    const self = this
    function walk(node: Node) {
      ts.forEachChild(node, walk)
      const line =
        ast.getLineAndCharacterOfPosition(node.getStart()).line + baseLine + 1

      // Dynamic import
      if (node.kind === ts.SyntaxKind.ImportKeyword) {
        const expression = node.parent as ts.CallExpression
        const arg0 = expression.arguments[0] as ts.StringLiteral
        const name = arg0.text
        module.dynamicallyImports[name] = {
          name,
          lib: name,
          origin: null,
          symbolPos: arg0.pos,
          symbolEnd: arg0.end,
          pos: arg0.pos,
          end: arg0.end,
          line: line,
        }
      }
      if (!ts.isImportDeclaration(node) || !node.importClause) {
        return
      }
      const moduleSpecifier = node.moduleSpecifier
      const lib = moduleSpecifier.getText()
      // import app from 'lib'
      if (node.importClause.name) {
        const identifier = node.importClause.name
        const name = identifier.escapedText as any as string
        module.imports[name] = {
          name,
          origin: null,
          symbolPos: node.importClause.pos,
          symbolEnd: node.importClause.end,
          pos: identifier.pos,
          end: identifier.end,
          lib,
          line,
        }
      }
      // import { app } from 'lib' & import { app as getApp } from 'lib'
      if (
        node.importClause.namedBindings &&
        node.importClause.namedBindings.kind === ts.SyntaxKind.NamedImports &&
        !node.importClause.isTypeOnly
      ) {
        const elements = node.importClause.namedBindings.elements
        elements.forEach((ele) => {
          if (ts.isImportSpecifier(ele) && !ele.isTypeOnly) {
            const name = ele.name.escapedText as any as string
            // 有别名就会存在propertyName
            const propertyName =
              (ele.propertyName?.escapedText as any as string) ?? null
            const apiKey = propertyName ?? name
            module.imports[apiKey] = {
              name,
              origin: propertyName,
              symbolPos: ele.pos,
              symbolEnd: ele.end,
              pos: ele.name.pos,
              end: ele.name.end,
              lib,
              line,
            }
          }
        })
      }
      // import * as lib from 'lib'
      if (
        node.importClause.namedBindings &&
        node.importClause.namedBindings.kind === ts.SyntaxKind.NamespaceImport
      ) {
        const namedBindings = node.importClause.namedBindings
        const identifier = namedBindings.name
        const name = identifier.escapedText as any as string
        module.imports[name] = {
          name,
          origin: '*',
          symbolPos: namedBindings.pos,
          symbolEnd: namedBindings.end,
          pos: identifier.pos,
          end: identifier.end,
          lib,
          line,
        }
      }
    }
    walk(ast)
  }

  anlysisAst(module: Module) {
    const { imports, checker, ast, baseLine } = module
    const importNames = Object.keys(imports) ?? []
    const self = this

    function walk(node: Node) {
      const line =
        ast.getLineAndCharacterOfPosition(node.getStart()).line + baseLine + 1
      ts.forEachChild(node, walk)
      self.pluginDriver.hookParallel('anlysis', [module])
      if (
        ts.isIdentifier(node) &&
        node.escapedText &&
        importNames.length > 1 &&
        importNames.includes(node.escapedText)
      ) {
        const item = imports[node.escapedText]
        // 排除import自身
        if (node.pos === item.pos && node.end === item.end) {
          return
        }
        const symbol = checker?.getSymbolAtLocation(node)
        if (symbol && symbol.declarations && symbol.declarations.length > 0) {
          const symbolId = symbol.declarations[0]
          // 排除局部块调用
          // 如果symbol的位置和import记录的不同说明不是全局引入的调用
          if (
            symbolId.pos !== item.symbolPos &&
            symbolId.end !== item.symbolEnd
          ) {
            return
          }

          let apiName = item.name
          // 链式调用
          if (ts.isPropertyAccessExpression(node.parent)) {
            const { name, node: pNode } = self.checkPropertyAccessName(
              node,
              item.name
            )
            apiName = name
          }
          const apiCall: ApiCall = {
            name: apiName,
            pos: node.pos,
            end: node.end,
            import: item.name,
            lib: item.lib,
            line,
          }
          module.apiCalls.push(apiCall)
        }
      }
    }

    walk(ast)
  }

  emit() {
    const res = this.pluginDriver.hookReduceSync(
      'result',
      true,
      [this],
      (reduction, result) => {
        if (!reduction || !result) {
          return false
        }
        return true
      }
    )
    if (!res) {
      process.exit(1)
    }
    this.pluginDriver.hookParallel('endTap', [this])
  }

  checkPropertyAccessName(
    node: ts.Node,
    name: string = ''
  ): {
    node: Node
    name: string
  } {
    const parent = node.parent
    if (ts.isPropertyAccessExpression(parent)) {
      name += '.' + parent.name.escapedText
      return this.checkPropertyAccessName(parent, name)
    } else {
      return {
        node: node,
        name,
      }
    }
  }

  validateOptions(options: AnalysisOptions) {}
}
