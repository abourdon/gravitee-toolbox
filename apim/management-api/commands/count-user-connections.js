const CliCommand = require('./lib/cli-command');
const ManagementApi = require('./lib/management-api');
const {flatMap, groupBy, count} = require('rxjs/operators');
const util = require('util');

/**
 * Count number of connection to the APIM (both portal and management console)
 *
 * @author Aurelien Bourdon
 */
class CountUserConnections extends CliCommand {

    constructor() {
        super(
            'count-portal-connections',
            {
                'from': {
                    describe: "Start date from which start the search, in YYYY-MM-DDTHH:mm:ss.sssZ format",
                    type: 'string',
                    demandOption: true
                },
                'to': {
                    describe: "To date from which stop the search, in YYYY-MM-DDTHH:mm:ss.sssZ format (now by default)",
                    type: 'string'
                },
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
                    )
                }),
                groupBy(event => event.properties.USER),
                count()
            )
            .subscribe(this.defaultSubscriber(
                count => this.displayRaw(util.format(
                    'Number of distinct connected users from "%s" to "%s": %s',
                    fromDate.toISOString(),
                    toDate.toISOString(),
                    count
                ))
            ));
    }

}

new CountUserConnections().run();