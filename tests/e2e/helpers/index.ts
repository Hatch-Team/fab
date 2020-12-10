import { cmd, shell } from '../../utils'
import fs from 'fs-extra'
import path from 'path'
import { ExecaChildProcess } from 'execa'
import tmp from 'tmp-promise'

export const ONE_PORT_TO_TEST_THEM_ALL = 10400

export const buildFab = async (cwd: string, global = false) => {
  await shell(`rm -f fab.zip`, { cwd })
  await shell(global ? `npx fab build` : `yarn fab:build`, { cwd })

  const { stdout: files_after_fab_build } = await cmd(`ls -l ${cwd}`)
  expect(files_after_fab_build).toMatch('fab.zip')
}

const workspace_dir = path.resolve(__dirname, '../workspace')
export const getWorkingDir = async (dirname: string, clean: boolean) => {
  const symlink = path.join(workspace_dir, dirname)

  if (await fs.pathExists(symlink)) {
    const realDir = await fs.realpath(symlink)
    // Handle the case where the FAB checkout already has stuff in e2e/workspace
    const is_symlink = realDir !== symlink
    if (!clean && is_symlink && (await fs.pathExists(realDir))) {
      return realDir
    }
    await fs.remove(symlink)
  }

  const dir = await tmp.dir()
  const cwd = path.join(dir.path, dirname)
  await fs.ensureDir(cwd)
  await fs.symlink(cwd, symlink)
  return cwd
}

let server_process: ExecaChildProcess | null = null

export const cancelServer = async () => {
  if (server_process) {
    const { pid } = server_process
    // The '-' before PID here says to kill the process and its children.
    // This only works correctly if the process was started "detached".
    await shell(`kill -SIGTERM -${pid}`)
    server_process = null
  }
}

export const createServer = async (cwd: string, args: string = '') => {
  await cancelServer()

  const auto_install = process.env.PUBLIC_PACKAGES ? '--auto-install' : ''
  server_process = cmd(
    `yarn fab:serve ${auto_install} --port=${ONE_PORT_TO_TEST_THEM_ALL} ${args}`,
    {
      cwd,
      detached: true,
    }
  )
  // See if `server_process` explodes in the first 2 seconds (e.g. if the port is in use)
  await Promise.race([
    server_process,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
}

export const request = async (args: string, path: string) => {
  const curl_cmd = `curl ${args} --retry 5 --retry-connrefused http://localhost:${ONE_PORT_TO_TEST_THEM_ALL}`
  const { stdout } = await shell(curl_cmd + path)
  return stdout
}
