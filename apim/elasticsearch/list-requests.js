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
            map(hit => hit.hit._id),
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