const ElasticSearchScript = require('./lib/elasticsearch-script');
const { of } = require('rxjs');
const { bufferCount, flatMap, groupBy, map, toArray } = require('rxjs/operators');
const util = require('util');

// ES response status ignored for log ids logging.
const ignoredStatus = [200, 404];

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
                'es-request-index': {
                    describe: "Elastic search request index",
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
                },
                'page-size': {
                    describe: "Page size for search",
                    type: 'number',
                    default: 100
                },
                'bulk-delete-size': {
                    describe: "Bulk size to delete logs",
                    type: 'number',
                    default: 1000
                }
            }
        );
    }

    definition(elasticsearch) {
        elasticsearch.searchHits(
            this.argv['es-request-index'],
            this.argv['from'],
            this.argv['to'],
            [["_type", "request"], ["api", this.argv['api-id']]],
            this.argv['page-size']
         ).pipe(
            map(hit => hit._id),
            bufferCount(this.argv['bulk-delete-size']),
            flatMap(hitIds => elasticsearch.bulkDelete(hitIds, this.argv['es-log-index'], 'log')),
            groupBy(deletedItem => deletedItem.status, deletedItem => deletedItem._id),
            flatMap(group => group.pipe(toArray(), map(ids => Object.assign({ status: group.key, ids: ids }))))
        ).subscribe(this.defaultSubscriber(
            deletionGroup => {
                const status = deletionGroup.status;
                const ids = deletionGroup.ids;
                this.displayInfo(util.format('[%d]: %d logs', status, ids.length));
                if (!ignoredStatus.includes(status)) {
                    this.displayRaw(ids);
                }
            }
        ));
    }
}
new DeleteLogs().run();
