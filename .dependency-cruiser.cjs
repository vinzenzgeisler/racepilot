module.exports = {
  forbidden: [
    {
      name: 'no-product-imports-in-core-contracts',
      severity: 'error',
      from: { path: '^packages/(core|contracts)/' },
      to: { path: '^packages/(?!core/|contracts/)' },
    },
    {
      name: 'app-contracts-only',
      severity: 'error',
      from: { path: '^packages/app/' },
      to: { path: '^packages/(core|api|worker)/' },
    },
    {
      name: 'api-worker-no-app-imports',
      severity: 'error',
      from: { path: '^packages/(api|worker)/' },
      to: { path: '^packages/app/' },
    },
    {
      name: 'api-worker-no-cross-imports',
      severity: 'error',
      from: { path: '^packages/api/' },
      to: { path: '^packages/worker/' },
    },
    {
      name: 'worker-api-no-cross-imports',
      severity: 'error',
      from: { path: '^packages/worker/' },
      to: { path: '^packages/api/' },
    },
    {
      name: 'core-no-provider-or-node-io',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: {
        path: '^(node:)?(fs|fs/promises|path|http|https|net|tls|child_process|worker_threads)$|(^|/)(aws-sdk|@aws-sdk/|stripe|pg)(/|$)',
      },
    },
    {
      name: 'contracts-no-provider-or-node-io',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: {
        path: '^(node:)?(fs|fs/promises|path|http|https|net|tls|child_process|worker_threads)$|(^|/)(aws-sdk|@aws-sdk/|stripe|pg)(/|$)',
      },
    },
  ],
  options: {
    exclude: { path: '(\\.test\\.|/dist/)' },
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { exportsFields: ['exports'] },
    tsConfig: { fileName: '.dependency-cruiser.tsconfig.json' },
  },
};
