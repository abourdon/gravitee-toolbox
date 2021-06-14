const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {count, filter, mergeMap, map} = require('rxjs/operators');
const {SUBSCRIPTION_STATUS} = require('./lib/management-api');

const NO_DELAY_PERIOD = 0;

/**
 * List all applications with no active subscription by displaying their ID name, owner name and owner email, in CSV format.
 *
 * @author Alexandre Carbenay
 */
class ListNonSubscribedApplications extends CliCommand {

    constructor() {
        super(
            'list-non-subscribed-applications',
            'List all applications with no active subscription by displaying their ID name, owner name and owner email, in CSV format'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List applications
                mergeMap(_token => managementApi.listApplications(NO_DELAY_PERIOD)),

                // Only keep those without subscription
                mergeMap(application => managementApi.getApplicationSubscriptions(application.id, [SUBSCRIPTION_STATUS.ACCEPTED, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAUSED]).pipe(
                    count(),
                    filter(count => count === 0),
                    map(count => application)
                )),

                // Finally format result in order for CsvCliCommandReporter
                map(application => [
                    application.id,
                    application.name,
                    application.owner.displayName,
                    application.owner.email
                ])
            )
            .subscribe(new CsvCliCommandReporter([
                'Application id',
                'Application name',
                'Application owner name',
                'Application owner email'
            ], this));
    }
}

new ListNonSubscribedApplications().run();
