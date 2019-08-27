# [Gravitee.io API Management](https://gravitee.io/products/apim/)'s Management API dedicated scripts

## Prequesities 

Have a ready to run [NodeJS](https://nodejs.org/en/) and [NPM](https://www.npmjs.com/) based environment.
To install yours, [NVM](https://github.com/nvm-sh/nvm) could be a good option:

```bash
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
$ nvm install node --reinstall-packages-from=node
```

> **Note:** At the time of writing, the latest NVM version is v0.34.0. Feel free to update it according to the current latest one.

Finally, install the desired dependencies:

```bash
$ npm install
```

## Script execution

Any script can be executed by using the `node` command line as follows:

```bash
$ node <script>.js [OPTIONS]
```

For instance:

```bash
$ node list-apis.js --url <APIM URL> --username <APIM username> --password <APIM password> --query-filter products
```

For more details about `[OPTIONS]`, ask for help:
```bash
$ node <script>.js -h
```

## Script list

Here are existing scripts :
- [`count-apis.js`](./count-apis.js): Count the number of APIs based on user search predicate.
- [`enable-endpoints.js`](./enable-endpoints.js) : Enable (or disable) API endpoints based on user predicate.
- [`extract-api-quality.js`](./extract-api-quality.js) : Extract API quality compliance as CSV content.
- [`import-api.js`](./import-api.js) : Import existing API (update) depending a search. Import only if search returns exactly one result.
- [`list-activated-logs-apis.js](./list-activated-logs-apis.js) : List all APIs with activated detailed logs. 
- [`list-apis.js`](./list-apis.js) : List all registered APIs by displaying their name and context path.
- [`list-apis-quality.js`](./list-apis-quality.js) : List all registered APIs by displaying their name, context path and quality.
- [`list-applications.js`](./list-applications.js) : List all registered Applications by displaying their name, context path and quality.
- [`list-labels.js`](./list-labels.js) : List labels defined on APIs.

## Script example

```js
const ManagementApiScript = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their name, context path, owner name and owner email.
 *
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApiScript {

    constructor() {
        super(
            'list-apis',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (insensitive regex)",
                    type: 'string'
                },
                'filter-by-plan-name': {
                    describe: "Filter APIs against plan name (insensitive regex)",
                    type: 'string'
                },
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => {
                    return this.hasCommonFilters() ?
                        managementApi.listApis({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path']
                        }, NO_DELAY_PERIOD) :
                        managementApi.listApisDetails({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                            byEndpointName: this.argv['filter-by-endpoint-name'],
                            byEndpointTarget: this.argv['filter-by-endpoint-target'],
                            byPlanName: this.argv['filter-by-plan-name']
                        });
                }),
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('[%s, %s, %s <%s>] %s',
                    api.id,
                    api.context_path,
                    api.owner.displayName,
                    api.owner.email,
                    api.name
                ))
            ));
    }

    hasCommonFilters() {
        return this.argv['filter-by-name'] || this.argv['filter-by-context-path'];
    }
}

new ListApis().run();
```

## Add your own script

All the technical stuff is handled by the [`ManagementApiScript`](./lib/management-api-script.js) class. Then to add your own script, you just have to inherit from it and only define the specific part of your script (i.e., its name and process definition by overridding the associated methods as shown above).