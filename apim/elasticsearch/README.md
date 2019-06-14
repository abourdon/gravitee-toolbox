# [Gravitee.io API Management](https://gravitee.io/products/apim/)'s Elasticsearch dedicated scripts

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
$ node delete-logs.js --url <ES URL> --api-id <API ID> --es-index <ES INDEX> --from '2019-07-01T09:00:00+02:00' --to '2019-07-01T10:00:00+02:00'
```

For more details about `[OPTIONS]`, ask for help:
```bash
$ node <script>.js -h
```

## Script list

Here are existing scripts :
- `delete-logs.js` : Delete logs for an API in a time range.

## Script example

```js
const ElasticSearchScript = require('./lib/elasticsearch-script');
const { of, zip } = require('rxjs');
const { map, toArray } = require('rxjs/operators');
const util = require('util');

/**
 * List requests corresponding to an API for a time slot.
 *
 * @author Alexandre Carbenay
 */
class ListRequests extends ElasticSearchScript {

    constructor() {
        super(
            'list-requests',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
                'es-index': {
                    describe: "Elastic search index",
                    type: 'string',
                    demandOption: true
                },
                'from': {
                    describe: "Search for logs inside time range starting from this value",
                    type: 'string',
                    demandOption: true
                },
                'to': {
                    describe: "Search for logs inside time range ending at this value",
                    type: 'string',
                    default: 'now'
                }
            }
        );
    }

    definition(elasticsearch) {
        elasticsearch.searchHits(
            this.argv['es-index'],
            this.argv['from'],
            this.argv['to'],
            [["_type", "request"], ["api", this.argv['api-id']]]
        ).pipe(
            map(hit => hit._id),
            toArray()
        ).subscribe(this.defaultSubscriber(
            requests => {
                this.displayInfo(util.format('Requests on API %s between %s and %s: %d', this.argv['api-id'], this.argv['from'], this.argv['to'], requests.length));
                this.displayRaw(requests);
            }
        ));
    }
}
new ListRequests().run();
```

## Add your own script

All the technical stuff is handled by the [`ElasticSearchScript`](./lib/elasticsearch-script.js) class. Then to add your own script, you just have to inherit from it and only define the specific part of your script (i.e., its name and process definition by overridding the associated methods as shown above).