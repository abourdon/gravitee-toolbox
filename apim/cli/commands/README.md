# [Gravitee.io API Management](https://gravitee.io/products/apim/) CLI commands

## Prerequisites 

Have a ready to run [NodeJS](https://nodejs.org/en/) and [NPM](https://www.npmjs.com/) based environment.
To install yours, [NVM](https://github.com/nvm-sh/nvm) could be a good option:

```bash
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
$ nvm install 12.0
```

> **Note:** At the time of writing, the latest NVM version is v0.34.0. Feel free to update it according to the current latest one.

Finally, install the desired dependencies:

```bash
$ npm install
```

## CLI command execution

In addition to be executed directly from the [gravitee-cli.sh](../gravitee-cli.sh) CLI, any command is actually a NodeJS script that can be executed as follow:

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

## CLI command development example

```js
const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {flatMap, map} = require('rxjs/operators');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered APIs by displaying their ID, name, context path, owner name and owner email, in CSV format.
 *
 * @author Aurelien Bourdon
 */
class ListApis extends CliCommand {

    constructor() {
        super(
            'list-apis',
            'List all registered APIs by displaying their ID, name, context path, owner name and owner email, in CSV format',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                },
                'filter-by-primary-owner': {
                    describe: "Filter APIs against its primary owner name or address (insensitive regex)",
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
                'filter-by-policy-technical-name': {
                    describe: 'Filter APIs against their policy technical names (insensitive regex) (see https://docs.gravitee.io/apim_policies_overview.html for more details)'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List APIs according to filters
                flatMap(_token => {
                    return this.hasBasicsFiltersOnly() ?
                        managementApi.listApisBasics({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byPrimaryOwner: this.argv['filter-by-primary-owner']
                        }, NO_DELAY_PERIOD) :
                        managementApi.listApisDetails({
                            byName: this.argv['filter-by-name'],
                            byContextPath: this.argv['filter-by-context-path'],
                            byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                            byEndpointName: this.argv['filter-by-endpoint-name'],
                            byEndpointTarget: this.argv['filter-by-endpoint-target'],
                            byPlanName: this.argv['filter-by-plan-name'],
                            byPolicyTechnicalName: this.argv['filter-by-policy-technical-name']
                        });
                }),

                // Format result so that it can be handle by CsvCliCommandReporter
                map(api => [
                    api.id,
                    api.name,
                    api.context_path,
                    api.owner.displayName,
                    api.owner.email
                ])
            )
            .subscribe(new CsvCliCommandReporter([
                'API id',
                'API name',
                'API context path',
                'API owner name',
                'API owner email'
            ], this));

    }

    hasBasicsFiltersOnly() {
        return Object.keys(this.argv)
            .filter(argv => argv.startsWith("filter-by")
                && argv !== 'filter-by-name'
                && argv !== 'filter-by-context-path'
                && argv !== 'filter-by-primary-owner'
            ).length === 0;
    }
}

new ListApis().run();
```

## Add your own CLI command

All the technical stuff is handled by the [`CliCommand`](lib/cli-command.js) class. Then to add your own CLI command, you just have to inherit from it and only define the specific part of your command (i.e., its name and process definition by overriding the associated methods as shown above).
