import ts from 'typescript'
import Analysis from './analysis'

export enum ScanExtensions {
  JS = 'js',
  TS = 'ts',
  JSX = 'jsx',
  TSX = 'tsx',
  VUE = 'vue',
  JSON = 'json',
}

export interface Configuration {
  token: string
  repo: string[]
  cloneDir?: string
  plugins?: Plugin[]
}

export type Argument0<H extends keyof PluginHooks> = Parameters<
  PluginHooks[H]
>[0]

/******************************* Analysis Type *********************************/
export interface AnalysisOptions {
  entry: Entry[]
  plugins: Plugin[]
}

/******************************** Module Type *********************************/
export type Module = {
  id: string
  path: string
  baseLine: number
  ast: ts.SourceFile
  checker?: ts.TypeChecker
  imports: { [name: string]: ImportDeclaration }
  dynamicallyImports: { [name: string]: ImportDeclaration }
  apiCalls: ApiCall[]
  [key: string]: any
}

export interface ImportDeclaration {
  name: string // 函数真实名称
  origin: string | null // 函数调用的原名称
  symbolPos: number // symbol指向的声明节点在代码字符串中的起始位置
  symbolEnd: number // symbol指向的声明节点在代码字符串中的结束位置
  pos: number // API 名字信息节点在代码字符串中的起始位置
  end: number // API 名字信息节点在代码字符串中的结束位置
  line: number // 声明所在的行号
  lib: string // 导入的包的名称
}

export interface ApiCall {
  name: string // 调用函数名称
  pos: number
  end: number
  line: number
  import: string
  lib: string
}

/***************************** PluginDriver Type ******************************/
export interface PluginDriverOptions {
  plugins: Plugin[]
}

type MakeAsync<F> = F extends (
  this: infer This,
  ...parameter: infer Arguments
) => infer Return
  ? (this: This, ...parameters: Arguments) => Return | Promise<Return>
  : never

type ParcelHook<T, O = {}> =
  | T
  | ({ handler: T; order?: 'pre' | 'post' | null } & O)

export type Hooks = {
  [K in keyof PluginHooks]?: ParcelHook<
    K extends AsyncPluginHooks ? MakeAsync<PluginHooks[K]> : PluginHooks[K]
  >
}

export interface Plugin extends Hooks {
  name: string
}

export interface Entry {
  name: string
  roots: string[]
  extensions?: (ScanExtensions | string)[]
}

export interface Source {
  name: string
  paths: string[]
}

export type ParseReturn = Partial<Pick<Module, 'ast' | 'checker' | 'baseLine'>>

/********************************* 插件时机 *************************************/
export interface PluginHooks {
  scanFiles: ScanFilesPluginHook
  parse: ParsePluginHook
  anlysis: AnlysisPluginHook
  result: ResultPluginHook
  endTap: EndTapPluginHook
}

export type ScanFilesPluginHook = (path: string[]) => string[]
export type ParsePluginHook = (
  path: string
) => ParseReturn | ParseReturn[] | null
export type AnlysisPluginHook = (module: Module) => void
export type ResultPluginHook = (compiler: Analysis) => boolean
export type EndTapPluginHook = (compiler: Analysis) => void
/************************** 不同Hook类型支持的插件时机 *****************************/
export type SyncPluginHooks = 'parse' | 'result'

export type AsyncPluginHooks = Exclude<keyof PluginHooks, SyncPluginHooks>

export type FirstPluginHooks = Extract<keyof PluginHooks, 'parse'>

export type SequentialPluginHooks = Extract<
  keyof PluginHooks,
  'scanFiles' | 'result'
>

export type ParallelPluginHooks = Extract<
  keyof PluginHooks,
  'anlysis' | 'endTap'
>
