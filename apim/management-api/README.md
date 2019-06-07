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
- `enable-endpoints.js` : Enable (or disable) API endpoints based on user predicate
- `import-api.js` : Import existing API (update) depending a search. Import only if search returns exactly one result. 
- `list-apis.js` : List all registered APIs by displaying their name and context path.

## Script example

```js
const ManagementApiScript = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util');

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApiScript {

    constructor() {
        super(
            'list-apis',
            {
                'filter-by-free-text': {
                    describe: "Filter APIs by a free text (full text search)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (regex)",
                    type: 'string'
                },
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.listApis({
                    byFreeText: this.argv['filter-by-free-text'],
                    byContextPath: this.argv['filter-by-context-path'],
                    byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                    byEndpointName: this.argv['filter-by-endpoint-name'],
                    byEndpointTarget: this.argv['filter-by-endpoint-target'],
                }))
            )
            .subscribe(this.defaultSubscriber(
                api => this.displayRaw(util.format('%s (%s)', api.name, api.proxy.context_path))
            ));
    }
}
new ListApis().run();
```

## Add your own script

All the technical stuff is handled by the [`Script`](./lib/management-api-script.js) class. Then to add your own script, you just have to inherit from it and only define the specific part of your script (i.e., its name and process definition by overridding the associated methods as shown above).