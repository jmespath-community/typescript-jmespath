import { execFileSync } from 'node:child_process';

const HOOKS_PATH = '.githooks';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

let current;
try {
  current = git(['config', '--get', 'core.hooksPath']).trim();
} catch (error) {
  // Exit code 1 means the key is unset; anything else means this is not a Git
  // checkout (a tarball install, for example), so there is nothing to install.
  if (error.status !== 1) {
    process.exit(0);
  }
  current = '';
}

// Do not overwrite a hooks directory the developer configured themselves.
if (current === '' || current === HOOKS_PATH) {
  git(['config', 'core.hooksPath', HOOKS_PATH]);
}
