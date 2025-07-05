import prompts from 'prompts'
import { execSync } from 'child_process'

const modifiedFiles = execSync('git status --porcelain', { encoding: 'utf-8' })
  .split('\n')
  .filter((line) => line.trim().length > 0)

if (modifiedFiles.length > 0) {
  const response = await prompts({
    type: 'confirm',
    name: 'addChangeset',
    message: 'There are modified files. Do you want to add a changeset now?',
    initial: true,
  })

  if (response.addChangeset) {
    execSync('npm run changeset', { stdio: 'inherit' })
  }
}
