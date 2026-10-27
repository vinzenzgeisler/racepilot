#!/usr/bin/env python3
import json
from pathlib import Path
p=Path('docs/security/product-resource-inventory.json')
data=json.loads(p.read_text())
assert data.get('version')==1 and isinstance(data.get('resources'),list)
for resource in data['resources']:
    assert isinstance(resource.get('id'),str) and resource['kind'] in {'table','route','job-payload','config'}
    assert isinstance(resource.get('tenantKey'),str) and isinstance(resource.get('isolation'),str)
    tests=resource.get('negativeTests'); assert isinstance(tests,list) and tests
    for test in tests:
        path=Path(test['file']); assert path.is_file(),f"missing test file: {path}"
        assert test['name'] in path.read_text(),f"missing test name {test['name']!r} in {path}"
print('Product resource inventory OK')
