const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const {flatMap, map} = require('rxjs/operators');

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
            'List all registered Applications by displaying their ID, name, owner name and owner email, in CSV format'
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List applications
                flatMap(() => managementApi.listApplications(NO_DELAY_PERIOD)),

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