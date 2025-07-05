/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  // Run cargo fmt/clippy once for all Rust files
  '(apps|libs)/**/*.{rs,toml}': () => ['cargo fmt --all', 'cargo clippy --all-targets --all-features -- -D warnings'],

  // Run prettier for rest of the files
  '(apps|libs)/**/*.ts': ['prettier --write'],
  './*.{ts,js,json,md}': ['prettier --write'],
  './.prettierrc': ['prettier --write'],
  '.github/**/*': ['prettier --write'],
  '.changeset/*': ['prettier --write'],
}
