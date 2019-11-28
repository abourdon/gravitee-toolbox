const { CliCommand } = require('./lib/cli-command');
const ElasticSearch = require('./lib/elasticsearch');
const util = require('util');

/**
 * Delete logs corresponding to an API for a time slot.
 *
 * @author Alexandre Carbenay
 */
class DeleteLogs extends CliCommand {

    constructor() {
        super(
            'delete-logs',
            {
                'elasticsearch-url': {
                    describe: 'Elasticsearch base URL',
                    type: 'string',
                    demandOption: true
                },
                'elasticsearch-url-header': {
                    describe: 'Additional HTTP header',
                    type: 'array',
                    demandOption: true
                },
                'elasticsearch-index': {
                    describe: 'Elasticsearch request index',
                    type: 'string',
                    default: 'gravitee-request-*',
                    demandOption: true
                },
                'api-id': {
                    describe: "API UUID",
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

    /**
     * Override specific options as we don't need to deal with APIM but only with ElasticSearch
     *
     * TODO: Ask GraviteeSource to add a way to delete logs from APIM instead of directly passing from ElasticSearch
     *
     * @returns {Object}
     */
    get options() {
        return this.specificOptions;
    }

    definition(managementApi) {
        const elasticsearch = ElasticSearch.createInstance(new ElasticSearch.Settings(this.argv['elasticsearch-url'], this.argv['elasticsearch-url-header']));

        elasticsearch.deleteByQuery(
            this.argv['elasticsearch-index'],
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
