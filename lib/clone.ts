import { join } from 'path'
import SimpleGit from 'simple-git'
import { Configuration, Entry } from './type'
import { DEFAULT_CONLE_DIR } from './constants'
import fs from 'fs-extra'

export function clone(config: Configuration): Entry[] | null {
  const git = SimpleGit()
  return config.repo.map((r) => {
    const regx = new RegExp(/^https?:\/\//gi)
    const nameRegex = new RegExp(/\/([^/]+)\.git$/)
    const match = nameRegex.exec(r)
    let name = match?.[1]
    if (!regx.test(r) || !name) {
      throw new Error('ERROR: 仓库地址不正确')
    }
    const cloneDir = join(process.cwd(), config?.cloneDir ?? DEFAULT_CONLE_DIR)
    if (fs.existsSync(cloneDir)) {
      fs.removeSync(cloneDir)
    }
    const path = join(config?.cloneDir ?? DEFAULT_CONLE_DIR, name)
    git.clone(config.repo[0], path).catch((e) => {
      throw new Error(e.message)
    })
    return {
      roots: [path],
      name: name,
    }
  })
}
