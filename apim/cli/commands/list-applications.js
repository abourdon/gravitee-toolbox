const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {mergeMap, map} = require('rxjs/operators');

const NO_DELAY_PERIOD = 0;

/**
 * List all registered Applications by displaying their ID, name, owner name and owner email, in CSV format.
 *
 * @author Aurelien Bourdon
 */
class ListApplications extends CliCommand {

    constructor() {
        super(
            'list-applications',
            'List all registered Applications by displaying their ID, name, owner name and owner email, in CSV format',
            {
                'filter-by-primary-owner': {
                    describe: "Filter APIs against its primary owner name or address (insensitive regex)",
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List applications
                mergeMap(() => managementApi.listApplications({ 
                    byPrimaryOwner: this.argv['filter-by-primary-owner']
                }, NO_DELAY_PERIOD)),

                // Format event so that it can be handle by CsvCliCommandReporter
                map(app => [
                    app.id,
                    app.name,
                    app.owner.displayName,
                    app.owner.email
                ])
            )
            .subscribe(new CsvCliCommandReporter([
                'Application ID',
                'Application name',
                'Application owner name',
                'Application owner email'
            ], this));
    }
}

new ListApplications().run();
