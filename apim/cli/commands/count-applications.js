const {CliCommand} = require('./lib/cli-command');
const { count, flatMap } = require('rxjs/operators');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * Count number of available Applications for the given user
 *
 * @author Alexandre Carbenay
 */
class CountApplications extends CliCommand {

    constructor() {
        super(
            'count-applications',
            'Count number of available Applications for the given user',
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(() => managementApi.listApplications(NO_DELAY_PERIOD)),
                count()
            )
            .subscribe(this.defaultSubscriber(
                apiCount => this.displayRaw(util.format('There are %s applications in the requested environment', apiCount))
            ));
    }
}
new CountApplications().run();