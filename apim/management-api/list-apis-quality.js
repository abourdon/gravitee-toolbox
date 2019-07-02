const ManagementApiScript = require('./lib/management-api-script');
const { convertQualityCriteria } = require('./lib/quality-criteria-converter');
const { flatMap, map } = require('rxjs/operators');
const util = require('util');

/**
 * List all registered APIs quality by displaying their score and successful metrics.
 *
 * @author Alexandre Carbenay
 */
class ListApisQuality extends ManagementApiScript {

    constructor() {
        super(
            'list-apis-quality',
            {
                'filter-by-free-text': {
                    describe: "Filter APIs by a free text (full text search)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (regex)",
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
                })),
                flatMap(api => managementApi.getQuality(api.id).pipe(
                    map(quality => Object.assign({api: api, quality: quality}))
                ))
            )
            .subscribe(this.defaultSubscriber(
                apiQuality => {
                    const reachedCriteria = Array.from(convertQualityCriteria(apiQuality.quality))
                        .filter(criteria => criteria.complied)
                        .reduce((acc, criteria) => acc + criteria.name + ", ", "\t");

                    this.displayRaw(util.format('%s (%s) - %d', apiQuality.api.name, apiQuality.api.context_path, apiQuality.quality.score))
                    if (reachedCriteria.trim().length > 0) {
                        this.displayRaw(reachedCriteria);
                    }
                }
            ));
    }
}
new ListApisQuality().run();