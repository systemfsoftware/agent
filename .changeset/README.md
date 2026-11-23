# Changesets

This directory contains release notes for public Yielded Agent packages.

All public framework workspaces belong to one Changesets fixed group. A changeset names only the
packages whose behavior changed, while versioning advances every public workspace to the same
version and publishes unchanged packages on the same release train.

Create a changeset, review the generated version plan, and merge the automated version PR to
publish.

Pending changesets live directly in this directory. Changesets moves consumed
beta release notes to `pre/` and keeps only the prerelease mode and tag in
`pre.json`. Retain the archived notes for the eventual stable release.
