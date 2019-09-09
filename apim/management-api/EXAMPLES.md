# Examples of commands

This file contains examples of commands to ease scripts usage in Auchan CORP environments.

## APIs

### Count

* UAT
```
node count-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

* Production
```
node count-apis.js --url http://100.65.130.137/management -u admin -p <password>
```

### Listing

#### All APIs

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password>
```

#### Filtered by name

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-name 'meti'
```

#### Filtered by context path

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-context-path '/lu'
```

#### Filtered by endpoint group name

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-group-name 'lu'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-endpoint-group-name 'lu'
```

#### Filtered by endpoint name

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-name 'default'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-endpoint-name 'default'
```

#### Filtered by endpoint target

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-endpoint-target 'https://example.org'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-endpoint-target 'https://example.org'
```

#### Filtered by plan name

* UAT
```
node list-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-plan-name 'Read'
```

* Production
```
node list-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-plan-name 'Read'
```

#### Sorted by labels

* UAT
```
node list-labels.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

* Production
```
node list-labels.js --url http://100.65.130.137/management -u admin -p <password>
```

## Applications

### Listing

#### All applications

* UAT
```
node list-applications.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

* Production
```
node list-applications.js --url http://100.65.130.137/management -u admin -p <password>
```

## Quality

### Listing

Listing APIs quality requires quality feature to be enabled in Gravitee.

#### All APIs

* UAT
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password>
```

* Production
```
node list-apis-quality.js --url http://100.65.130.137/management -u admin -p <password>
```

#### Filtered by name

* UAT
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

* Production
```
node list-apis-quality.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-name 'meti'
```

#### Filtered by context path

* UAT
```
node list-apis-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

* Production
```
node list-apis-quality.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-context-path '/lu'
```

### Extraction

#### Extract single API quality

* UAT
```
node extract-api-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --override-gravitee-automation --api-id <apiId>
```

* Production
```
node extract-api-quality.js --url http://100.65.130.137/management -u admin -p <password> --override-gravitee-automation --api-id <apiId>
```

#### Extract all APIs quality

* UAT
```
node extract-api-quality.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --override-gravitee-automation
```

* Production
```
node extract-api-quality.js --url http://100.65.130.137/management -u admin -p <password> --override-gravitee-automation
```

*Note: `--override-gravitee-automation` is required if quality feature is not enabled in Gravitee*

## Logs

### Listing APIs with detailed logs enabled

#### All APIs

* UAT
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u 'admin' -p <password>
```

* Production
```
node list-activated-logs-apis.js --url http://100.65.130.137/management -u 'admin' -p <password>
```

#### Filtered by name

* UAT
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'meti'
```

* Production
```
node list-activated-logs-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-name 'meti'
```

#### Filtered by context path

* UAT
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-context-path '/lu'
```

* Production
```
node list-activated-logs-apis.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-context-path '/lu'
```

### Disable detailed logs

* UAT
```
node list-activated-logs-apis.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u 'admin' -p <password> --disable-logs
```

* Production
```
node list-activated-logs-apis.js --url http://100.65.130.137/management -u 'admin' -p <password> --disable-logs
```

## Users

### List inactive LDAP users

*Note: requires Node 10 for TLS 1.0 usage*

*Note: first create a SSH tunnel to LDAP server via command: `ssh -L 1636:10.239.2.28:636 -N <username>@yodcoruatltac0`*

* UAT
```
NODE_TLS_REJECT_UNAUTHORIZED='0' node list-inactive-ldap-users.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --ldap-url ldaps://localhost:1636 --ldap-username "cn=SVCGRAVITEE,ou=servicesaccounts,dc=auchan,dc=corp" --ldap-password <ldap_password> --ldap-base 'dc=auchan,dc=corp'
```

* Production
```
NODE_TLS_REJECT_UNAUTHORIZED='0' node list-inactive-ldap-users.js --url http://100.65.130.137/management -u admin -p <password> --ldap-url ldaps://localhost:1636 --ldap-username "cn=SVCGRAVITEE,ou=servicesaccounts,dc=auchan,dc=corp" --ldap-password <ldap_password> --ldap-base 'dc=auchan,dc=corp'
```

### Transfer ownership on API or application

* UAT
```
node transfer-ownership.js --url https://gravitee-management-uat.yep.np.internal.auchan.com -u admin -p <password> --filter-by-name 'MyStore' --owner 'XFR1234' --type application
```

* Production
```
node transfer-ownership.js --url http://100.65.130.137/management -u admin -p <password> --filter-by-name 'MyStore' --owner 'XFR1234' --type application
```
