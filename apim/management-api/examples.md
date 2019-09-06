# Examples of commands

This file contains examples of commands to ease scripts usage in Auchan CORP environments.

## APIs

### Count
```
node count-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

### Listing

- All APIs
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

- Filtered by name
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

- Filtered by context path
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

- Filtered by endpoint group name
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-group-name 'lu'
```

- Filtered by endpoint name
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-name 'default'
```

- Filtered by endpoint target
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-target 'https://example.org'
```

- Filtered by plan name
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-plan-name 'Read'
```

- Sorted by labels
```
node list-labels.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

## Applications

### Listing

- All applications
```
node list-applications.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

## Quality

### Listing

Listing APIs quality requires quality feature to be enabled in Gravitee.

- All APIs
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

- Filtered by name
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

- Filtered by context path
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

### Extraction

- Extract single API quality
```
node extract-api-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --override-gravitee-automation --api-id <apiId>
```

- Extract all APIs quality
```
node extract-api-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --override-gravitee-automation
```

*Note: `--override-gravitee-automation` is required if quality feature is not enabled in Gravitee*

## Logs

- List APIs with detailed logs enabled
```
node list-activated-logs-apis.js --url 'https://gravitee-management-uat.yep.np.internal.auchan.com' -u 'admin' -p <password>
```

- Filtered by name
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

- Filtered by context path
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

- Disable detailed logs
```
node list-activated-logs-apis.js --url 'https://gravitee-management-uat.yep.np.internal.auchan.com' -u 'admin' -p <password> --disable-logs
```
