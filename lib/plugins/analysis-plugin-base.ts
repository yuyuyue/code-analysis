import { globSync } from 'glob'
import path from 'path'
import ts from 'typescript'

import { Plugin } from '../type'

export const analysisPluginBase: Plugin = {
  name: 'analysis-plugin-base',
  scanFiles: {
    order: 'post',
    handler: (roots) => {
      let paths: string[] = []
      roots.forEach((root) => {
        const tsFiles = globSync(path.join(process.cwd(), `${root}/**/*.ts`))
        const tsxFiles = globSync(path.join(process.cwd(), `${root}/**/*.tsx`))
        paths = [...paths, ...tsFiles, ...tsxFiles]
      })
      return paths
    },
  },
  parse: {
    order: 'post',
    handler: (path) => {
      const program = ts.createProgram([path], {})
      const ast = program.getSourceFile(path)
      const checker = program.getTypeChecker()

      if (!ast) {
        return null
      }
      return { ast, checker }
    },
  },
}
