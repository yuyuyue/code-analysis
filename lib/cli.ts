#!/usr/bin/env ts-node-script

import { program } from 'commander'
import path from 'path'
import { CONFIG_FILE_NAME } from './constants'
import { Configuration } from './type'
import fs from 'fs-extra'
import chalk from 'chalk'
import { clone } from './clone'
import Analysis from './analysis'

program
  .name('analysis')
  .description('analysis git code')
  .action(async () => {
    const confPath = path.join(process.cwd(), './' + CONFIG_FILE_NAME)
    const hasConfig = fs.existsSync(confPath)
    if (!hasConfig) {
      console.log(chalk.red(`ERROR: 缺少${CONFIG_FILE_NAME}配置文件`))
      process.exit(1)
    }
    const conf = await import(confPath)
    try {
      validateConfig(conf)
      // const entry = clone(conf)
      const entry = [
        {
          roots: ['/projects/fe-asm-easm-caasm'],
          name: 'fe-asm-easm-caasm',
        },
      ]
      if (!entry) {
        console.log(chalk.yellow(`Warnning: 没有可以分析的项目`))
        process.exit(1)
      }
      const analysis = new Analysis({
        entry: entry,
        plugins: conf?.plugins ?? [],
      })
      analysis.run()
    } catch (e) {
      console.log(chalk.red((e as Error)?.message ?? 'CLI 运行失败'))
      process.exit(1)
    }
  })

function validateConfig(conifg: Configuration) {
  if (!conifg.token) {
    return new Error('ERROR: 配置文件中缺少token')
  }

  if (!conifg.repo) {
    return new Error('ERROR: 配置文件中缺少repo')
  }
}

program.parse(process.argv)
