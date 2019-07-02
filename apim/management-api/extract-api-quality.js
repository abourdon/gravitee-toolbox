const ManagementApiScript = require('./lib/management-api-script');
const { convertQualityCriteria } = require('./lib/quality-criteria-converter');
const { filter, flatMap, map } = require('rxjs/operators');
const util = require('util');

/**
 * Extract quality criteria compliance corresponding to an API as a CSV content.
 *
 * @author Alexandre Carbenay
 */
class ExtractApiQuality extends ManagementApiScript {

    constructor() {
        super(
            'extract-api-quality',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => managementApi.getQuality(this.argv['api-id'])),
                map(quality => convertQualityCriteria(quality))
            )
            .subscribe(this.defaultSubscriber(
                criteria => {
                    this.displayRaw("CSV content:");
                    this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.reference + ",", ""));
                    this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""));
                }
            ));
    }
}
new ExtractApiQuality().run();