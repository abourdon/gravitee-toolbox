const {CliCommand, CsvCliCommandReporter} = require('./lib/cli-command');
const ManagementApi = require('./lib/management-api');
const {flatMap, groupBy, map} = require('rxjs/operators');

/**
 * List user connections during a given timeslot. Result is in CSV format.
 *
 * @author Aurelien Bourdon
 */
class ListUserConnections extends CliCommand {

    constructor() {
        super(
            'list-user-connections',
            {
                'from': {
                    describe: 'Start date from which start the search, in YYYY-MM-DDTHH:mm:ss.sssZ format',
                    type: 'string',
                    demandOption: true
                },
                'to': {
                    describe: 'To date from which stop the search, in YYYY-MM-DDTHH:mm:ss.sssZ format (now by default)',
                    type: 'string'
                },
                'request-page-init': {
                    describe: 'Page number of the first request (default 1)',
                    type: 'number',
                    default: 1
                },
                'request-page-delay': {
                    describe: 'Delay between paged requests (in ms, default 0, means no delay)',
                    type: 'number',
                    default: 0
                },
                'request-page-size': {
                    describe: 'Size of pages for each request (default 2000)',
                    type: 'number',
                    default: 2000
                }
            }
        );
    }

    definition(managementApi) {
        const fromDate = new Date(Date.parse(this.argv['from']));
        const toDate = this.argv['to'] ? new Date(Date.parse(this.argv['to'])) : new Date();
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                // List audits
                flatMap(_token => {
                    return managementApi.listAudits(
                        ManagementApi.EVENT_TYPE.USER_CONNECTED,
                        fromDate.getTime(),
                        toDate.getTime(),
                        this.argv['request-page-init'],
                        this.argv['request-page-size'],
                        this.argv['request-page-delay']
                    )
                }),

                // Distinct by users
                groupBy(event => event.properties.USER),

                // Retrieve details for each user
                flatMap(userEvent => managementApi.getUser(userEvent.key)),

                // Finally order user information to be taken into account by the CsvCliCommandReporter
                map(user => [user.id, user.displayName, user.email ? user.email : 'N/A', user.source])
            )
            .subscribe(new CsvCliCommandReporter(['Id', 'Display name', 'Email', 'Source'], this));
    }

}

new ListUserConnections().run();