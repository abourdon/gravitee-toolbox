const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {count, filter, mergeMap, map} = require('rxjs/operators');
const {SUBSCRIPTION_STATUS} = require('./lib/management-api');

const NO_DELAY_PERIOD = 0;

/**
 * List all APIs with no active subscription by displaying their ID, name, context path, owner name and owner email, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListNonSubscribedApis extends CliCommand {

    constructor() {
        super(
            'list-non-subscribed-apis',
            'List all APIs with no active subscription by displaying their ID, name, context path, owner name and owner email, in CSV format',
            {
                'filter-by-name': {
                    describe: "Filter APIs against their name (insensitive regex)",
                    type: 'string'
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (insensitive regex)",
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List APIs by getting basic information
                mergeMap(_token => managementApi.listApisBasics({
                    byName: this.argv['filter-by-name'],
                    byContextPath: this.argv['filter-by-context-path']
                }, NO_DELAY_PERIOD)),

                // Only keep those without subscription
                mergeMap(api => managementApi.getApiSubscriptions(api.id, [SUBSCRIPTION_STATUS.ACCEPTED, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAUSED]).pipe(
                    count(),
                    filter(count => count === 0),
                    map(count => api)
                )),

                // Finally format result in order for CsvCliCommandReporter
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
                ], this
            ));
    }
}

new ListNonSubscribedApis().run();
