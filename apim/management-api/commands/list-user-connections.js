const {CliCommand, CliCommandReporter} = require('./lib/cli-command');
const ManagementApi = require('./lib/management-api');
const {flatMap, groupBy, count} = require('rxjs/operators');
const util = require('util');

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
                groupBy(event => event.properties.USER),
                flatMap(userEvent => managementApi.getUser(userEvent.key))
            )
            .subscribe(new ListUserConnectionsCSVReporter(this));
    }

}

/**
 * Report results in CSV format
 */
class ListUserConnectionsCSVReporter extends CliCommandReporter {

    static formatEmail(email) {
        return email ? email : 'N/A';
    }

    constructor(cliCommand) {
        super(cliCommand);
        this.users = [];
    }

    doNext(user) {
        this.cliCommand.displayInfo(util.format('User %s (%s) found', user.displayName, ListUserConnectionsCSVReporter.formatEmail(user.email)));
        this.users.push(user);
    }

    doComplete() {
        this.cliCommand.displayInfo('List of user connections (in CSV format):');
        // CSV header
        this.cliCommand.displayRaw('Id, Display name, Email, Source');
        // CSV line users
        this.users.forEach(user => this.cliCommand.displayRaw(util.format(
            '%s, %s, %s, %s',
            user.id,
            user.displayName,
            ListUserConnectionsCSVReporter.formatEmail(user.email),
            user.source
        )));
    }

}

new ListUserConnections().run();