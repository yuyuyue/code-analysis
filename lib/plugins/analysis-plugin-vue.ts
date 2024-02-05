import { globSync } from 'glob'
import { parse, NodeTypes } from '@vue/compiler-dom'
import type { BaseElementNode } from '@vue/compiler-dom'
import ts from 'typescript'
import fs from 'fs'
import path from 'path'
import { Plugin } from '../type'

export const analysisPluginVue: Plugin = {
  name: 'analysis-plugin-vue',
  scanFiles: {
    order: 'pre',
    handler: (roots) => {
      let paths: string[] = []
      roots.forEach((root) => {
        const vueFiles = globSync(path.join(process.cwd(), `${root}/**/*.vue`))
        paths = [...paths, ...vueFiles]
      })
      return paths
    },
  },
  parse: {
    order: 'pre',
    handler: (path) => {
      if (!path.endsWith('.vue')) {
        return null
      }
      const code = fs.readFileSync(path, 'utf-8')
      const parser = parse(code)
      let tsCodes: string[] = []
      parser.children.forEach((e) => {
        const node = e as BaseElementNode
        if (node.tag === 'script') {
          const child = node.children[0]
          if (child.type === NodeTypes.TEXT) {
            tsCodes.push(child.content)
          }
        }
      })
      if (!tsCodes.length) {
        return null
      }
      return tsCodes.map((code, index) => {
        const cwd = process.cwd()
        const pathNams = path.split('/')
        const fileName = pathNams[pathNams.length - 1]
        const ast = ts.createSourceFile(
          fileName + index,
          code,
          ts.ScriptTarget.ES2015
        )
        const program = ts.createProgram({
          rootNames: [fileName],
          options: {
            target: ts.ScriptTarget.ES2015,
          },
        })
        const checker = program.getTypeChecker()
        return {
          ast,
          checker,
        }
      })
    },
  },
}
