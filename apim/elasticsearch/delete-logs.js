const ElasticSearchScript = require('./lib/elasticsearch-script');
const util = require('util');

/**
 * Delete logs corresponding to an API for a time slot.
 *
 * @author Alexandre Carbenay
 */
class DeleteLogs extends ElasticSearchScript {

    constructor() {
        super(
            'delete-logs',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
                'es-log-index': {
                    describe: "Elastic search log index",
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
        elasticsearch.deleteByQuery(
            this.argv['es-log-index'],
            this.argv['from'],
            this.argv['to'],
            [["_type", "log"], ["api", this.argv['api-id']]]
         ).subscribe(this.defaultSubscriber(
            deletionResult => {
                this.displayInfo(util.format('Deleted %d logs', deletionResult.deleted));
            }
        ));
    }
}
new DeleteLogs().run();
