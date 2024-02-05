import { analysisPluginBase } from './plugins/analysis-plugin-base'
import {
  FirstPluginHooks,
  PluginHooks,
  Plugin,
  AsyncPluginHooks,
  SyncPluginHooks,
  PluginDriverOptions,
  SequentialPluginHooks,
  Argument0,
  ParallelPluginHooks,
} from './type'

export class PluginDriver {
  private readonly plugins: Plugin[]
  constructor(options: PluginDriverOptions) {
    this.plugins = [...options.plugins, analysisPluginBase]
  }

  async hookFirst<H extends FirstPluginHooks & AsyncPluginHooks>(
    hookName: H,
    parameters: Parameters<PluginHooks[H]>
  ): Promise<ReturnType<PluginHooks[H]> | null> {
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      const result = await this.runHook(hookName, parameters, plugin)
      if (result !== null) {
        return result
      }
    }
    return null
  }

  hookFirstSync<H extends FirstPluginHooks & SyncPluginHooks>(
    hookName: H,
    parameters: Parameters<PluginHooks[H]>
  ): ReturnType<PluginHooks[H]> | null {
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of this.getSortedPlugins(hookName)) {
      const result = this.runHookSync(hookName, parameters, plugin)
      if (result != null) return result
    }
    return null
  }

  async hookReduceArg0<H extends AsyncPluginHooks & SequentialPluginHooks>(
    hookName: H,
    [arg0, ...rest]: Parameters<PluginHooks[H]>,
    reduce: (
      reduction: Argument0<H>,
      result: ReturnType<PluginHooks[H]>,
      plugin: Plugin
    ) => Argument0<H>
  ) {
    let promise = Promise.resolve(arg0)
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      promise = promise.then(async (arg0) => {
        const result = await this.runHook(
          hookName,
          [arg0, ...rest] as Parameters<PluginHooks[H]>,
          plugin
        )
        return reduce.call(plugin, arg0, result, plugin)
      })
    }
    return promise
  }

  hookReduceArg0Sync<H extends SyncPluginHooks & SequentialPluginHooks>(
    hookName: H,
    [arg0, ...rest]: Parameters<PluginHooks[H]>,
    reduce: (
      reduction: Argument0<H>,
      result: ReturnType<PluginHooks[H]>,
      plugin: Plugin
    ) => Argument0<H>
  ) {
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      const parameters = [arg0, ...rest] as Parameters<PluginHooks[H]>
      const result = this.runHookSync(hookName, parameters, plugin)
      arg0 = reduce.call(plugin, arg0, result, plugin)
    }
    return arg0
  }

  async hookReduce<H extends AsyncPluginHooks & SequentialPluginHooks>(
    hookName: H,
    initValue: ReturnType<PluginHooks[H]>,
    parameter: Parameters<PluginHooks[H]>,
    reduce: (
      reduction: ReturnType<PluginHooks[H]>,
      result: ReturnType<PluginHooks[H]>,
      plugin: Plugin
    ) => ReturnType<PluginHooks[H]>
  ) {
    let promise = Promise.resolve(initValue) as Promise<
      ReturnType<PluginHooks[H]>
    >
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      promise = promise.then(async (reduction) => {
        const result = await this.runHook(hookName, parameter, plugin)
        return reduce.call(plugin, reduction, result, plugin)
      })
    }
    return promise
  }

  hookReduceSync<H extends SyncPluginHooks & SequentialPluginHooks>(
    hookName: H,
    initValue: ReturnType<PluginHooks[H]>,
    parameter: Parameters<PluginHooks[H]>,
    reduce: (
      reduction: ReturnType<PluginHooks[H]>,
      result: ReturnType<PluginHooks[H]>,
      plugin: Plugin
    ) => ReturnType<PluginHooks[H]>
  ) {
    let reuslt = initValue
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      const runRes = this.runHookSync(hookName, parameter, plugin)
      reuslt = reduce.call(plugin, reuslt, runRes, plugin)
    }
    return reuslt
  }

  async hookParallel<H extends AsyncPluginHooks & ParallelPluginHooks>(
    hookName: H,
    parameter: Parameters<PluginHooks[H]>
  ): Promise<void> {
    const promises: Promise<unknown>[] = []
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      promises.push(this.runHook(hookName, parameter, plugin))
    }
    await Promise.all(promises)
  }

  hookParallelSync<H extends SyncPluginHooks & ParallelPluginHooks>(
    hookName: H,
    parameter: Parameters<PluginHooks[H]>
  ) {
    const plugins = this.getSortedPlugins(hookName)
    for (const plugin of plugins) {
      this.runHookSync(hookName, parameter, plugin)
    }
  }

  private async runHook<H extends AsyncPluginHooks>(
    hookName: H,
    parameters: Parameters<PluginHooks[H]>,
    plugin: Plugin
  ): Promise<ReturnType<PluginHooks[H]>> {
    const hook = plugin[hookName]
    const handler = typeof hook === 'object' ? hook.handler : hook

    return Promise.resolve()
      .then(() => {
        if (typeof handler != 'function') {
          return handler
        }
        const hookResult = (handler as Function).apply({}, parameters)

        // sync res
        if (!hookResult?.then) {
          return hookResult
        }
        // TODO: Hanging Promise Record

        return Promise.resolve(hookResult).then((result) => {
          return result
        })
      })
      .catch(() => {
        // TODO: EROOR RECORD
        console.log('runhook error')
      })
  }

  private runHookSync<H extends SyncPluginHooks>(
    hookName: H,
    parameters: Parameters<PluginHooks[H]>,
    plugin: Plugin
  ): ReturnType<PluginHooks[H]> {
    const hook = plugin[hookName]
    const handler = typeof hook === 'object' ? hook.handler : hook
    return (handler as Function).apply({}, parameters)
  }

  getSortedPlugins(hookName: keyof PluginHooks) {
    const pre: Plugin[] = []
    const normal: Plugin[] = []
    const post: Plugin[] = []
    for (const plugin of this.plugins) {
      const hook = plugin[hookName]
      if (hook) {
        if (typeof hook === 'object') {
          if (hook.order === 'pre') {
            pre.push(plugin)
            continue
          }
          if (hook.order === 'post') {
            post.push(plugin)
            continue
          }
        } else {
          console.warn('hook 格式不对')
        }
        normal.push(plugin)
      }
    }
    return [...pre, ...normal, ...post]
  }
}
