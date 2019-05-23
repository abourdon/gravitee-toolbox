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

For more details about `[OPTIONS]`, ask for help:
```bash
$ node <script>.js -h
```

## Script example

```js
const ManagementApi = require('./lib/management-api-script');
const { flatMap } = require('rxjs/operators');
const util = require('util')

/**
 * List all registered APIs by displaying their name and context path.
 * 
 * @author Aurelien Bourdon
 */
class ListApis extends ManagementApi.Script {
    get name() {
        return 'list-apis';
    }

    definition(managementApi) {
        managementApi
            .login()
            .pipe(
                flatMap(_token => managementApi.listApis(this.argv.q)),
                flatMap(api => managementApi.export(api.id))
            )
            .subscribe(this.defaultSubscriber(
                api => console.log(util.format('%s (%s)', api.name, api.proxy.context_path))
            ));
    }
}
new ListApis({
    'q': {
        alias: 'query-filter',
        describe: "String used to filter API list query (optional)",
        type: 'string'
    }
}).run();
```

## Add your own script

All the technical stuff is handled by the [`Script`](./lib/management-api-script.js) class. Then to add your own script, you just have to inherit from it and only define the specific part of your script (i.e., its name and process definition by overridding the associated methods as shown above).