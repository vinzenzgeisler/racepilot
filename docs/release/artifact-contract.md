# Pre-release npm-pack artifact contract

Status: implementation foundation; not a public registry release, license decision,
or production deployment.

## Version set

All public product workspaces use the same exact package version (`0.1.0`) and every
internal `@racepilot/*` dependency is pinned to that version. A release candidate is a
single source commit plus the complete workspace tarball set; consumers must not mix
individual packages from different commits or use a moving branch name.

Run `npm ci` followed by `npm run release:pack`. Set `RACEPILOT_PACK_DIR` to choose the
output directory. The command builds all workspaces, packs each product package, checks
that packed paths are restricted to runtime output (`dist`, PostgreSQL migrations,
and bundled fonts), and writes `product-artifacts.json` with:

- repository identity and full source Git commit;
- package name, exact version, tarball filename, npm integrity, and SHA-256;
- the complete list of files inside each tarball.

The manifest and tarballs are generated from the same checkout. Consumers verify the
source commit and each SHA-256 before installation. The commit identifies source bytes;
the SHA-256 detects tarball changes after packing. This initial contract does not claim
a signed GitHub build attestation or reproducible byte-for-byte builds across different
machines. Public CI has read-only permissions and no Cloud credentials or private
resource access.

## Composition boundaries

The artifact set contains the shared core, contracts, API, product UI, worker, and
provider adapters. Cloud assembly consumes the public API, worker, and UI as separate
versioned products and supplies trusted deployment adapters at their existing
composition boundaries. Private extensions remain in the private Cloud repository;
no private implementation, asset, credential, or configuration belongs in these
packages. Tenant enablement and authorization must be evaluated server-side for both
synchronous API operations and queued work.

Private Cloud incubation modules are a managed-service detail for Cloud subscribers
under the service agreement. There is no self-hosted deployment, support, or
individual-development offer for these private modules. A later public promotion is
an owner decision and must use a reviewed clean release, not private repository
history. Public registry publication and license selection remain separate owner gates.
